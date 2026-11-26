// Auto-pilot: watch a list of Twitch streamers / categories and YouTube channels, send the most hyped recent stream or
// video to the normal clipping pipeline, and when it finishes, schedule its best clips at fixed daily release times.
// Off until the owner turns it on. It only creates projects and calendar entries: uploads stay the calendar's job, so
// the upload log, the daily YouTube quota and the "never post the same moment twice" checks all still apply.
import fs from 'node:fs';import path from 'node:path';import {writeJsonAtomic} from './atomic.mjs';
import {helix,parseDuration} from './twitch-clips.mjs';import {parseSourceUrl,jobSource} from './sources.mjs';import {validateOptions} from './options.mjs';
import {EDIT_TEMPLATES} from './templates.mjs';import {autoPostJob} from './autopost.mjs';

export const AUTOPILOT_DEFAULTS={enabled:false,everyHours:4,lookbackHours:24,maxSourcesPerRun:1,minViews:5000,twitch:{channels:[],categories:[]},youtube:{channels:[]},
 perDay:6,times:['02:00','06:00','10:00','14:00','18:00','22:00'],timeZone:'Asia/Manila',template:'context-hit',outputFormat:'shorts',count:8,picker:'heuristic',titleStyle:'ai',madeForKids:false,skipWarnings:true};
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/,LOGIN=/^[a-z0-9_]{3,25}$/;
const int=(v,lo,hi,msg)=>{const n=Number(v);if(!Number.isInteger(n)||n<lo||n>hi)throw new Error(msg);return n;};
const list=(v,max,msg)=>{if(!Array.isArray(v))throw new Error(msg);const out=[...new Set(v.map(s=>String(s).trim()).filter(Boolean))];if(out.length>max)throw new Error(msg);return out;};

/** Checked config. Unknown keys are dropped; every limit says what is allowed. */
export function validateAutopilot(input={}){
 const s={...AUTOPILOT_DEFAULTS,...input,twitch:{...AUTOPILOT_DEFAULTS.twitch,...(input.twitch||{})},youtube:{...AUTOPILOT_DEFAULTS.youtube,...(input.youtube||{})}};
 if(typeof s.enabled!=='boolean'||typeof s.madeForKids!=='boolean'||typeof s.skipWarnings!=='boolean')throw new Error('Invalid Auto-pilot switch');
 const channels=list(s.twitch.channels,30,'Watch at most 30 Twitch streamers').map(c=>c.toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//,'').replace(/\/.*$/,''));
 const bad=channels.find(c=>!LOGIN.test(c));if(bad)throw new Error(`"${bad}" is not a Twitch login (letters, numbers and _ only)`);
 const times=list(s.times,6,'Choose 1–6 daily release times').sort();if(!times.length||times.some(t=>!TIME.test(t)))throw new Error('Choose 1–6 daily release times (HH:MM)');
 if(!EDIT_TEMPLATES.some(t=>t.id===s.template))throw new Error('Choose a template');
 if(!['shorts','video'].includes(s.outputFormat))throw new Error('Choose portrait or landscape');
 if(!['heuristic','openai','anthropic'].includes(s.picker))throw new Error('Invalid clip picker');
 if(!['ai','hook'].includes(s.titleStyle))throw new Error('Invalid title style');
 if(s.timeZone!=='Asia/Manila')throw new Error('Release times use Manila time for now');
 return {enabled:s.enabled,everyHours:int(s.everyHours,1,24,'Check every 1–24 hours'),lookbackHours:int(s.lookbackHours,6,72,'Look back 6–72 hours'),
  maxSourcesPerRun:int(s.maxSourcesPerRun,1,3,'Clip 1–3 sources per run'),minViews:int(s.minViews,0,1e9,'Minimum views must be 0 or more'),
  twitch:{channels,categories:list(s.twitch.categories,10,'Watch at most 10 Twitch categories')},youtube:{channels:list(s.youtube.channels,30,'Watch at most 30 YouTube channels')},
  perDay:Math.min(int(s.perDay,1,6,'Schedule 1–6 clips a day'),times.length),times,timeZone:s.timeZone,template:s.template,outputFormat:s.outputFormat,
  count:int(s.count,3,24,'Find 3–24 clips per source'),picker:s.picker,titleStyle:s.titleStyle,madeForKids:s.madeForKids,skipWarnings:s.skipWarnings};
}
export const autopilotFile=root=>path.join(root,'posting','autopilot.json');
/** The whole file: {config, used, log}. Broken or missing files give the defaults. */
export function readAutopilot(root){let raw={};try{raw=JSON.parse(fs.readFileSync(autopilotFile(root),'utf8'));}catch{}
 let config;try{config=validateAutopilot(raw.config||{});}catch{config={...AUTOPILOT_DEFAULTS};}
 return {config,used:Array.isArray(raw.used)?raw.used.slice(0,200):[],log:Array.isArray(raw.log)?raw.log.slice(0,200):[]};}
function writeAutopilot(root,data){fs.mkdirSync(path.dirname(autopilotFile(root)),{recursive:true});writeJsonAtomic(autopilotFile(root),{config:data.config,used:data.used.slice(0,200),log:data.log.slice(0,200)});return data;}
export const loadAutopilot=root=>readAutopilot(root).config;
export function saveAutopilot(root,input){const d=readAutopilot(root);d.config=validateAutopilot(input);writeAutopilot(root,d);return d.config;}
export const sourcesReady=(env=process.env)=>({twitch:!!(env.TWITCH_CLIENT_ID&&env.TWITCH_CLIENT_SECRET),youtube:!!env.YOUTUBE_API_KEY});

/** 0–100: views, the clips viewers made (×10) and live viewers (×50), on a log scale where ~10M combined is 100. */
export const hypeScore=({views=0,clipViews=0,viewers=0})=>Math.round(100*Math.min(1,Math.log10(1+views+clipViews*10+viewers*50)/7));
const weight=c=>(c.views||0)+(c.clipViews||0)*10+(c.viewers||0)*50;
export function isoSeconds(d){const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(d||''));if(!m)return 0;return (+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0);}

async function scoutTwitch(config,{env,fetchImpl,now,errors}){
 const since=new Date(now-config.lookbackHours*3600e3).toISOString(),out=[];let calls=0;const MAX_CALLS=60;
 const call=async(route,params)=>{if(++calls>MAX_CALLS)throw new Error('budget');return helix(route,params,{env,fetchImpl});};
 // Who to look at: the watched logins, plus the top live streamers of each watched category.
 const who=new Map();// login -> {id,name,viewers}
 if(config.twitch.channels.length){try{const users=(await call('users',config.twitch.channels.map(l=>['login',l]))).data||[];for(const u of users)who.set(u.login,{id:u.id,name:u.display_name||u.login,viewers:0});
   for(const l of config.twitch.channels)if(!who.has(l))errors.push(`Twitch has no streamer called "${l}"`);
   const live=(await call('streams',config.twitch.channels.map(l=>['user_login',l]).concat([['first','100']]))).data||[];for(const s of live){const w=who.get(s.user_login);if(w)w.viewers=s.viewer_count||0;}}
  catch(e){if(e.message!=='budget')errors.push(`Twitch: ${e.message}`);}}
 for(const name of config.twitch.categories){try{const game=(await call('games',{name})).data?.[0];if(!game){errors.push(`Twitch has no category called "${name}"`);continue;}
   const streams=((await call('streams',{game_id:game.id,first:'20'})).data||[]).sort((a,b)=>(b.viewer_count||0)-(a.viewer_count||0)).slice(0,5);
   for(const s of streams)if(!who.has(s.user_login))who.set(s.user_login,{id:s.user_id,name:s.user_name||s.user_login,viewers:s.viewer_count||0});}
  catch(e){if(e.message==='budget')break;errors.push(`Twitch category "${name}": ${e.message}`);}}
 for(const [login,u] of who){try{
   const vods=(await call('videos',{user_id:u.id,type:'archive',first:'3'})).data||[];const recent=vods.filter(v=>Date.parse(v.created_at)>=Date.parse(since));const vod=recent[0]||(u.viewers?vods[0]:null);if(!vod)continue;
   const clips=(await call('clips',{broadcaster_id:u.id,started_at:since,first:'100'})).data||[];
   const c={platform:'twitch',url:`https://www.twitch.tv/videos/${vod.id}`,title:vod.title||`${u.name} stream`,creator:u.name,views:vod.view_count||0,viewers:u.viewers,clipViews:clips.reduce((n,x)=>n+(x.view_count||0),0),publishedAt:vod.created_at,durationSeconds:parseDuration(vod.duration)||0};
   out.push({...c,hype:hypeScore(c)});}
  catch(e){if(e.message==='budget')break;errors.push(`Twitch "${login}": ${e.message}`);}}
 return out;
}

const YT='https://www.googleapis.com/youtube/v3';
async function yt(route,params,{env,fetchImpl}){const url=`${YT}/${route}?${new URLSearchParams({...params,key:env.YOUTUBE_API_KEY})}`;
 const r=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});const body=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(body?.error?.errors?.[0]?.reason==='quotaExceeded'?'YouTube API quota used up for today':r.status===400||r.status===403?'YouTube rejected YOUTUBE_API_KEY (check it and that YouTube Data API v3 is enabled)':`YouTube API ${route} failed (${r.status})`);return body;}
/** "@name", "UC…", or a channel link → the params for channels.list. */
export function channelQuery(text){const t=String(text).trim();const id=/(UC[\w-]{22})/.exec(t)?.[1];if(id)return {id};const handle=/@([\w.-]{3,30})/.exec(t)?.[1]||(/^[\w.-]{3,30}$/.test(t)?t:null);return handle?{forHandle:`@${handle}`}:null;}
async function scoutYouTube(config,{env,fetchImpl,now,errors}){
 const since=now-config.lookbackHours*3600e3,ids=[];
 for(const ch of config.youtube.channels){const q=channelQuery(ch);if(!q){errors.push(`"${ch}" is not a YouTube channel handle, id or link`);continue;}
  try{const item=(await yt('channels',{part:'contentDetails,snippet',...q},{env,fetchImpl})).items?.[0];if(!item){errors.push(`YouTube has no channel "${ch}"`);continue;}
   const uploads=item.contentDetails?.relatedPlaylists?.uploads;if(!uploads)continue;
   // The uploads playlist costs 1 quota unit; search.list would cost 100.
   const items=(await yt('playlistItems',{part:'contentDetails',playlistId:uploads,maxResults:'10'},{env,fetchImpl})).items||[];
   for(const it of items)if(Date.parse(it.contentDetails?.videoPublishedAt||0)>=since)ids.push(it.contentDetails.videoId);}
  catch(e){errors.push(`YouTube "${ch}": ${e.message}`);if(/quota|rejected/.test(e.message))break;}}
 const out=[];
 for(let i=0;i<ids.length;i+=50){try{const vids=(await yt('videos',{part:'snippet,statistics,contentDetails',id:ids.slice(i,i+50).join(',')},{env,fetchImpl})).items||[];
   for(const v of vids){const seconds=isoSeconds(v.contentDetails?.duration);if(seconds<300)continue;// Shorts and very short uploads have nothing to clip
    if(v.snippet?.liveBroadcastContent&&v.snippet.liveBroadcastContent!=='none')continue;
    const c={platform:'youtube',url:`https://www.youtube.com/watch?v=${v.id}`,title:v.snippet?.title||'',creator:v.snippet?.channelTitle||'',views:Number(v.statistics?.viewCount||0),viewers:0,clipViews:0,publishedAt:v.snippet?.publishedAt||'',durationSeconds:seconds};
    out.push({...c,hype:hypeScore(c)});}}
  catch(e){errors.push(`YouTube videos: ${e.message}`);break;}}
 return out;
}

/** Recent streams and videos on the watchlist, most hyped first: {candidates, errors}. One bad channel never stops the rest. */
export async function scout(config,{env=process.env,fetchImpl=fetch,now=Date.now()}={}){
 const errors=[],ready=sourcesReady(env),wantsTwitch=config.twitch.channels.length||config.twitch.categories.length,wantsYouTube=config.youtube.channels.length;
 if(wantsTwitch&&!ready.twitch)errors.push('Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Settings → Sources to watch Twitch');
 if(wantsYouTube&&!ready.youtube)errors.push('Add YOUTUBE_API_KEY in Settings → Sources to watch YouTube');
 const [tw,yt]=await Promise.all([wantsTwitch&&ready.twitch?scoutTwitch(config,{env,fetchImpl,now,errors}):[],wantsYouTube&&ready.youtube?scoutYouTube(config,{env,fetchImpl,now,errors}):[]]);
 const seen=new Set(),candidates=[...tw,...yt].filter(c=>{if(seen.has(c.url))return false;seen.add(c.url);return weight(c)>=config.minViews;}).sort((a,b)=>b.hype-a.hype||weight(b)-weight(a));
 return {candidates,errors};
}

const DONE=['complete','failed','cancelled','interrupted'];
export class AutopilotEngine{
 constructor({store,queue,posting,youtube,root=store.root,env=process.env,fetchImpl=fetch,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,autoPost=autoPostJob}){
  Object.assign(this,{store,queue,posting,youtube,root,env,fetchImpl,now,setTimer,clearTimer,autoPost});
  this.state={running:false,nextRunAt:null,lastRunAt:null,lastError:null,lastCandidates:[]};this.timer=null;this.busy=null;this.handled=new Set();
 }
 config(){return loadAutopilot(this.root);}
 log(level,message){const d=readAutopilot(this.root);d.log.unshift({at:new Date(this.now()).toISOString(),level,message:String(message).slice(0,300)});writeAutopilot(this.root,d);}
 status(){return {...this.state};}
 /** (Re)start the timer from the saved config: the first run 30 s after turning on, then every `everyHours`. */
 start(){this.stop();if(!this.config().enabled)return;this.state.running=true;this.schedule(30e3);}
 stop(){if(this.timer)this.clearTimer(this.timer);this.timer=null;this.state.running=false;this.state.nextRunAt=null;}
 schedule(ms){this.state.nextRunAt=new Date(this.now()+ms).toISOString();this.timer=this.setTimer(async()=>{try{await this.tick();}catch{}if(this.state.running)this.schedule(this.config().everyHours*3600e3);},ms);this.timer?.unref?.();}
 /** Clips already waiting in the calendar for a future release. */
 backlog(){const now=this.now();return this.posting.list().filter(p=>p.state==='draft'&&p.settings?.privacy==='schedule'&&Date.parse(p.settings.publishAt)>now).length;}
 /** One project from a link, with the Auto-pilot template and counts; marked so its clips get scheduled when it finishes. */
 startJob(url,meta={}){const c=this.config(),env=this.env,picker=c.picker==='anthropic'&&!env.ANTHROPIC_API_KEY||c.picker==='openai'&&!env.OPENAI_API_KEY?'heuristic':c.picker;
  const source=jobSource(parseSourceUrl(url)),options=validateOptions({editTemplate:c.template,outputFormat:c.outputFormat,count:c.count,picker});
  const job=this.store.create(source,options),at=new Date(this.now()).toISOString();
  this.store.update(job.id,{autopilot:{url,at,platform:meta.platform||source.type,title:meta.title||'',creator:meta.creator||''}});this.queue?.enqueue(job.id);
  const d=readAutopilot(this.root);d.used=[{url,platform:meta.platform||source.type,title:meta.title||'',creator:meta.creator||'',at,jobId:job.id},...d.used.filter(u=>u.url!==url)];writeAutopilot(this.root,d);
  return this.store.get(job.id);}
 clipUrl(url){if(!/^https?:\/\//.test(url))throw new Error('Paste a Twitch or YouTube link');const meta=this.state.lastCandidates.find(c=>c.url===url)||{};const job=this.startJob(url,meta);this.log('info',`Clipping ${meta.title||url} (started by hand)`);return job;}
 /** Scout the watchlist; unless `dryRun`, send the top fresh sources to clipping. Runs never overlap. */
 tick({dryRun=false}={}){if(this.busy)return this.busy;this.busy=this.run(dryRun).finally(()=>{this.busy=null;});return this.busy;}
 async run(dryRun){
  const c=this.config(),used=new Set(readAutopilot(this.root).used.map(u=>u.url));
  const {candidates,errors}=await scout(c,{env:this.env,fetchImpl:this.fetchImpl,now:this.now()});
  const marked=candidates.map(x=>({...x,used:used.has(x.url)}));this.state.lastCandidates=marked.slice(0,20);
  const result={candidates:marked,started:[],skipped:[],errors};if(dryRun)return result;
  this.state.lastRunAt=new Date(this.now()).toISOString();
  const fresh=marked.filter(x=>!x.used),pending=this.store.list().filter(j=>j.autopilot&&!DONE.includes(j.status)).length,backlog=this.backlog();
  let reason='';if(backlog>=c.perDay*2)reason=`the calendar already holds ${backlog} clips (two days' worth)`;else if(pending>=c.maxSourcesPerRun)reason='still clipping the last source';
  for(const x of fresh.slice(0,c.maxSourcesPerRun)){if(reason){result.skipped.push({url:x.url,reason});continue;}
   try{const job=this.startJob(x.url,x);result.started.push({jobId:job.id,url:x.url,title:x.title});this.log('info',`Clipping "${x.title}" by ${x.creator} (hype ${x.hype})`);}
   catch(e){errors.push(`${x.title||x.url}: ${e.message}`);}}
  if(!candidates.length&&!errors.length)this.log('info','Nothing on the watchlist passed the hype bar this time');
  else if(!fresh.length&&candidates.length)this.log('info','Everything hot right now was already clipped');
  if(reason&&fresh.length)this.log('info',`Waiting: ${reason}`);
  for(const e of errors)this.log('warn',e);this.state.lastError=errors.length?errors.join(' · '):null;
  return result;}
 /** Called when a project finishes: schedule an Auto-pilot project's best clips at the daily times. Others are ignored. */
 async onDone(id){let job;try{job=this.store.get(id);}catch{return null;}if(!job.autopilot||job.status!=='complete'||job.autoPosted||this.handled.has(id))return null;this.handled.add(id);
  const c=this.config();
  try{const r=await this.autoPost(job,{store:this.store,posting:this.posting,youtube:this.youtube,settings:{enabled:true,postNow:0,maxScheduled:c.perDay,times:c.times,titleStyle:c.titleStyle==='hook'?'hook':'standard',madeForKids:c.madeForKids,skipWarnings:c.skipWarnings}});
   const n=r?.scheduled?.length||0;this.log(n?'info':'warn',n?`Scheduled ${n} clip${n>1?'s':''} from "${job.autopilot.title||job.title}"`:`No clips from "${job.autopilot.title||job.title}" were ready to schedule`);return r;}
  catch(e){this.store.update(id,{autoPosted:{error:e.message,at:new Date(this.now()).toISOString()}});this.log('error',`Couldn’t schedule "${job.autopilot.title||job.title}": ${e.message}`);return null;}}
}

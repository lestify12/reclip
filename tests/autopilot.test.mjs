import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {validateAutopilot,AUTOPILOT_DEFAULTS,saveAutopilot,loadAutopilot,readAutopilot,scout,hypeScore,isoSeconds,channelQuery,AutopilotEngine} from '../server/autopilot.mjs';

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'reclip-ap-'));
const json=body=>({ok:true,status:200,json:async()=>body});
const NOW=Date.parse('2026-11-26T12:00:00Z');

test('config: defaults are off with six daily times, limits are explained',()=>{
 const c=validateAutopilot({});assert.equal(c.enabled,false);assert.deepEqual(c.times,['02:00','06:00','10:00','14:00','18:00','22:00']);assert.equal(c.perDay,6);
 assert.deepEqual(validateAutopilot({twitch:{channels:['KaiCenat','https://twitch.tv/jynxzi']}}).twitch.channels,['kaicenat','jynxzi']);
 assert.throws(()=>validateAutopilot({twitch:{channels:['not a login!']}}),/Twitch login/);
 assert.throws(()=>validateAutopilot({times:['25:00']}),/release times/);
 assert.throws(()=>validateAutopilot({everyHours:0}),/1–24/);
 assert.throws(()=>validateAutopilot({template:'nope'}),/template/);
 assert.equal(validateAutopilot({times:['10:00','06:00'],perDay:6}).perDay,2,'never more per day than there are times');
});

test('config file keeps the used list and the log when settings are saved',()=>{
 const root=tmp();assert.equal(loadAutopilot(root).enabled,false);
 fs.mkdirSync(path.join(root,'posting'),{recursive:true});fs.writeFileSync(path.join(root,'posting','autopilot.json'),JSON.stringify({config:{},used:[{url:'u1'}],log:[{message:'hi'}]}));
 saveAutopilot(root,{...AUTOPILOT_DEFAULTS,everyHours:6});const d=readAutopilot(root);
 assert.equal(d.config.everyHours,6);assert.equal(d.used[0].url,'u1');assert.equal(d.log[0].message,'hi');
});

test('helpers: hype, ISO durations, channel links',()=>{
 assert.equal(hypeScore({}),0);assert.ok(hypeScore({views:1e6})>hypeScore({views:1e4}));assert.equal(hypeScore({views:1e9}),100);
 assert.equal(isoSeconds('PT1H2M3S'),3723);assert.equal(isoSeconds('PT45S'),45);assert.equal(isoSeconds('P1DT1S'),86401);
 assert.deepEqual(channelQuery('@MrBeast'),{forHandle:'@MrBeast'});assert.deepEqual(channelQuery('https://www.youtube.com/@kaicenat/videos'),{forHandle:'@kaicenat'});
 assert.deepEqual(channelQuery('UCX6OQ3DkcsbYNE6H8uQQuVA'),{id:'UCX6OQ3DkcsbYNE6H8uQQuVA'});assert.equal(channelQuery('???'),null);
});

test('scout: Twitch streamers become VOD candidates scored by views, clips and live viewers',async()=>{
 const env={TWITCH_CLIENT_ID:'id',TWITCH_CLIENT_SECRET:'secret'},calls=[];
 const fetchImpl=async url=>{url=String(url);calls.push(url);
  if(url.includes('oauth2/token'))return json({access_token:'t',expires_in:3600});
  if(url.includes('/users?'))return json({data:[{id:'1',login:'kaicenat',display_name:'KaiCenat'}]});
  if(url.includes('/streams?'))return json({data:[{user_login:'kaicenat',viewer_count:40000}]});
  if(url.includes('/videos?'))return json({data:[{id:'999',title:'Halloween party',created_at:'2026-11-26T02:00:00Z',duration:'5h10m0s',view_count:120000}]});
  if(url.includes('/clips?'))return json({data:[{view_count:3000},{view_count:2000}]});
  throw new Error('unexpected '+url);};
 const r=await scout(validateAutopilot({twitch:{channels:['kaicenat','ghost_user']},minViews:1000}),{env,fetchImpl,now:NOW});
 assert.equal(r.candidates.length,1);const c=r.candidates[0];
 assert.equal(c.url,'https://www.twitch.tv/videos/999');assert.equal(c.viewers,40000);assert.equal(c.clipViews,5000);assert.equal(c.durationSeconds,18600);assert.ok(c.hype>70);
 assert.match(r.errors.join(),/ghost_user/,'a missing streamer is reported, not fatal');
});

test('scout: YouTube channels use the cheap uploads playlist and skip Shorts and live',async()=>{
 const env={YOUTUBE_API_KEY:'k'},routes=[];
 const fetchImpl=async url=>{const u=new URL(String(url));routes.push(u.pathname.split('/').pop());
  if(u.pathname.endsWith('/channels'))return json({items:[{id:'UC1',contentDetails:{relatedPlaylists:{uploads:'UU1'}}}]});
  if(u.pathname.endsWith('/playlistItems'))return json({items:[{contentDetails:{videoId:'a',videoPublishedAt:'2026-11-26T08:00:00Z'}},{contentDetails:{videoId:'b',videoPublishedAt:'2026-11-26T09:00:00Z'}},{contentDetails:{videoId:'c',videoPublishedAt:'2026-11-26T10:00:00Z'}},{contentDetails:{videoId:'old',videoPublishedAt:'2026-11-01T00:00:00Z'}}]});
  if(u.pathname.endsWith('/videos')){assert.equal(u.searchParams.get('id'),'a,b,c');return json({items:[
   {id:'a',snippet:{title:'Long video',channelTitle:'Chan',liveBroadcastContent:'none',publishedAt:'2026-11-26T08:00:00Z'},statistics:{viewCount:'250000'},contentDetails:{duration:'PT25M'}},
   {id:'b',snippet:{title:'A Short',liveBroadcastContent:'none'},statistics:{viewCount:'900000'},contentDetails:{duration:'PT40S'}},
   {id:'c',snippet:{title:'Live now',liveBroadcastContent:'live'},statistics:{viewCount:'5000'},contentDetails:{duration:'PT0S'}}]});}
  throw new Error('unexpected '+url);};
 const r=await scout(validateAutopilot({youtube:{channels:['@chan']}}),{env,fetchImpl,now:NOW});
 assert.deepEqual(r.candidates.map(c=>c.url),['https://www.youtube.com/watch?v=a']);assert.equal(r.candidates[0].views,250000);
 assert.ok(!routes.includes('search'),'never uses the 100-unit search endpoint');
});

test('scout: missing keys are reported instead of failing',async()=>{
 const r=await scout(validateAutopilot({twitch:{channels:['kaicenat']},youtube:{channels:['@x']}}),{env:{},fetchImpl:async()=>{throw new Error('no network');},now:NOW});
 assert.equal(r.candidates.length,0);assert.match(r.errors.join(' '),/TWITCH_CLIENT_ID/);assert.match(r.errors.join(' '),/YOUTUBE_API_KEY/);
});

function fakes(root,{scheduled=0}={}){
 const jobs=new Map(),queued=[];let n=0;
 const store={root,create:(source,options)=>{const id=`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;const j={id,source,options,status:'queued',clips:[],exports:[]};jobs.set(id,j);return j;},
  get:id=>{if(!jobs.has(id))throw new Error('Job not found');return jobs.get(id);},update:(id,patch)=>{const j={...jobs.get(id),...patch};jobs.set(id,j);return j;},list:()=>[...jobs.values()]};
 const future=new Date(NOW+86400e3).toISOString(),posting={list:()=>Array.from({length:scheduled},(_,i)=>({id:`p${i}`,state:'draft',settings:{privacy:'schedule',publishAt:future}}))};
 return {store,posting,queue:{enqueue:id=>queued.push(id)},queued,jobs};
}
const twitchEnv={TWITCH_CLIENT_ID:'id',TWITCH_CLIENT_SECRET:'secret'};
const twitchFetch=async url=>{url=String(url);if(url.includes('oauth2'))return json({access_token:'t',expires_in:3600});if(url.includes('/users?'))return json({data:[{id:'1',login:'kaicenat',display_name:'KaiCenat'}]});
 if(url.includes('/streams?'))return json({data:[]});if(url.includes('/videos?'))return json({data:[{id:'2210045981',title:'Big stream',created_at:'2026-11-26T05:00:00Z',duration:'4h0m0s',view_count:80000}]});if(url.includes('/clips?'))return json({data:[]});throw new Error(url);};

test('run: sends the top fresh source to clipping once, remembers it, and a scout never starts a job',async()=>{
 const root=tmp();saveAutopilot(root,{twitch:{channels:['kaicenat']},minViews:1000});const f=fakes(root);
 const engine=new AutopilotEngine({store:f.store,queue:f.queue,posting:f.posting,youtube:null,root,env:twitchEnv,fetchImpl:twitchFetch,now:()=>NOW});
 const dry=await engine.tick({dryRun:true});assert.equal(dry.candidates.length,1,JSON.stringify(dry.errors));assert.equal(f.queued.length,0,'a scout only looks');
 const r=await engine.tick();assert.equal(r.started.length,1,JSON.stringify({e:r.errors,s:r.skipped}));assert.equal(f.queued.length,1);
 const job=f.store.get(r.started[0].jobId);assert.equal(job.autopilot.url,'https://www.twitch.tv/videos/2210045981');assert.equal(job.source.type,'twitch');assert.equal(job.options.editTemplate,'context-hit');
 assert.equal(readAutopilot(root).used[0].url,'https://www.twitch.tv/videos/2210045981');
 f.store.update(job.id,{status:'complete'});
 const again=await engine.tick();assert.equal(again.started.length,0,'an already-clipped stream is not clipped again');assert.ok(again.candidates[0].used);
});

test('run: waits while two days of clips are already scheduled',async()=>{
 const root=tmp();saveAutopilot(root,{twitch:{channels:['kaicenat']},minViews:0});const f=fakes(root,{scheduled:12});
 const engine=new AutopilotEngine({store:f.store,queue:f.queue,posting:f.posting,root,env:twitchEnv,fetchImpl:twitchFetch,now:()=>NOW});
 const r=await engine.tick();assert.equal(r.started.length,0);assert.match(r.skipped[0].reason,/two days/);assert.equal(f.queued.length,0);
});

test('finished Auto-pilot projects are scheduled exactly once at the daily times; other projects are left alone',async()=>{
 const root=tmp();saveAutopilot(root,{titleStyle:'ai'});const f=fakes(root),seen=[];
 const autoPost=async(job,{settings})=>{seen.push({id:job.id,settings});return {now:[],scheduled:['a','b','c','d','e','f']};};
 const engine=new AutopilotEngine({store:f.store,queue:f.queue,posting:f.posting,root,env:{},fetchImpl:async()=>{throw new Error('x');},now:()=>NOW,autoPost});
 const mine=f.store.create({type:'twitch'},{});f.store.update(mine.id,{autopilot:{url:'u',title:'Big stream'},status:'complete'});
 const other=f.store.create({type:'file'},{});f.store.update(other.id,{status:'complete'});
 await engine.onDone(mine.id);await engine.onDone(mine.id);await engine.onDone(other.id);
 assert.equal(seen.length,1);assert.equal(seen[0].settings.postNow,0);assert.equal(seen[0].settings.maxScheduled,6);assert.equal(seen[0].settings.titleStyle,'standard');assert.deepEqual(seen[0].settings.times,AUTOPILOT_DEFAULTS.times);
 assert.match(readAutopilot(root).log[0].message,/Scheduled 6 clips from "Big stream"/);
});

test('the timer only runs while Auto-pilot is on',()=>{
 const root=tmp(),f=fakes(root),timers=[];
 const engine=new AutopilotEngine({store:f.store,queue:f.queue,posting:f.posting,root,now:()=>NOW,setTimer:(fn,ms)=>{timers.push(ms);return {ms};},clearTimer:()=>{}});
 engine.start();assert.equal(timers.length,0);assert.equal(engine.status().running,false);
 saveAutopilot(root,{enabled:true});engine.start();assert.deepEqual(timers,[30000]);assert.equal(engine.status().running,true);assert.ok(engine.status().nextRunAt);
 engine.stop();assert.equal(engine.status().running,false);
});

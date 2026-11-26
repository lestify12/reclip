import Select from './Select';
import {useEffect,useState} from 'react';
import {Radar,Play,Loader2,Check,CircleAlert,ExternalLink,Scissors,RefreshCw,Clock,Tv,PlaySquare,KeyRound} from 'lucide-react';
import type {EditTemplate} from './types';import TikTokAuto from './TikTokAuto';import {zoneLabel} from './zone';

/** Auto-pilot: watch streamers and channels, send the hyped ones to Reclip, schedule the best clips at six daily times. */
export type AutopilotConfig={enabled:boolean;everyHours:number;lookbackHours:number;maxSourcesPerRun:number;minViews:number;twitch:{channels:string[];categories:string[]};youtube:{channels:string[]};perDay:number;times:string[];timeZone:string;template:string;outputFormat:string;count:number;picker:string;titleStyle:string;madeForKids:boolean;skipWarnings:boolean};
type Candidate={platform:'twitch'|'youtube';url:string;title:string;creator:string;views:number;viewers:number;clipViews:number;publishedAt:string;durationSeconds:number;hype:number;used?:boolean};
type Working={jobId:string;title:string;creator:string;platform:string;status:string;stage:string;progress:number;message:string;startedAt:string;clips:number;scheduled:number};
type Data={config:AutopilotConfig;status:{running:boolean;nextRunAt:string|null;lastRunAt:string|null;lastError:string|null;lastCandidates?:Candidate[];current?:Working[]};ready:{twitch:boolean;youtube:boolean};log:{at:string;level:string;message:string}[];used:{url:string;platform:string;title:string;creator:string;at:string;jobId:string}[]};
type RunResult={candidates:Candidate[];started:{jobId:string;url:string;title:string}[];skipped:{url:string;reason:string}[];errors:string[]};

async function api<T>(url:string,body?:unknown):Promise<T>{const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||data.message||`Request failed (${r.status})`);return data as T;}
const fmt=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(n>=1e4?0:1)}K`:String(n);
const when=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const lines=(list:string[])=>list.join('\n'),parse=(text:string)=>text.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);

function ListField({id,label,hint,value,onChange,placeholder}:{id:string;label:string;hint:string;value:string[];onChange:(v:string[])=>void;placeholder:string}){
 const [text,setText]=useState(lines(value));useEffect(()=>{setText(lines(value));},[value.join('\n')]);
 return <div className="field"><label htmlFor={id}>{label}</label><textarea id={id} rows={4} value={text} placeholder={placeholder} spellCheck={false} onChange={e=>setText(e.target.value)} onBlur={()=>onChange(parse(text))}/><small>{hint}</small></div>;
}

export default function Autopilot({templates,onOpenSettings,onOpenJob,onConnect}:{templates:EditTemplate[];onOpenSettings:()=>void;onOpenJob:(id:string)=>void;onConnect:()=>void}){
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<AutopilotConfig|null>(null),[busy,setBusy]=useState<''|'save'|'scout'|'run'|'toggle'|string>(''),[error,setError]=useState(''),[result,setResult]=useState<RunResult|null>(null),[saved,setSaved]=useState(false);
 const load=()=>api<Data>('/api/autopilot').then(d=>{setData(d);setDraft(d.config);}).catch(e=>setError((e as Error).message));
 const busyJobs=(data?.status.current||[]).some(j=>!['complete','failed','cancelled','interrupted'].includes(j.status));
 useEffect(()=>{load();const t=setInterval(load,busyJobs?4000:60000);return()=>clearInterval(t);},[busyJobs]);
 useEffect(()=>{if(!saved)return;const t=setTimeout(()=>setSaved(false),2500);return()=>clearTimeout(t);},[saved]);
 const set=(patch:Partial<AutopilotConfig>)=>setDraft(d=>d?{...d,...patch}:d);
 const save=async(patch?:Partial<AutopilotConfig>)=>{if(!draft)return;setBusy(patch?'toggle':'save');setError('');try{const d=await api<Data>('/api/autopilot',{...draft,...patch});setData(d);setDraft(d.config);setSaved(true);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const run=async(dry:boolean)=>{setBusy(dry?'scout':'run');setError('');try{setResult(await api<RunResult>(dry?'/api/autopilot/scout':'/api/autopilot/run',{}));await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const clip=async(c:Candidate)=>{setBusy(c.url);setError('');try{const r=await api<{job:{id:string}}>('/api/autopilot/clip',{url:c.url});await load();onOpenJob(r.job.id);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 if(!draft||!data)return <section className="ap-page"><header className="np-head"><div className="np-title"><h1>Auto-pilot</h1><p>Loading…</p></div></header>{error&&<div className="notice warn" role="alert"><CircleAlert size={16}/>{error}</div>}</section>;
 const on=data.config.enabled,candidates=result?.candidates||data.status.lastCandidates||[],noKeys=!data.ready.twitch&&!data.ready.youtube,noSources=!draft.twitch.channels.length&&!draft.twitch.categories.length&&!draft.youtube.channels.length;
 return <section className="ap-page">
  <header className="np-head"><div className="np-title"><h1>Auto-pilot</h1><p>Watch streamers and channels, clip the hyped ones, and schedule the best clips every day.</p></div>
   <div className={`ai-status ${on?'on':'off'}`} role="status"><i className="ai-dot" aria-hidden="true"/><span className="ai-text"><strong>{on?'Auto-pilot on':'Auto-pilot off'}</strong><span>{on?`next run ${when(data.status.nextRunAt)}`:'not watching'}</span></span><button type="button" className="ai-link" disabled={busy==='toggle'||(!on&&(noKeys||noSources))} title={!on&&noKeys?'Add a Twitch or YouTube key in Settings first':!on&&noSources?'Add a channel to the watchlist first':undefined} onClick={()=>save({enabled:!on})}>{busy==='toggle'?<Loader2 size={13} className="spin"/>:on?'Turn off':'Turn on'}</button></div></header>
  {error&&<div className="notice warn" role="alert"><CircleAlert size={16}/>{error}</div>}
  {data.status.lastError&&<div className="notice warn" role="status"><CircleAlert size={16}/>Last run: {data.status.lastError}</div>}
  {!!data.status.current?.length&&<section className="np-card ap-card ap-now"><header className="ap-card-head"><h2><Scissors size={16}/>Now clipping</h2><span className="np-hint">{data.status.current.filter(j=>!['complete','failed','cancelled','interrupted'].includes(j.status)).length} working</span></header>
   {data.status.current.map(j=>{const STEPS=['import','transcribe','select','render'],order=['queued','import','probe','audio','transcribe','select','render','export','complete'],at=order.indexOf(j.stage),done=j.status==='complete',failed=['failed','cancelled','interrupted'].includes(j.status),pct=done?100:Math.round(j.progress*100);
    return <div key={j.jobId} className={`ap-job ${done?'done':failed?'failed':j.status==='queued'?'queued':''}`}>
     <div className="ap-job-head"><span className={`ap-platform ${j.platform}`}>{j.platform==='twitch'?<Tv size={12}/>:<PlaySquare size={12}/>}</span><div className="ap-job-title"><strong title={j.title}>{j.title||'Untitled'}</strong><small>{j.creator} · started {when(j.startedAt)}</small></div>
      <span className="ap-job-pct">{done?(j.scheduled?`${j.scheduled} scheduled`:`${j.clips} clips`):failed?'Stopped':j.status==='queued'?'In line':`${pct}%`}</span><button type="button" className="secondary" onClick={()=>onOpenJob(j.jobId)}>Open</button></div>
     <div className="progress-track"><i style={{width:`${Math.max(done?100:2,pct)}%`}}/></div>
     <div className="stage-rail">{STEPS.map((s,i)=>{const passed=done||order.indexOf(s)<at&&!(s==='render'&&at<order.indexOf('render')),now=!done&&!failed&&(j.stage===s||(s==='import'&&['probe','audio'].includes(j.stage))||(s==='render'&&j.stage==='export'));return <span key={s} className={now||passed?'current':''}>{passed&&!now?<Check size={13}/>:<i/>}{['Import','Transcribe','Find moments','Edit clips'][i]}</span>;})}</div>
     <small className="ap-job-msg">{failed?(j.message||'Stopped. Open the project and press Retry.'):j.status==='queued'?'Waiting for the project ahead of it to finish.':done?(j.scheduled?`Scheduled in Publish at your release times.`:j.message):j.message}</small>
    </div>;})}
  </section>}
  <div className="ap-layout"><div className="ap-main">
   <section className="np-card ap-card"><header className="ap-card-head"><h2><Radar size={16}/>Watchlist</h2><span className="ap-keys">{data.ready.twitch?<span className="key-status set"><Check size={12}/>Twitch</span>:<button type="button" className="key-status unset" onClick={onOpenSettings}><KeyRound size={12}/>Twitch key</button>}{data.ready.youtube?<span className="key-status set"><Check size={12}/>YouTube</span>:<button type="button" className="key-status unset" onClick={onOpenSettings}><KeyRound size={12}/>YouTube key</button>}</span></header>
    <div className="ap-grid">
     <ListField id="ap-twitch" label="Twitch streamers" hint="One login per line, as in twitch.tv/login. Their newest VOD is scored by viewers and by the clips viewers made." value={draft.twitch.channels} onChange={v=>set({twitch:{...draft.twitch,channels:v}})} placeholder={'kaicenat\njynxzi'}/>
     <ListField id="ap-twitch-cat" label="Twitch categories" hint="Game or category names. The top live streamers in each are checked every run." value={draft.twitch.categories} onChange={v=>set({twitch:{...draft.twitch,categories:v}})} placeholder={'Just Chatting\nGrand Theft Auto V'}/>
     <ListField id="ap-youtube" label="YouTube channels" hint="Handles like @name, channel ids or channel links. Videos from the last day, Shorts excluded, ranked by views." value={draft.youtube.channels} onChange={v=>set({youtube:{...draft.youtube,channels:v}})} placeholder={'@MrBeast\n@kaicenat'}/>
    </div>
    {noKeys&&<p className="np-note"><CircleAlert size={14}/> Add a Twitch app (client id and secret) or a YouTube Data API key in <button type="button" className="text-button" onClick={onOpenSettings}>Settings → Sources</button> so Auto-pilot can look things up. Both are free.</p>}
   </section>
   <section className="np-card ap-card"><header className="ap-card-head"><h2><Clock size={16}/>Rules</h2></header>
    <div className="ap-grid ap-grid-4">
     <label className="field"><span>Check every</span><Select value={String(draft.everyHours)} onChange={e=>set({everyHours:Number(e.target.value)})}>{[1,2,3,4,6,8,12,24].map(h=><option key={h} value={h}>{h} hour{h>1?'s':''}</option>)}</Select></label>
     <label className="field"><span>Look back</span><Select value={String(draft.lookbackHours)} onChange={e=>set({lookbackHours:Number(e.target.value)})}>{[6,12,24,48,72].map(h=><option key={h} value={h}>{h} hours</option>)}</Select></label>
     <label className="field"><span>Minimum hype (views)</span><input type="number" min={0} step={1000} value={draft.minViews} onChange={e=>set({minViews:Number(e.target.value)})}/></label>
     <label className="field"><span>Sources per run</span><Select value={String(draft.maxSourcesPerRun)} onChange={e=>set({maxSourcesPerRun:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</Select></label>
    </div>
    <div className="ap-grid ap-grid-4">
     <label className="field"><span>Template</span><Select value={draft.template} onChange={e=>set({template:e.target.value})}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
     <label className="field"><span>Shape</span><Select value={draft.outputFormat} onChange={e=>set({outputFormat:e.target.value})}><option value="shorts">Portrait 9:16</option><option value="video">Landscape 16:9</option></Select></label>
     <label className="field"><span>Clips to find per source</span><Select value={String(draft.count)} onChange={e=>set({count:Number(e.target.value)})}>{[6,8,10,12,15,20,24].map(n=><option key={n} value={n}>Up to {n}</option>)}</Select></label>
     <label className="field"><span>Clip picker</span><Select value={draft.picker} onChange={e=>set({picker:e.target.value})}><option value="heuristic">Local · no key needed</option><option value="anthropic">Claude · own key</option><option value="openai">OpenAI · own key</option></Select></label>
    </div>
    <div className="ap-grid ap-grid-4"><label className="field"><span>YouTube titles</span><Select value={draft.titleStyle} onChange={e=>set({titleStyle:e.target.value})}><option value="ai">AI-written, YouTube style</option><option value="hook">On-screen hook + emoji</option></Select></label></div>
    <div className="field"><span className="np-label">Release times · {zoneLabel(draft.timeZone||undefined)} · {draft.perDay} a day</span><div className="ap-times">{draft.times.map((t,i)=><input key={i} type="time" value={t} aria-label={`Release time ${i+1}`} onChange={e=>{const times=[...draft.times];times[i]=e.target.value;set({times});}}/>)}{draft.times.length<6&&<button type="button" className="secondary" onClick={()=>set({times:[...draft.times,'12:00'],perDay:Math.min(6,draft.times.length+1)})}>+ Add time</button>}{draft.times.length>1&&<button type="button" className="text-button" onClick={()=>set({times:draft.times.slice(0,-1),perDay:Math.max(1,draft.times.length-1)})}>Remove last</button>}</div><small className="np-note">YouTube's free quota covers about 6 uploads a day. Uploads from a new Google project stay private until YouTube audits it; Publish shows which ones were kept private.</small></div>
    <div className="ap-checks"><label><input type="checkbox" checked={draft.skipWarnings} onChange={e=>set({skipWarnings:e.target.checked})}/>Skip clips with sound or picture warnings</label><label><input type="checkbox" checked={draft.madeForKids} onChange={e=>set({madeForKids:e.target.checked})}/>Made for kids</label></div>
    <div className="form-actions"><span className="np-hint">{saved?<><Check size={14}/> Saved</>:''}</span><button type="button" className="primary" disabled={busy==='save'} onClick={()=>save()}>{busy==='save'?<Loader2 size={14} className="spin"/>:<Check size={14}/>}Save rules</button></div>
   </section>
   <section className="np-card ap-card"><header className="ap-card-head"><h2><RefreshCw size={16}/>Activity</h2><span className="np-hint">Last run {when(data.status.lastRunAt)}</span></header>
    {!data.log.length?<p className="np-note">Nothing yet. Turn Auto-pilot on, or run a scout to see what it would pick.</p>:<ul className="ap-log">{data.log.slice(0,12).map((l,i)=><li key={i} className={l.level}><time>{when(l.at)}</time><span>{l.message}</span></li>)}</ul>}
    {data.used.length>0&&<details className="advanced"><summary>Sources already used ({data.used.length})</summary><ul className="ap-used">{data.used.slice(0,20).map(u=><li key={u.url}><span className={`ap-platform ${u.platform}`}>{u.platform==='twitch'?<Tv size={12}/>:<PlaySquare size={12}/>}</span><button type="button" className="text-button" onClick={()=>onOpenJob(u.jobId)}>{u.title||u.url}</button><small>{u.creator} · {when(u.at)}</small></li>)}</ul></details>}
   </section>
  </div>
  <aside className="ap-side">
   <TikTokAuto onConnect={onConnect} compact/>
   <section className="np-card ap-card"><header className="ap-card-head"><h2><Play size={16}/>Run</h2></header>
    <p className="np-note">A scout only looks. A run also sends the top {draft.maxSourcesPerRun} source{draft.maxSourcesPerRun>1?'s':''} to clipping.</p>
    <div className="ap-run"><button type="button" className="secondary" disabled={!!busy||noKeys||noSources} onClick={()=>run(true)}>{busy==='scout'?<Loader2 size={15} className="spin"/>:<Radar size={15}/>}Scout now</button><button type="button" className="primary" disabled={!!busy||noKeys||noSources} onClick={()=>run(false)}>{busy==='run'?<Loader2 size={15} className="spin"/>:<Play size={15}/>}Run once</button></div>
    {result&&<p className="np-note">{result.started.length?`Started ${result.started.length} project${result.started.length>1?'s':''}. `:''}{result.skipped.length?`Skipped ${result.skipped.length}. `:''}{result.errors.length?result.errors.join(' · '):''}</p>}
   </section>
   <section className="np-card ap-card"><header className="ap-card-head"><h2>Candidates</h2><span className="np-hint">{candidates.length} found</span></header>
    {!candidates.length?<p className="np-note">Run a scout to see what is hot on your watchlist right now.</p>:<ul className="ap-candidates">{candidates.slice(0,12).map(c=><li key={c.url}>
     <div className="ap-cand-head"><span className={`ap-platform ${c.platform}`}>{c.platform==='twitch'?<Tv size={12}/>:<PlaySquare size={12}/>}</span><strong title={c.title}>{c.title||c.url}</strong></div>
     <small>{c.creator}{c.views?` · ${fmt(c.views)} views`:''}{c.viewers?` · ${fmt(c.viewers)} watching`:''}{c.clipViews?` · ${fmt(c.clipViews)} clip views`:''}</small>
     <div className="ap-hype"><i style={{width:`${c.hype}%`}}/><span>{c.hype}</span></div>
     <div className="ap-cand-actions"><a href={c.url} target="_blank" rel="noopener noreferrer" className="text-button">Open<ExternalLink size={12}/></a>{c.used?<span className="np-hint">Already clipped</span>:<button type="button" className="secondary" disabled={!!busy} onClick={()=>clip(c)}>{busy===c.url?<Loader2 size={14} className="spin"/>:<Scissors size={14}/>}Clip this</button>}</div>
    </li>)}</ul>}
   </section>
  </aside></div>
 </section>;
}

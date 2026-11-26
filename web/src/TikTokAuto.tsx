import {useEffect,useState} from 'react';
import {Send,Loader2,CircleAlert} from 'lucide-react';

/** "Also send to TikTok": scheduled portrait clips go to the TikTok inbox at their release time. Shared by Publish and Auto-pilot. */
type Status={enabled:boolean;displayName:string;connected:boolean;connectedAs:string;configured:boolean;accountMatches:boolean;upcoming:number;sentCount:number;log:{at:string;level:string;message:string}[]};
async function api<T>(url:string,body?:unknown):Promise<T>{const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d as T;}
const when=(iso:string)=>new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

export default function TikTokAuto({onConnect,compact=false}:{onConnect:()=>void;compact?:boolean}){
 const [s,setS]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[agree,setAgree]=useState(false);
 const load=()=>api<Status>('/api/tiktok/auto').then(setS).catch(e=>setError((e as Error).message));
 useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t);},[]);
 const set=async(enabled:boolean)=>{setBusy(true);setError('');try{setS(await api<Status>('/api/tiktok/auto',{enabled,consent:enabled?agree:undefined}));setAgree(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!s)return null;
 const on=s.enabled,paused=on&&s.connected&&!s.accountMatches;
 return <div className={`pub-card tt-auto ${compact?'compact':''}`}><h2><Send size={16}/>TikTok at release time{s.connected&&(on||agree)&&<label className="pub-switch"><input type="checkbox" role="switch" aria-label="Send scheduled clips to TikTok" checked={on} disabled={busy} onChange={e=>set(e.target.checked)}/><i aria-hidden="true"/></label>}</h2>
  {!s.connected?<><p className="np-note">When a scheduled portrait clip goes live on YouTube, the same video can land in your TikTok inbox. You tap Post in the TikTok app.</p><button type="button" className="secondary pub-wide" onClick={onConnect}>{s.configured?'Connect TikTok':'Set up TikTok'}</button></>
  :on?<><p className="np-note">{paused?<><CircleAlert size={14}/> Paused: TikTok is now connected as {s.connectedAs}, not {s.displayName}. Turn this off and on again to use the new account.</>:<>On for <strong>{s.displayName}</strong>. {s.upcoming?`${s.upcoming} scheduled clip${s.upcoming===1?'':'s'} will be sent at ${s.upcoming===1?'its':'their'} release time.`:'Clips you schedule will be sent at their release time.'} Open the TikTok app when the notification comes, then post.</>}</p></>
  :<><p className="np-note">Connected as <strong>{s.connectedAs}</strong>. At each release time, the clip goes to your TikTok inbox as a draft with its caption; you tap Post in the app. TikTok has no scheduling, so keep Reclip running.</p>
   <label className="tt-consent"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/>Send my scheduled portrait clips to the TikTok account <strong>{s.connectedAs}</strong> at their release time</label>
   <button type="button" className="primary pub-wide" disabled={!agree||busy} onClick={()=>set(true)}>{busy?<Loader2 className="spin" size={15}/>:<Send size={15}/>}Turn on</button></>}
  {error&&<small className="pub-flag" role="alert">{error}</small>}
  {!compact&&s.log.length>0&&<details className="advanced"><summary>TikTok activity ({s.sentCount} sent)</summary><ul className="ap-log">{s.log.slice(0,8).map((l,i)=><li key={i} className={l.level}><time>{when(l.at)}</time><span>{l.message}</span></li>)}</ul></details>}
 </div>;
}

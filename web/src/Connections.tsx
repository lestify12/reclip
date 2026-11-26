import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ExternalLink,Loader2,Settings2,Upload,Check} from 'lucide-react';
import YouTubeSetupGuide from './YouTubeSetupGuide';

/** The accounts Reclip posts to: your YouTube channel and your TikTok account. Shown in Settings → Sources. */
const TikTokConnection=lazy(()=>import('./TikTok').then(module=>({default:module.TikTokConnection})));
type Connection={configured:boolean;connected:boolean;channelTitle:string};
async function request<T>(url:string,method='GET',body?:unknown):Promise<T>{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;}

export function YouTubeConnection(){
 const [connection,setConnection]=useState<Connection>({configured:false,connected:false,channelTitle:''}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [clientJson,setClientJson]=useState(''),[setupError,setSetupError]=useState(''),[readingClient,setReadingClient]=useState(false);
 const setupDialog=useRef<HTMLDialogElement>(null),setupBusy=readingClient||busy==='configure';
 const refresh=()=>request<Connection>('/api/youtube/status').then(setConnection);
 useEffect(()=>{refresh().catch(e=>setError(e.message));const t=setInterval(()=>refresh().catch(()=>{}),4000);return()=>clearInterval(t);},[]);
 async function readClientFile(file:File){setReadingClient(true);setSetupError('');try{setClientJson(await file.text());}catch{setSetupError('Could not read that file. Choose it again or paste its contents.');}finally{setReadingClient(false);}}
 async function configure(){
  if(setupBusy||connection.connected||!clientJson.trim())return;
  let parsed:unknown;try{parsed=JSON.parse(clientJson.trim());}catch{setSetupError('Paste the entire JSON file from your Google Desktop app client.');return;}
  setBusy('configure');setSetupError('');
  try{setConnection(await request<Connection>('/api/youtube/configure','POST',parsed));setMessage('Credentials saved. Connect your channel next.');setupDialog.current?.close();}
  catch(e){setSetupError((e as Error).message);}finally{setBusy('');}
 }
 async function connect(){const win=window.open('','reclip-youtube','width=620,height=760');setBusy('connect');setError('');try{const data=await request<{url:string}>('/api/youtube/connect','POST',{});if(win)win.location.href=data.url;else window.location.href=data.url;}catch(e){win?.close();setError((e as Error).message);}finally{setBusy('');}}
 async function disconnect(){setBusy('disconnect');setError('');try{await request('/api/youtube/disconnect','POST',{});await refresh();setMessage('');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <div className="key-row conn-row">
  <div className="key-info"><strong>YouTube channel</strong><small>{connection.connected?'Where Publish uploads and schedules your clips.':connection.configured?'Credentials saved. Connect the channel you want to upload to.':'One-time setup with your own free Google app. Takes about 10 minutes.'}</small></div>
  <span className={`key-status ${connection.connected?'set':'unset'}`}>{connection.connected?<><Check size={14}/>{connection.channelTitle||'Connected'}</>:'Not connected'}</span>
  <div className="conn-actions">
   <button type="button" className="secondary" aria-haspopup="dialog" disabled={!!busy&&busy!=='configure'} onClick={()=>setupDialog.current?.showModal()}><Settings2 size={15}/>Setup</button>
   {connection.connected?<button type="button" className="secondary" disabled={!!busy} onClick={disconnect}>{busy==='disconnect'&&<Loader2 size={14} className="spin"/>}Disconnect</button>
    :<button type="button" className="primary" disabled={!connection.configured||!!busy} onClick={connect}>Connect<ExternalLink size={14}/></button>}
  </div>
  {error&&<p className="field-error" role="alert">{error}</p>}{message&&<p className="np-note conn-message" role="status"><Check size={14}/>{message}</p>}
  <dialog ref={setupDialog} className="youtube-setup-dialog" aria-labelledby="youtube-setup-title" onCancel={e=>{if(setupBusy)e.preventDefault();}} onClose={()=>{setClientJson('');setSetupError('');}}>
   <h2 id="youtube-setup-title"><Settings2 size={20}/>Set up YouTube access</h2>
   <YouTubeSetupGuide connected={connection.connected} configured={connection.configured}/>
   {connection.connected?<><p>To change credentials, disconnect your channel first.</p><footer><button type="button" className="secondary" onClick={()=>setupDialog.current?.close()}>Close</button></footer></>:
    <form onSubmit={e=>{e.preventDefault();void configure();}}>
     <label htmlFor="youtube-client-json">OAuth client JSON</label>
     <textarea id="youtube-client-json" aria-describedby="youtube-setup-hint" rows={5} spellCheck={false} autoComplete="off" disabled={setupBusy} value={clientJson} placeholder="Paste the contents of your JSON file" onChange={e=>{setClientJson(e.target.value);setSetupError('');}}/>
     <label className="secondary file-button youtube-client-file"><Upload size={15}/>Choose JSON file<input type="file" accept=".json,application/json" aria-label="Choose YouTube OAuth client JSON file" disabled={setupBusy} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void readClientFile(file);}}/></label>
     <p id="youtube-setup-hint">Reclip saves your credentials locally. After saving, choose Connect to authorize your channel.</p>
     {setupError&&<p className="trim-warning" role="alert">{setupError}</p>}
     <footer><button type="button" className="secondary" disabled={setupBusy} onClick={()=>setupDialog.current?.close()}>Cancel</button><button type="submit" className="primary" disabled={setupBusy||!clientJson.trim()}>{busy==='configure'&&<Loader2 size={16} className="spin"/>}Save credentials</button></footer>
    </form>}
  </dialog>
 </div>;
}

export function TikTokAccount(){return <div className="conn-tiktok"><Suspense fallback={null}><TikTokConnection/></Suspense></div>;}

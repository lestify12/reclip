import Select from './Select';
import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {KeyRound,Check,Trash2,ExternalLink,Loader2,CircleAlert,Cpu,SlidersHorizontal} from 'lucide-react';

export type SettingsData={file:string|null;problems:string[];secrets:Record<string,{set:boolean;hint:string}>;values:Record<string,string>};
type Provider={key:string;name:string;cost:string;does:string;link:string};
const PROVIDERS:Provider[]=[
 {key:'GEMINI_API_KEY',name:'Gemini',cost:'Free',does:'Writes titles, descriptions and hashtags, and translates captions. No card needed.',link:'https://aistudio.google.com/app/apikey'},
 {key:'GROQ_API_KEY',name:'Groq',cost:'Free',does:'Backup writer when Gemini is busy or not set.',link:'https://console.groq.com/keys'},
 {key:'ANTHROPIC_API_KEY',name:'Claude (Anthropic)',cost:'Paid',does:'Writes with Claude and powers the optional Anthropic clip picker.',link:'https://console.anthropic.com/'},
 {key:'OPENAI_API_KEY',name:'OpenAI',cost:'Paid',does:'Optional OpenAI clip picker.',link:'https://platform.openai.com/api-keys'},
 {key:'OLLAMA_API_KEY',name:'Ollama Cloud',cost:'Free tier',does:'Runs the writer on Ollama Cloud instead of this computer.',link:'https://ollama.com/settings/keys'}];
const METADATA_CHOICES:[string,string][]=[['','Automatic (Gemini, then Groq, then Ollama, then Claude)'],['gemini','Gemini'],['groq','Groq'],['ollama','Ollama'],['claude','Claude']];

const getSettings=()=>fetch('/api/settings').then(r=>r.ok?r.json() as Promise<SettingsData>:Promise.reject(new Error('Couldn’t read the settings')));
async function postSettings(patch:Record<string,string>):Promise<SettingsData>{
 const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
 const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||body.message||'Couldn’t save');return body as SettingsData;
}
/** Which AI writers are ready, in the order Reclip tries them. Ollama counts with a cloud key, a model or a host. */
export function aiProviders(s:SettingsData){
 const on=(k:string)=>!!s.secrets[k]?.set,v=(k:string)=>!!s.values[k]?.trim();
 return [on('GEMINI_API_KEY')&&'Gemini',on('GROQ_API_KEY')&&'Groq',(on('OLLAMA_API_KEY')||v('OLLAMA_MODEL')||v('OLLAMA_HOST'))&&'Ollama',on('ANTHROPIC_API_KEY')&&'Claude',on('OPENAI_API_KEY')&&'OpenAI'].filter((x):x is string=>!!x);
}

/** A short "Saved" tick that fades after a moment. */
function useSavedFlash():[boolean,()=>void]{const [saved,setSaved]=useState(false);useEffect(()=>{if(!saved)return;const t=setTimeout(()=>setSaved(false),2500);return ()=>clearTimeout(t);},[saved]);return [saved,()=>setSaved(true)];}

function KeyRow({p,status,onSave}:{p:Provider;status:{set:boolean;hint:string}|undefined;onSave:(patch:Record<string,string>)=>Promise<void>}){
 const [value,setValue]=useState(''),[busy,setBusy]=useState<'save'|'remove'|null>(null),[error,setError]=useState(''),[saved,flash]=useSavedFlash();const id=`key-${p.key}`;
 const run=async(kind:'save'|'remove',patch:Record<string,string>)=>{setBusy(kind);setError('');try{await onSave(patch);setValue('');flash();}catch(e){setError((e as Error).message);}finally{setBusy(null);}};
 const submit=(e:FormEvent)=>{e.preventDefault();if(!value.trim())return setError('Paste the key first');run('save',{[p.key]:value.trim()});};
 return <div className="key-row">
  <div className="key-info"><strong>{p.name} <small>· {p.cost}</small></strong><small>{p.does} <a href={p.link} target="_blank" rel="noopener noreferrer">Get a key<ExternalLink size={12}/></a></small></div>
  <span className={`key-status ${status?.set?'set':'unset'}`}>{status?.set?<><Check size={14}/>Saved{status.hint?` · …${status.hint}`:''}</>:'Not set'}</span>
  <form className="key-form" onSubmit={submit}>
   <label htmlFor={id} className="sr-only">{p.name} API key</label>
   <input id={id} type="password" autoComplete="off" spellCheck={false} placeholder={status?.set?'Paste a new key to replace it':'Paste key'} value={value} onChange={e=>setValue(e.target.value)} disabled={!!busy}/>
   <button type="submit" className="primary" disabled={!!busy}>{busy==='save'?<Loader2 size={14} className="spin"/>:saved?<Check size={14}/>:<KeyRound size={14}/>}{saved?'Saved':'Save'}</button>
   {status?.set&&<button type="button" className="text-button" disabled={!!busy} onClick={()=>run('remove',{[p.key]:''})}>{busy==='remove'?<Loader2 size={14} className="spin"/>:<Trash2 size={14}/>}Remove</button>}
  </form>
  {error&&<p className="field-error" role="alert">{error}</p>}
 </div>;
}

/** A group of plain text settings with one Save button. */
function ValuesForm({keys,values,onSave,children}:{keys:string[];values:Record<string,string>;onSave:(patch:Record<string,string>)=>Promise<void>;children:(field:(key:string)=>{id:string;value:string;onChange:(e:{target:{value:string}})=>void})=>ReactNode}){
 const [draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,flash]=useSavedFlash();
 // The drafts follow the saved values only when those change (another section's save does not wipe typing here).
 const snapshot=JSON.stringify(keys.map(k=>[k,values[k]??'']));useEffect(()=>{setDraft(Object.fromEntries(JSON.parse(snapshot)));},[snapshot]);
 const field=(key:string)=>({id:`setting-${key}`,value:draft[key]??'',onChange:(e:{target:{value:string}})=>setDraft(d=>({...d,[key]:e.target.value}))});
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await onSave(Object.fromEntries(keys.map(k=>[k,draft[k]??''])));flash();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <form className="values-form" onSubmit={submit}>{children(field)}
  <div className="form-actions"><button type="submit" className="primary" disabled={busy}>{busy?<Loader2 size={14} className="spin"/>:saved?<Check size={14}/>:null}{saved?'Saved':'Save'}</button></div>
  {error&&<p className="field-error" role="alert">{error}</p>}
 </form>;
}

const OLLAMA_KEYS=['OLLAMA_MODEL','OLLAMA_HOST'],PREF_KEYS=['METADATA_AI','YOUTUBE_REGION','GEMINI_MODEL','GROQ_MODEL','ANTHROPIC_MODEL','OPENAI_MODEL'];

/** Settings screen: AI keys and preferences, saved straight into .env. */
export default function Settings(){
 const [data,setData]=useState<SettingsData|null>(null),[loadError,setLoadError]=useState(''),[tab,setTab]=useState<'ai'|'ollama'|'prefs'>('ai');
 useEffect(()=>{getSettings().then(setData).catch(e=>setLoadError((e as Error).message));},[]);
 const save=async(patch:Record<string,string>)=>{setData(await postSettings(patch));};
 return <section className="settings-screen">
  <header className="screen-heading"><h1>Settings</h1><p>AI keys and preferences. Everything is saved to the .env file in the Reclip folder and applies right away, no restart needed.</p></header>
  {loadError&&<div className="notice warn" role="alert"><CircleAlert size={16}/>{loadError}</div>}
  {data&&data.problems.length>0&&<div className="notice warn" role="status"><CircleAlert size={16}/><ul>{data.problems.map(p=><li key={p}>{p}</li>)}</ul></div>}
  <div className="settings-layout"><nav className="settings-tabs" aria-label="Settings sections"><button type="button" className={tab==='ai'?'active':''} onClick={()=>setTab('ai')}><KeyRound size={16}/>AI providers</button><button type="button" className={tab==='ollama'?'active':''} onClick={()=>setTab('ollama')}><Cpu size={16}/>Ollama</button><button type="button" className={tab==='prefs'?'active':''} onClick={()=>setTab('prefs')}><SlidersHorizontal size={16}/>Preferences</button></nav><div className="settings-content">
  {tab==='ai'&&<section className="settings-section"><h2>AI providers</h2><p className="section-note">One free key (Gemini or Groq) turns on "Write with AI" for titles, descriptions and hashtags. Keys stay on this computer{data?.file?` in ${data.file}`:''}.</p>
   {!data&&!loadError&&<p className="muted"><Loader2 size={14} className="spin"/>Loading…</p>}
   {data&&PROVIDERS.map(p=><KeyRow key={p.key} p={p} status={data.secrets[p.key]} onSave={save}/>)}
  </section>}
  {data&&tab==='ollama'&&<section className="settings-section"><h2>Ollama on this computer</h2><p className="section-note">Free and private: install <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Ollama</a>, run <code>ollama pull llama3.1</code>, then put the model name here.</p>
   <ValuesForm keys={OLLAMA_KEYS} values={data.values} onSave={save}>{field=><>
    <div className="field"><label htmlFor="setting-OLLAMA_MODEL">Model</label><input type="text" {...field('OLLAMA_MODEL')} placeholder="llama3.1" autoComplete="off" spellCheck={false}/><small>A model you pulled with Ollama. Leave blank when using Ollama Cloud (the model then defaults to gpt-oss:120b).</small></div>
    <div className="field"><label htmlFor="setting-OLLAMA_HOST">Host</label><input type="text" {...field('OLLAMA_HOST')} placeholder="localhost:11434" autoComplete="off" spellCheck={false}/><small>Leave blank for this computer (localhost:11434), or type another machine on your network, for example 192.168.1.20:11434.</small></div>
   </>}</ValuesForm>
  </section>}
  {data&&tab==='prefs'&&<section className="settings-section"><h2>Preferences</h2><p className="section-note">Which AI writes your YouTube text, and the region for trending titles.</p>
   <ValuesForm keys={PREF_KEYS} values={data.values} onSave={save}>{field=><>
    <div className="field"><label htmlFor="setting-METADATA_AI">Write with</label><Select {...field('METADATA_AI')}>{METADATA_CHOICES.map(([v,label])=><option key={v} value={v}>{label}</option>)}</Select></div>
    <div className="field"><label htmlFor="setting-YOUTUBE_REGION">YouTube region</label><input type="text" {...field('YOUTUBE_REGION')} placeholder="US" maxLength={2} autoComplete="off" spellCheck={false}/><small>Two-letter country code for YouTube’s trending chart, used as title-style context.</small></div>
    <details className="advanced"><summary>Model names</summary>
     <div className="field"><label htmlFor="setting-GEMINI_MODEL">Gemini model</label><input type="text" {...field('GEMINI_MODEL')} placeholder="gemini-3.8-flash" autoComplete="off" spellCheck={false}/></div>
     <div className="field"><label htmlFor="setting-GROQ_MODEL">Groq model</label><input type="text" {...field('GROQ_MODEL')} placeholder="openai/gpt-oss-120b" autoComplete="off" spellCheck={false}/></div>
     <div className="field"><label htmlFor="setting-ANTHROPIC_MODEL">Claude model (clip picker)</label><input type="text" {...field('ANTHROPIC_MODEL')} placeholder="claude-sonnet-4-6" autoComplete="off" spellCheck={false}/></div>
     <div className="field"><label htmlFor="setting-OPENAI_MODEL">OpenAI model</label><input type="text" {...field('OPENAI_MODEL')} placeholder="gpt-4.1-mini" autoComplete="off" spellCheck={false}/></div>
    </details>
   </>}</ValuesForm>
  </section>}
  </div></div>
 </section>;
}

/** One line for the home page: whether AI writing is on and with which providers, with a jump to Settings. */
export function AiStatusLine({onOpenSettings}:{onOpenSettings:()=>void}){
 const [data,setData]=useState<SettingsData|null>(null);
 useEffect(()=>{getSettings().then(setData).catch(()=>{});},[]);
 if(!data)return null;const on=aiProviders(data);
 return <p className="ai-status"><KeyRound size={15}/>{on.length?`AI is on: ${on.join(', ')}.`:'AI is off: add a free Gemini or Groq key in Settings.'} <button type="button" className="text-button" onClick={onOpenSettings}>Open Settings</button></p>;
}

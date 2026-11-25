// Settings screen: read and change the AI keys and preferences in .env from the app instead of a text editor.
// Secrets never leave this module in full: the app only learns whether a key is set and its last 4 characters.
// Writing keeps every other line of the file (comments, Twitch keys, ports) exactly as it was.
import fs from 'node:fs';import path from 'node:path';import dotenv from 'dotenv';
import {ROOT} from './config.mjs';import {loadEnv,decodeEnv} from './env.mjs';

export const SECRET_FIELDS=['GEMINI_API_KEY','GROQ_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY','OLLAMA_API_KEY'];
export const VALUE_FIELDS=['GEMINI_MODEL','GROQ_MODEL','ANTHROPIC_MODEL','OPENAI_MODEL','OLLAMA_MODEL','OLLAMA_HOST','METADATA_AI','YOUTUBE_REGION'];
export const SETTINGS_FIELDS=[...SECRET_FIELDS,...VALUE_FIELDS];

const readText=file=>{try{return decodeEnv(fs.readFileSync(file)).text;}catch{return '';}};
/** The last 4 characters of a secret, enough to recognise it; a very short value shows nothing. */
const hintOf=value=>value.length>4?value.slice(-4):'';

/** What the Settings screen shows: problems with the file, which secrets are set (hint only) and the plain values. */
export function readSettings({root=ROOT,env=process.env}={}){
 const status=loadEnv({root,env}),values=status.file?dotenv.parse(readText(path.join(root,status.file))):{};
 const valueOf=key=>String(values[key]??env[key]??'').trim();
 return {file:status.file,problems:status.problems,
  secrets:Object.fromEntries(SECRET_FIELDS.map(key=>{const v=valueOf(key);return [key,{set:!!v,hint:v?hintOf(v):''}];})),
  values:Object.fromEntries(VALUE_FIELDS.map(key=>[key,valueOf(key)]))};
}

/** `KEY=value` as dotenv reads it back: quoted when the value has spaces or a # (which would start a comment). */
export function envLine(key,value){
 if(!/[\s#]/.test(value))return `${key}=${value}`;
 return value.includes('"')&&!value.includes("'")?`${key}='${value}'`:`${key}="${value.replace(/"/g,'\\"')}"`;
}

/** Apply KEY→value changes to .env text: replace the live line, else un-comment `# KEY=`, else append. '' clears the key. */
export function patchEnvText(text,patch){
 const eol=text.includes('\r\n')?'\r\n':'\n',lines=text.split(/\r?\n/);if(lines.length&&lines.at(-1)==='')lines.pop();
 for(const [key,raw] of Object.entries(patch)){
  const value=raw.trim(),line=envLine(key,value),live=new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`),commented=new RegExp(`^\\s*#\\s*${key}\\s*=`);
  let at=lines.findLastIndex(l=>live.test(l));if(at<0)at=lines.findIndex(l=>commented.test(l));
  if(at>=0)lines[at]=line;else lines.push(line);
 }
 return lines.join(eol)+eol;
}

/** Check a patch from the app: only known keys, text values, no line breaks (a line break would smuggle in another key). */
export function validateSettings(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Send the settings as an object of KEY: value');
 for(const [key,value] of Object.entries(patch)){
  if(!SETTINGS_FIELDS.includes(key))throw new Error(`Unknown setting: ${key}`);
  if(typeof value!=='string')throw new Error(`${key} must be text`);
  if(/[\r\n]/.test(value))throw new Error(`${key} can’t contain line breaks`);
  if(value.length>4000)throw new Error(`${key} is too long`);
 }
 if(patch.YOUTUBE_REGION!==undefined&&patch.YOUTUBE_REGION.trim()&&!/^[A-Za-z]{2}$/.test(patch.YOUTUBE_REGION.trim()))throw new Error('YOUTUBE_REGION is a two-letter country code, for example US');
 if(patch.METADATA_AI!==undefined&&!['','gemini','groq','ollama','claude'].includes(patch.METADATA_AI.trim().toLowerCase()))throw new Error('METADATA_AI is blank, gemini, groq, ollama or claude');
 return patch;
}

/** Write changed keys into .env (started from .env.example when there is no .env yet), always as UTF-8, then reload. */
export function writeSettings(patch,{root=ROOT,env=process.env}={}){
 validateSettings(patch);
 const status=loadEnv({root,env}),file=path.join(root,status.file||'.env');
 const text=status.file?readText(file):readText(path.join(root,'.env.example'));
 const clean={...patch};if(clean.METADATA_AI!==undefined)clean.METADATA_AI=clean.METADATA_AI.trim().toLowerCase();if(clean.YOUTUBE_REGION!==undefined)clean.YOUTUBE_REGION=clean.YOUTUBE_REGION.trim().toUpperCase();
 fs.writeFileSync(file,patchEnvText(text,clean),'utf8');
 loadEnv({root,env,force:true});
 return readSettings({root,env});
}

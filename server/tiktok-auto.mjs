// TikTok at release time: when a scheduled portrait clip reaches its release time, send the same video to the owner's
// TikTok inbox (TikTok's "upload" mode: it arrives as a draft and a notification, and the owner taps Post in the app).
// TikTok has no scheduling for this, so Reclip sends each clip at its time. Off until the owner turns it on, and the
// standing consent is tied to the TikTok account that was connected then: if the account changes, nothing is sent.
import fs from 'node:fs';import path from 'node:path';import {writeJsonAtomic} from './atomic.mjs';import {tiktokVideoError} from './tiktok.mjs';

const LATE_LIMIT=6*3600e3,MAX_TRIES=3;
export const tiktokAutoFile=root=>path.join(root,'posting','tiktok-auto.json');
export function readTikTokAuto(root){let raw={};try{raw=JSON.parse(fs.readFileSync(tiktokAutoFile(root),'utf8'));}catch{}
 return {enabled:raw.enabled===true,accountId:typeof raw.accountId==='string'?raw.accountId:null,displayName:String(raw.displayName||''),consentAt:raw.consentAt||null,
  sent:raw.sent&&typeof raw.sent==='object'?raw.sent:{},failures:raw.failures&&typeof raw.failures==='object'?raw.failures:{},log:Array.isArray(raw.log)?raw.log.slice(0,100):[]};}
const write=(root,d)=>{fs.mkdirSync(path.dirname(tiktokAutoFile(root)),{recursive:true});writeJsonAtomic(tiktokAutoFile(root),{...d,log:d.log.slice(0,100)});return d;};

/** Posts that should go to TikTok now: portrait, scheduled, release time reached in the last 6 hours, not sent yet. */
export function dueForTikTok(posts,d,now=Date.now()){
 return posts.filter(p=>{const at=Date.parse(p.settings?.publishAt||'');
  return p.settings?.privacy==='schedule'&&Number.isFinite(at)&&at<=now&&at>=now-LATE_LIMIT&&!d.sent[p.id]&&(d.failures[p.id]?.count||0)<MAX_TRIES
   &&!p.duplicateOf&&!tiktokVideoError(p.media);}).sort((a,b)=>Date.parse(a.settings.publishAt)-Date.parse(b.settings.publishAt));
}

export class TikTokAuto{
 constructor({root,posting,drafts,client,now=()=>Date.now(),setTimer=setInterval,clearTimer=clearInterval}){Object.assign(this,{root,posting,drafts,client,now,setTimer,clearTimer});this.timer=null;this.busy=false;}
 log(d,level,message){d.log.unshift({at:new Date(this.now()).toISOString(),level,message:String(message).slice(0,300)});}
 /** What the page shows: the switch, the account it is tied to, whether that account is still the connected one, the log. */
 status(){const d=readTikTokAuto(this.root),c=this.client.status(),soon=this.posting.list().filter(p=>p.settings?.privacy==='schedule'&&Date.parse(p.settings.publishAt||'')>this.now()&&!tiktokVideoError(p.media)&&!d.sent[p.id]).length;
  return {enabled:d.enabled,displayName:d.displayName,connected:c.connected,connectedAs:c.displayName,configured:c.configured,accountMatches:!!d.accountId&&d.accountId===c.accountId,upcoming:soon,sentCount:Object.keys(d.sent).length,log:d.log.slice(0,20)};}
 /** Turning it on needs a connected account and an explicit yes; the yes covers that account only. */
 set({enabled,consent}={}){const d=readTikTokAuto(this.root);
  if(enabled){const c=this.client.status();if(!c.connected)throw new Error('Connect TikTok first (Automation → TikTok setup).');if(consent!==true)throw new Error('Confirm that scheduled clips may be sent to your TikTok inbox.');
   Object.assign(d,{enabled:true,accountId:c.accountId,displayName:c.displayName,consentAt:new Date(this.now()).toISOString()});this.log(d,'info',`Turned on for ${c.displayName||'the connected account'}`);}
  else if(d.enabled){d.enabled=false;this.log(d,'info','Turned off');}
  write(this.root,d);return this.status();}
 start(){this.stop();this.timer=this.setTimer(()=>{this.tick().catch(()=>{});},60e3);this.timer?.unref?.();}
 stop(){if(this.timer)this.clearTimer(this.timer);this.timer=null;}
 /** Send every due clip, one at a time. Safe to call often; returns how many were sent this time. */
 async tick(){if(this.busy)return 0;this.busy=true;let sent=0;
  try{const d=readTikTokAuto(this.root);if(!d.enabled||!d.accountId)return 0;const c=this.client.status();if(!c.connected)return 0;
   if(c.accountId!==d.accountId){if(d.log[0]?.message!=='Paused: a different TikTok account is connected. Turn this on again to use it.'){this.log(d,'warn','Paused: a different TikTok account is connected. Turn this on again to use it.');write(this.root,d);}return 0;}
   for(const p of dueForTikTok(this.posting.list(),d,this.now())){
    let post;try{post=this.posting.get(p.id);}catch{continue;}
    try{const view=await this.drafts.send(post,true,d.accountId);
     d.sent[p.id]={at:new Date(this.now()).toISOString(),state:view.state};delete d.failures[p.id];this.log(d,'info',`Sent to TikTok inbox: ${p.metadata?.title||p.label||p.id}`);sent++;}
    catch(e){const f=d.failures[p.id]||{count:0};d.failures[p.id]={count:f.count+1,at:new Date(this.now()).toISOString(),error:String(e.message).slice(0,200)};
     this.log(d,f.count+1>=MAX_TRIES?'error':'warn',`${f.count+1>=MAX_TRIES?'Gave up on':'Will retry'} "${p.metadata?.title||p.label||p.id}": ${e.message}`);}
    write(this.root,d);}
   return sent;}
  finally{this.busy=false;}}
}

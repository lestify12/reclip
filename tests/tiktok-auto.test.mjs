import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {TikTokAuto,dueForTikTok,readTikTokAuto} from '../server/tiktok-auto.mjs';

const NOW=Date.parse('2026-11-27T06:00:30+08:00');
const portrait={width:1080,height:1920,duration:40,fps:30,videoCodec:'h264'};
const post=(id,publishAt,extra={})=>({id,file:`/tmp/${id}.mp4`,media:portrait,metadata:{title:`Clip ${id}`},settings:{privacy:'schedule',publishAt},...extra});
function setup(posts,{connected=true,accountId='open-1',sendError=null}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reclip-tt-')),sends=[];
 const client={status:()=>({configured:true,connected,displayName:'lestify',accountId:connected?accountId:null})};
 const posting={list:()=>posts,get:id=>posts.find(p=>p.id===id)};
 const drafts={send:async(p,consent,acct)=>{sends.push({id:p.id,consent,acct});if(sendError)throw new Error(sendError);return {state:'processing'};}};
 return {root,sends,client,auto:new TikTokAuto({root,posting,drafts,client,now:()=>NOW,setTimer:()=>({}),clearTimer:()=>{}})};
}

test('due: portrait clips whose release time just arrived, not landscape, future, stale or already sent',()=>{
 const d={sent:{gone:{}},failures:{bad:{count:3}}};
 const posts=[post('now','2026-11-27T06:00:00+08:00'),post('later','2026-11-27T10:00:00+08:00'),post('stale','2026-11-26T22:00:00+08:00'),
  post('wide','2026-11-27T06:00:00+08:00',{media:{...portrait,width:1920,height:1080}}),post('gone','2026-11-27T06:00:00+08:00'),post('bad','2026-11-27T06:00:00+08:00'),
  {...post('draft','2026-11-27T06:00:00+08:00'),settings:{privacy:'private'}}];
 assert.deepEqual(dueForTikTok(posts,d,NOW).map(p=>p.id),['now']);
});

test('turning on needs a connected account and an explicit yes, tied to that account',()=>{
 const off=setup([],{connected:false});assert.throws(()=>off.auto.set({enabled:true,consent:true}),/Connect TikTok/);
 const {auto,root}=setup([]);assert.throws(()=>auto.set({enabled:true}),/Confirm/);
 const s=auto.set({enabled:true,consent:true});assert.equal(s.enabled,true);assert.equal(s.accountMatches,true);assert.equal(readTikTokAuto(root).accountId,'open-1');
 assert.equal(auto.set({enabled:false}).enabled,false);
});

test('tick sends each due clip once, with the stored account, and nothing when off',async()=>{
 const {auto,sends,root}=setup([post('a','2026-11-27T06:00:00+08:00'),post('b','2026-11-27T10:00:00+08:00')]);
 assert.equal(await auto.tick(),0,'off by default');assert.equal(sends.length,0);
 auto.set({enabled:true,consent:true});
 assert.equal(await auto.tick(),1);assert.deepEqual(sends,[{id:'a',consent:true,acct:'open-1'}]);
 assert.equal(await auto.tick(),0,'never sent twice');assert.ok(readTikTokAuto(root).sent.a);
 assert.match(readTikTokAuto(root).log[0].message,/Sent to TikTok inbox: Clip a/);
});

test('a different connected account pauses sending',async()=>{
 const t=setup([post('a','2026-11-27T06:00:00+08:00')]);t.auto.set({enabled:true,consent:true});
 t.client.status=()=>({configured:true,connected:true,displayName:'someone-else',accountId:'open-2'});
 assert.equal(await t.auto.tick(),0);assert.equal(t.sends.length,0);assert.equal(t.auto.status().accountMatches,false);
 assert.match(readTikTokAuto(t.root).log[0].message,/different TikTok account/);
});

test('failures are retried up to three times, then given up',async()=>{
 const t=setup([post('a','2026-11-27T06:00:00+08:00')],{sendError:'TikTok is busy'});t.auto.set({enabled:true,consent:true});
 for(let i=0;i<5;i++)await t.auto.tick();
 assert.equal(t.sends.length,3);const d=readTikTokAuto(t.root);assert.equal(d.failures.a.count,3);assert.match(d.log[0].message,/Gave up/);
});

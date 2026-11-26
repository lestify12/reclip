import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readSettings,writeSettings,patchEnvText,envLine,SETTINGS_FIELDS} from '../server/settings.mjs';

const folder=()=>fs.mkdtempSync(path.join(process.env.TMP||os.tmpdir(),'settings-'));
const withEnv=(text,fn)=>{const dir=folder();if(text!==null)fs.writeFileSync(path.join(dir,'.env'),text);try{return fn(dir,()=>fs.readFileSync(path.join(dir,'.env'),'utf8'));}finally{fs.rmSync(dir,{recursive:true,force:true});}};

test('settings: saving a key replaces its line and leaves the rest of .env alone',()=>withEnv('# my notes\nGEMINI_API_KEY=old-key-1234\nPORT=5173\n',(root,read)=>{
 const env={},s=writeSettings({GEMINI_API_KEY:'AIza-new-key-9876'},{root,env});
 assert.equal(read(),'# my notes\nGEMINI_API_KEY=AIza-new-key-9876\nPORT=5173\n');
 assert.deepEqual(s.secrets.GEMINI_API_KEY,{set:true,hint:'9876'});assert.equal(env.GEMINI_API_KEY,'AIza-new-key-9876','process.env follows the file without a restart');
}));
test('settings: a commented-out key is un-commented in place; a missing key is appended',()=>withEnv('# GROQ_API_KEY=\nYOUTUBE_REGION=US\n',(root,read)=>{
 writeSettings({GROQ_API_KEY:'gsk_abcdef'},{root,env:{}});assert.equal(read(),'GROQ_API_KEY=gsk_abcdef\nYOUTUBE_REGION=US\n');
 writeSettings({OLLAMA_MODEL:'llama3.1'},{root,env:{}});assert.equal(read(),'GROQ_API_KEY=gsk_abcdef\nYOUTUBE_REGION=US\nOLLAMA_MODEL=llama3.1\n');
}));
test('settings: an empty string clears the key, and the app no longer counts it as set',()=>withEnv('GEMINI_API_KEY=abc123xyz\n',(root,read)=>{
 const env={},s=writeSettings({GEMINI_API_KEY:''},{root,env});
 assert.equal(read(),'GEMINI_API_KEY=\n');assert.deepEqual(s.secrets.GEMINI_API_KEY,{set:false,hint:''});assert.equal(env.GEMINI_API_KEY,'');
}));
test('settings: values with spaces or # are quoted so dotenv reads them back whole',()=>withEnv('',(root,read)=>{
 const s=writeSettings({OLLAMA_HOST:'http://192.168.1.20:11434 #home'},{root,env:{}});
 assert.equal(read(),'OLLAMA_HOST="http://192.168.1.20:11434 #home"\n');assert.equal(s.values.OLLAMA_HOST,'http://192.168.1.20:11434 #home');
 assert.equal(envLine('A','plain'),'A=plain');assert.equal(envLine('A','say "hi" there'),`A='say "hi" there'`);
}));
test('settings: with no .env yet, the file starts from .env.example',()=>{
 const root=folder();fs.writeFileSync(path.join(root,'.env.example'),'# Free key\nGEMINI_API_KEY=\nGEMINI_MODEL=gemini-3.8-flash\n');
 const before=readSettings({root,env:{}});assert.equal(before.file,null);assert.match(before.problems[0],/copy \.env\.example/);
 const s=writeSettings({GEMINI_API_KEY:'AIza00001111'},{root,env:{}});fs.rmSync(root,{recursive:true,force:true});
 assert.equal(s.file,'.env');assert.deepEqual(s.problems,[]);assert.equal(s.values.GEMINI_MODEL,'gemini-3.8-flash','the example’s defaults are kept');
});
test('settings: with neither file, .env is created from nothing',()=>withEnv(null,(root,read)=>{
 writeSettings({GROQ_API_KEY:'gsk_1'},{root,env:{}});assert.equal(read(),'GROQ_API_KEY=gsk_1\n');
}));
test('settings: unknown keys, non-text and line breaks are refused before anything is written',()=>withEnv('PORT=5173\n',(root,read)=>{
 assert.throws(()=>writeSettings({CLIP_PYTHON:'x'},{root,env:{}}),/Unknown setting: CLIP_PYTHON/);
 assert.throws(()=>writeSettings({GEMINI_API_KEY:'abc\nPORT=1'},{root,env:{}}),/line breaks/);
 assert.throws(()=>writeSettings({GEMINI_API_KEY:5},{root,env:{}}),/must be text/);
 assert.throws(()=>writeSettings(['GEMINI_API_KEY'],{root,env:{}}),/object/);
 assert.throws(()=>writeSettings({YOUTUBE_REGION:'USA'},{root,env:{}}),/two-letter/);
 assert.throws(()=>writeSettings({METADATA_AI:'openai'},{root,env:{}}),/METADATA_AI/);
 assert.equal(read(),'PORT=5173\n');assert.equal(SETTINGS_FIELDS.length,17);
}));
test('settings: a secret is never returned in full, only its last 4 characters',()=>withEnv('ANTHROPIC_API_KEY=sk-ant-api03-verysecretvalue-7777\nOPENAI_API_KEY=ab\n',(root)=>{
 const s=readSettings({root,env:{}}),json=JSON.stringify(s);
 assert.deepEqual(s.secrets.ANTHROPIC_API_KEY,{set:true,hint:'7777'});assert.equal(s.secrets.ANTHROPIC_API_KEY.hint.length,4);
 assert.ok(!json.includes('verysecret'),'the full key is not in the response');
 assert.deepEqual(s.secrets.OPENAI_API_KEY,{set:true,hint:''},'a tiny value shows no hint at all, since the hint would be the whole value');
 assert.ok(!('ANTHROPIC_API_KEY' in s.values));
}));
test('settings: a real environment variable shows as the value when the file does not have it',()=>withEnv('GROQ_MODEL=from-file\n',(root)=>{
 const s=readSettings({root,env:{GROQ_MODEL:'from-system',YOUTUBE_REGION:'PH'}});assert.equal(s.values.GROQ_MODEL,'from-file');assert.equal(s.values.YOUTUBE_REGION,'PH');
}));
test('settings: a UTF-16 .env (PowerShell) is written back as UTF-8 with its lines kept',()=>withEnv('',(root,read)=>{
 fs.writeFileSync(path.join(root,'.env'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('GEMINI_API_KEY=old\r\nPORT=5173\r\n','utf16le')]));
 const s=writeSettings({GEMINI_API_KEY:'new-key-4321'},{root,env:{}});
 assert.equal(read(),'GEMINI_API_KEY=new-key-4321\r\nPORT=5173\r\n');assert.deepEqual(s.problems,[],'no UTF-16 warning any more');assert.equal(s.secrets.GEMINI_API_KEY.hint,'4321');
}));
test('settings: patchEnvText replaces the last live line (the one dotenv uses) and keeps blank lines',()=>{
 assert.equal(patchEnvText('A=1\n\nGEMINI_API_KEY=x\n  GEMINI_API_KEY=y\n',{GEMINI_API_KEY:'z'}),'A=1\n\nGEMINI_API_KEY=x\nGEMINI_API_KEY=z\n');
 assert.equal(patchEnvText('',{A:'1',B:'2'}),'A=1\nB=2\n');
});

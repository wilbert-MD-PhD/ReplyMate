import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port;
test('clean demo server: paired streams, session auth, private-file isolation and validation',async t=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),QA_BACKEND:'demo',QA_FAST_MODEL:'',QA_SECONDARY_MODEL:'',WHISPER_BIN:'',WHISPER_MODEL:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',d=>{output+=d;});child.stdout.on('data',()=>{});
 try{
  let status;
  for(let i=0;i<100;i++){try{const r=await fetch(origin+'/api/status');status=await r.json();break;}catch{if(child.exitCode!==null)throw Error(output);await delay(50);}}
  assert.ok(status,'server did not start');assert.equal(status.backend,'demo');assert.equal(status.configured,true);assert.equal(status.asr.state,'disabled');
  const post=(route,data,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Session-Token':status.token,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  await t.test('client assets and curated demo load',async()=>{const r=await fetch(origin+'/');assert.match(await r.text(),/Meeting Q&A/);const faq=await(await fetch(origin+'/api/faq')).json();assert.equal(faq.length,3);});
  await t.test('secret and imported directories are never served',async()=>{for(const route of ['/user-data/reference.json','/.env','/bridge.mjs','/examples/reference.json','/%2e%2e/.env'])assert.equal((await fetch(origin+route)).status,404);});
  await t.test('invalid session and cross-origin requests are rejected',async()=>{assert.equal((await post('/api/answer',{question:'Hello?'},{'X-Session-Token':'stale'})).status,403);assert.equal((await fetch(origin+'/api/session',{headers:{Origin:'https://example.invalid'}})).status,403);});
  await t.test('two answer lanes and translation finish independently',async()=>{
   const responses=await Promise.all([
    post('/api/answer',{question:'What are the limitations?',client:'a'}),
    post('/api/answer',{question:'What are the limitations?',client:'a',lane:'secondary',verify:true}),
    post('/api/translate',{question:'What are the limitations?',client:'a'})
   ]);
   const texts=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return r.text();}));
   assert.match(texts[0],/event: done/);assert.match(texts[1],/event: done/);assert.match(texts[2],/这个项目有哪些局限/);assert.doesNotMatch(texts.join(''),/event: error/);
  });
  await t.test('input limits and unknown models fail before streaming',async()=>{for(const data of [{question:''},{question:'x'.repeat(8001)},{question:'Hello?',model:'unknown'}])assert.equal((await post('/api/answer',data)).status,400);});
 }finally{
  const exited=once(child,'exit');child.kill();await Promise.race([exited,delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);
 }
});

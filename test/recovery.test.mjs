import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import {mkdtemp,writeFile,readFile,rm,mkdir,rename,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {atomicJSON} from '../components/settings.mjs';
const fixture=new URL('./fixtures/codex-process.mjs',import.meta.url);
async function until(fn){for(let i=0;i<200;i++){const value=await fn();if(value)return value;await delay(25);}throw Error('Condition timed out');}
test('unique atomic writers leave complete JSON and no temporary files',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'replymate-atomic-'));
 try{const file=path.join(dir,'state.json');await Promise.all(Array.from({length:20},(_,i)=>atomicJSON(file,{i,text:'test'.repeat(1000)})));const result=JSON.parse(await readFile(file,'utf8'));assert.equal(result.i,19);assert.equal(result.text,'test'.repeat(1000));assert.deepEqual(await readdir(dir),['state.json']);}finally{await rm(dir,{recursive:true,force:true});}
});
test('settings transactions, independent page sessions and process recovery',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'replymate-recovery-')),log=path.join(dir,'rpc.jsonl');
 await writeFile(path.join(dir,'settings.json'),JSON.stringify({autoWarm:true}));
 const child=spawn(process.execPath,['--import',fixture.href,'src/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',QA_BACKEND:'auto',CODEX_BIN:'replymate-test-codex',REPLYMATE_TEST_CODEX:'replymate-test-codex',REPLYMATE_TEST_PID:path.join(dir,'codex.pid'),REPLYMATE_TEST_LOG:log,REPLYMATE_CODEX_HOME:path.join(dir,'account'),REPLYMATE_USER_DATA:dir,REPLYMATE_DATA_DIR:dir,REPLYMATE_DESKTOP:'0',WHISPER_BIN:'',WHISPER_MODEL:'',QA_FAST_MODEL:'',QA_SECONDARY_MODEL:''},stdio:['ignore','pipe','pipe']});
 let origin='',errors='';child.stdout.on('data',d=>{origin=String(d).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]||origin;});child.stderr.on('data',d=>{errors+=d;});
 try{
  await until(()=>{if(child.exitCode!==null)throw Error(errors);return origin;});
  const status=client=>fetch(origin+'/api/status'+(client?'?client='+client:'')).then(r=>r.json());
  const initial=await until(async()=>{const s=await status();return s.warmup.state==='ready'&&s;});
  const headers={Origin:origin,'X-Session-Token':initial.token,'Content-Type':'application/json'};
  const post=(route,data)=>fetch(origin+route,{method:'POST',headers,body:JSON.stringify(data)});
  const rpc=async()=>String(await readFile(log)).trim().split('\n').map(line=>JSON.parse(line));
  await t.test('first page claims startup warm-up; other pages warm their own threads',async()=>{
   const before=(await rpc()).filter(m=>m.method==='thread/start').length;
   assert.equal((await status('page-a')).warmup.state,'ready');await delay(100);
   assert.equal((await rpc()).filter(m=>m.method==='thread/start').length,before);
   await status('page-b');await until(async()=>(await status('page-b')).warmup.state==='ready');
   assert.equal((await rpc()).filter(m=>m.method==='thread/start').length,before*2);
  });
  await t.test('fast, deep and translation lanes are isolated across pages, same-page overlap still rejects',async()=>{
   for(const extra of [{},{lane:'secondary'},{translate:true}]){
    const route=extra.translate?'/api/translate':'/api/answer';
    const a=await post(route,{question:'First page?',client:'page-a',...extra});
    const b=await post(route,{question:'Second page?',client:'page-b',...extra});
    assert.equal(a.status,200);assert.equal(b.status,200);
    const duplicate=await post(route,{question:'Overlap?',client:'page-a',...extra});assert.equal(duplicate.status,429);await duplicate.text();
    const [ta,tb]=await Promise.all([a.text(),b.text()]);for(const text of [ta,tb]){assert.match(text,/event: done/);assert.doesNotMatch(text,/event: error/);}
    const thread=text=>text.match(/from ([\w-]+), turn (\d+)/);
    assert.notEqual(thread(ta)[1],thread(tb)[1]);
    const follow=await(await post(route,{question:'First page follow-up?',client:'page-a',...extra})).text();assert.equal(thread(follow)[1],thread(ta)[1]);assert.equal(Number(thread(follow)[2]),Number(thread(ta)[2])+1);
   }
  });
  await t.test('slow settings body reserves transaction before competing settings and answers',async()=>{
   const request=http.request(origin+'/api/settings',{method:'POST',headers});const response=new Promise((resolve,reject)=>{request.once('response',resolve);request.once('error',reject);});request.write('{"language":');
   await delay(100);
   const conflict=await post('/api/settings',{language:'ja'});assert.equal(conflict.status,409);await conflict.text();
   const answer=await post('/api/answer',{question:'Busy?',client:'page-a'});assert.equal(answer.status,409);await answer.text();
   request.end('"zh","autoWarm":false}');const accepted=await response;let body='';for await(const chunk of accepted)body+=chunk;assert.equal(accepted.statusCode,200);assert.equal(JSON.parse(body).settings.language,'zh');
   const s=await status();assert.equal(s.settings.language,'zh');assert.equal(s.asr.language,'zh');assert.equal(JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8')).language,'zh');
  });
  await t.test('validation and persistence failure release lock and restore runtime settings',async()=>{
   assert.equal((await post('/api/settings',{language:'invalid'})).status,400);
   const file=path.join(dir,'settings.json');await rename(file,file+'.saved');await mkdir(file);
   try{assert.equal((await post('/api/settings',{language:'ja'})).status,400);const s=await status();assert.equal(s.settings.language,'zh');assert.equal(s.asr.language,'zh');assert.equal((await readdir(dir)).filter(n=>n.endsWith('.tmp')).length,0);}finally{await rm(file,{recursive:true});await rename(file+'.saved',file);}
   const saved=await post('/api/settings',{language:'en',autoWarm:true});assert.equal(saved.status,200);await saved.text();await until(async()=>(await status('page-a')).warmup.state==='ready');
  });
  await t.test('fatal process exit invalidates every warm-up and reconnects without changing page identity',async()=>{
   const crashed=await post('/api/answer',{question:'[TEST_CRASH]',client:'page-a'});assert.match(await crashed.text(),/event: error/);
   for(const page of ['page-a','page-b']){const s=await until(async()=>{const s=await status(page);return !s.configured&&s;});assert.equal(s.auth.signedIn,false);assert.match(s.auth.error,/AI 服务已退出/);assert.equal(s.warmup.state,'error');}
   const login=await post('/api/auth/login',{});assert.equal(login.status,200);assert.equal((await login.json()).connected,true);
   await until(async()=>(await status('page-a')).warmup.state==='ready');
   const recovered=await status('page-a');assert.equal(recovered.configured,true);assert.equal(recovered.auth.signedIn,true);
   const answer=await(await post('/api/answer',{question:'After reconnect?',client:'page-a'})).text();assert.match(answer,/event: done/);assert.doesNotMatch(answer,/event: error/);
  });
 }finally{
  if(child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}await rm(dir,{recursive:true,force:true});
 }
});

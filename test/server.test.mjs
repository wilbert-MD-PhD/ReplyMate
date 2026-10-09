import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port;
test('clean demo server: paired streams, session auth, private-file isolation and validation',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'replymate-server-test-'));
 const child=spawn(process.execPath,['src/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),QA_BACKEND:'demo',REPLYMATE_DATA_DIR:dataDir,QA_FAST_MODEL:'',QA_SECONDARY_MODEL:'',WHISPER_BIN:'',WHISPER_MODEL:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',d=>{output+=d;});child.stdout.on('data',()=>{});
 try{
  let status;
  for(let i=0;i<100;i++){try{const r=await fetch(origin+'/api/status');status=await r.json();break;}catch{if(child.exitCode!==null)throw Error(output);await delay(50);}}
  assert.ok(status,'server did not start');assert.equal(status.backend,'demo');assert.equal(status.configured,true);assert.equal(status.asr.state,'disabled');
  const post=(route,data,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'X-Session-Token':status.token,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  await t.test('client assets and curated demo load',async()=>{const r=await fetch(origin+'/');assert.match(await r.text(),/ReplyMate/);const faq=await(await fetch(origin+'/api/faq')).json();assert.equal(faq.length,3);assert.equal((await fetch(origin+'/library-sync.mjs')).status,200);const library=await(await fetch(origin+'/api/library')).json();assert.equal(library.version,status.referenceVersion);assert.deepEqual(library.faq,faq);assert.deepEqual(library.sources,status.reference);});
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
  await t.test('imports in the UI are authenticated, saved, applied live and retained after errors',async()=>{
   const send=(name,body,headers={})=>fetch(origin+'/api/library/import',{method:'POST',headers:{Origin:origin,'X-Session-Token':status.token,'X-File-Name':encodeURIComponent(name),...headers},body});
   assert.equal((await send('my.md','New reference',{'X-Session-Token':'wrong'})).status,403);
   assert.equal((await send('my.md','# My talk\n\nOur study includes 12 teams.')).status,200);
   const updated=await(await fetch(origin+'/api/status')).json();assert.equal(updated.customLibrary,true);assert.equal(updated.reference[0].name,'my.md');
   const snapshot=await(await fetch(origin+'/api/library')).json();assert.equal(snapshot.version,updated.referenceVersion);assert.deepEqual(snapshot.faq,[]);assert.deepEqual(snapshot.sources,updated.reference);assert.equal(snapshot.customLibrary,true);
   for(const [route,lane] of [['/api/answer',undefined],['/api/answer','secondary'],['/api/translate',undefined]]){const stale=await post(route,{question:'What is the purpose of this project?',client:'old-page',lane,referenceVersion:status.referenceVersion});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'REFERENCE_CHANGED');}
   const fresh=await post('/api/answer',{question:'What is the purpose of this project?',client:'old-page',referenceVersion:snapshot.version});assert.equal(fresh.status,200);assert.match(await fresh.text(),/event: done/);
   assert.deepEqual(await(await fetch(origin+'/api/faq')).json(),[]);
   assert.match(await readFile(path.join(dataDir,'reference.json'),'utf8'),/12 teams/);
   assert.equal((await send('bad.json','{}')).status,400);
   assert.match(await readFile(path.join(dataDir,'reference.json'),'utf8'),/12 teams/);
   const answer=await(await post('/api/answer',{question:'Tell me about the study with 12 teams',client:'new'})).text();assert.match([...answer.matchAll(/^data: (.+)$/gm)].map(m=>JSON.parse(m[1]).text||'').join(''),/12 teams/);
   const batch=async(mode,entries)=>{
    const body=new FormData();for(const [name,text] of entries)body.append('files',new Blob([text]),name);
    return fetch(origin+'/api/library/import?mode='+mode,{method:'POST',headers:{Origin:origin,'X-Session-Token':status.token},body});
   };
   assert.equal((await batch('append',[['a.txt','Unique alpha'],['b.txt','Unique beta']])).status,200);
   let stored=JSON.parse(await readFile(path.join(dataDir,'reference.json'),'utf8'));
   assert.equal(stored.sources.length,3);assert.match(JSON.stringify(stored),/12 teams/);
   const before=await readFile(path.join(dataDir,'reference.json'),'utf8');
   assert.equal((await batch('replace',[['valid.txt','Must not commit'],['invalid.json','{}']])).status,400);
   assert.equal(await readFile(path.join(dataDir,'reference.json'),'utf8'),before);
   assert.equal((await batch('replace',[['a.txt','Replacement alpha'],['b.txt','Replacement beta']])).status,200);
   stored=JSON.parse(await readFile(path.join(dataDir,'reference.json'),'utf8'));
   assert.equal(stored.sources.length,2);assert.doesNotMatch(JSON.stringify(stored),/12 teams/);
   assert.equal((await post('/api/auth/login',{}, {'X-Session-Token':'stale'})).status,403);
   assert.equal((await(await fetch(origin+'/api/auth/status')).json()).signedIn,false);
  });
 }finally{
  const exited=once(child,'exit');child.kill();await Promise.race([exited,delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);await rm(dataDir,{recursive:true,force:true});
 }
});

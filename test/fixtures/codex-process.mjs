// Isolated RPC fixture. The preload only redirects the explicit test executable.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {appendFileSync,writeFileSync} from 'node:fs';
const file=fileURLToPath(import.meta.url);
if(!process.argv.includes('--mock-codex')){
 const spawn=childProcess.spawn;
 childProcess.spawn=function(command,args,options){return command===process.env.REPLYMATE_TEST_CODEX?spawn(process.execPath,[file,'--mock-codex'],options):spawn(command,args,options);};
 syncBuiltinESMExports();
}else{
 writeFileSync(process.env.REPLYMATE_TEST_PID,String(process.pid));
 let seq=0;const turns=new Map(),send=m=>process.stdout.write(JSON.stringify(m)+'\n');
 createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);if(m.id===undefined)return;
  let result={};
  if(m.method==='account/read')result={account:{type:'chatgpt',email:'fixture@example.invalid'}};
  if(m.method==='model/list')result={data:['gpt-6-sol','gpt-6-astra'].map(model=>({model,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}))};
  if(m.method==='thread/start')result={thread:{id:process.pid+'-thread-'+(++seq)},model:m.params.model,reasoningEffort:'low'};
  if(m.method==='turn/start'){
   const text=m.params.input[0].text;if(text.includes('[TEST_CRASH]'))process.exit(1);
   const tid='turn-'+(++seq),threadId=m.params.threadId;result={turn:{id:tid}};
   const count=(turns.get(threadId)||0)+1;turns.set(threadId,count);
   setTimeout(()=>{send({method:'turn/started',params:{threadId,turn:{id:tid}}});send({method:'item/agentMessage/delta',params:{threadId,delta:`Fixture answer from ${threadId}, turn ${count}.`}});send({method:'turn/completed',params:{threadId,turn:{id:tid,status:'completed'}}});},text.startsWith('[WARMUP]')?80:500);
  }
  appendFileSync(process.env.REPLYMATE_TEST_LOG,JSON.stringify({method:m.method,params:m.params,result})+'\n');
  send({id:m.id,result});
 });
}

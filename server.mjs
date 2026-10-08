import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {config,root} from './config.mjs';
import {readLibrary} from './library.mjs';
import {LocalASR} from './asr.mjs';
import {retrieve,prepareRetrieval} from './core.mjs';
import {CodexBridge} from './bridge.mjs';
import {DemoBridge} from './demo.mjs';
const {port}=config,origin=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex');
const localLibrary=path.join(root,'user-data/reference.json');
const reference=await readLibrary(existsSync(localLibrary)?localLibrary:path.join(root,'examples/reference.json'));
prepareRetrieval(reference.chunks);
const asr=new LocalASR(root,reference.terms);
const bridge=config.backend==='codex'?new CodexBridge(reference):new DemoBridge(reference);
let startupError=null,fastModel='',secondaryModel='',raceModels=[];
bridge.on('fatal',e=>{startupError=e.message;});
const ready=bridge.ready.then(()=>{
 const models=bridge.models;
 const choose=id=>{if(id&&!models.some(m=>m.id===id))throw Error('所配置模型不在当前列表中，请清空 QA_FAST_MODEL / QA_SECONDARY_MODEL 后重试');return id||models.find(m=>m.isDefault)?.id||models[0].id;};
 fastModel=choose(config.fastModel);secondaryModel=choose(config.secondaryModel||fastModel);
 raceModels=config.backend==='demo'?[]:[fastModel,...models.filter(m=>m.id!==fastModel).map(m=>m.id)].slice(0,2);bridge.raceModels=raceModels;
}).catch(e=>{startupError=e.message;});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function bytes(req,max){let parts=[],size=0;for await(const c of req){size+=c.length;if(size>max)throw Error('Request too large');parts.push(c);}return Buffer.concat(parts);}
const publicFiles=new Set(['index.html','app.js','style.css','pcm-worklet.js','logic.mjs','capture.mjs','speech-pipeline.mjs','answer-lanes.mjs','prepared.mjs','session-fetch.mjs']);
const active=new Map();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'");
 if(req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'Use '+origin});
 if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Cross-origin requests are not allowed'});
 if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Cross-site requests are not allowed'});
 try{
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{token});
  if(req.method==='GET'&&url.pathname==='/api/status'){
   await ready;return json(res,200,{configured:!startupError,token,models:bridge.models||[],reference:reference.sources,referenceVersion:reference.version,referenceStats:reference.stats,error:startupError,version:'2.3.0',backend:config.backend,mode:config.backend==='demo'?'离线演示，无 AI 生成':'通过本机 Codex 登录使用模型',raceModels,fastModel,secondaryModel,terms:reference.terms,asr:{state:asr.state,error:asr.error}});
  }
  if(req.method==='GET'&&url.pathname==='/api/faq')return json(res,200,reference.faq.filter(f=>f.reviewed));
  if(req.method==='POST'){
   if(req.headers.origin!==origin||req.headers['x-session-token']!==token)return json(res,403,{error:'会话已失效，请刷新页面'});
   if(url.pathname==='/api/transcribe')return json(res,200,await asr.transcribe(await bytes(req,2880044),req.headers['x-asr-quality']==='accurate'?'accurate':'fast'));
   if(!['/api/answer','/api/translate','/api/warm'].includes(url.pathname))return json(res,404,{error:'Not found'});
   await ready;if(startupError)throw Error(startupError);
   const data=JSON.parse((await bytes(req,64000)).toString()||'{}');
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('JSON object required');
   const model=data.model||fastModel,client=String(data.client||'default').slice(0,80);
   if(model!=='race'&&!bridge.models.some(m=>m.id===model))throw Error('Unknown model');
   if(model==='race'&&!raceModels.length)throw Error('Model race is not available');
   if(url.pathname==='/api/warm'){
    const candidates=model==='race'?raceModels:[model];
    const results=await Promise.allSettled([...candidates.map(m=>bridge.prime(m,client)),bridge.prime(secondaryModel,client+':secondary'),bridge.prime(fastModel,client+':translation','translation')]);
    if(results.some(r=>r.status==='rejected'))throw Error('部分模型预热失败，请检查登录状态或模型配置');
    return json(res,200,{model:candidates.join(' + ')+' / '+secondaryModel,tier:config.backend,effort:'按模型支持的配置'});
   }
   if(typeof data.question!=='string'||!data.question.trim()||data.question.length>8000)return json(res,400,{error:'请输入 1–8000 字符的问题'});
   const translating=url.pathname==='/api/translate',actualModel=translating?fastModel:model;
   const answerClient=client+(translating?':translation':data.lane==='secondary'?':secondary':'');
   // Bound concurrency and prevent overlapping turns in the same client/lane.
   if(active.has(answerClient)||active.size>=12)return json(res,429,{error:'上一条请求尚未结束，请稍后重试'});
   const ac=new AbortController();active.set(answerClient,ac);res.on('close',()=>ac.abort());
   const start=performance.now();let first=null;
   res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
   const emit=(event,value)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);};
   if(!translating)emit('sources',{sources:retrieve(data.question,reference.chunks).map(c=>c.source||c.title)});
   try{
    const result=await (actualModel==='race'?bridge.race.bind(bridge):bridge.answer.bind(bridge))({question:data.question.trim(),model:actualModel,client:answerClient,task:translating?'translation':'answer',previousQuestions:Array.isArray(data.previousQuestions)?data.previousQuestions.filter(x=>typeof x==='string').slice(-2).map(x=>x.slice(0,8000)):[],verify:!!data.verify,manual:!!data.manual,alternatives:Array.isArray(data.alternatives)?data.alternatives.filter(x=>typeof x==='string').slice(0,2).map(x=>x.slice(0,4000)):[]},(text,winningModel)=>{if(first===null&&!text.trim())return;if(first===null)first=performance.now()-start;emit('delta',{text,model:winningModel||actualModel,serverFirstMs:Math.round(first)});},ac.signal);
    emit('done',{model:result.model,tier:result.tier,effort:result.effort,serverFirstMs:first===null?null:Math.round(first),totalMs:Math.round(performance.now()-start)});
   }catch(e){emit('error',{error:e.message});}finally{active.delete(answerClient);res.end();}return;
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!publicFiles.has(file))return json(res,404,{error:'Not found'});
  const mime=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript';
  const contents=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'});res.end(contents);
 }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=15000;
function close(){for(const controller of active.values())controller.abort();bridge.close();asr.close();server.close();server.closeAllConnections();}
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'端口已占用，请在 .env 修改 PORT':'服务启动失败：'+error.message);close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Meeting Q&A: ${origin}\nBackend: ${config.backend}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{close();setTimeout(()=>process.exit(),300).unref();});

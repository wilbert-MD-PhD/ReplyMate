import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {config,root,dataDir,appDataDir} from './config.mjs';
import {parseImport,saveLibrary,maxImportBytes} from './workspace.mjs';
import {readLibrary} from './library.mjs';
import {LocalASR} from './asr.mjs';
import {retrieve,prepareRetrieval} from './core.mjs';
import {CodexBridge} from './bridge.mjs';
import {DemoBridge} from './demo.mjs';
import {selectAnswerModels} from './model-policy.mjs';
import {loadCatalog,languages,languageAllowed,appVersion} from './components/catalog.mjs';
import {ComponentManager} from './components/manager.mjs';
import {Settings} from './components/settings.mjs';
import {resolveRuntime,parserFor,ComponentRequired} from './components/runtime-resolver.mjs';
import {selfTest,silenceWav} from './components/self-test.mjs';
import {Warmup} from './warmup.mjs';
const catalog=await loadCatalog(),settings=new Settings(appDataDir);await settings.load();
const startupSession={client:randomBytes(16).toString('hex'),warmup:new Warmup()},pageSessions=new Map();
function pageSession(id,warm=false){
 const key=String(id||'').slice(0,80);if(!key)return startupSession;
 if(!pageSessions.has(key)){
  // Only the first page claims the startup warm-up. Other pages own separate threads.
  const session=pageSessions.size?{client:randomBytes(16).toString('hex'),warmup:new Warmup()}:startupSession;
  pageSessions.set(key,session);if(warm)void ready.then(()=>{if(!setupBusy)return autoWarm(session);});
 }
 return pageSessions.get(key);
}
function resetWarmups(message,error=false){for(const session of new Set([startupSession,...pageSessions.values()])){session.warmup.reset(message);if(error)session.warmup.state.state='error';}}
const components=await new ComponentManager(appDataDir,catalog,{selfTest,beforeSwitch,afterSwitch}).init();
let port=config.port,origin;const token=randomBytes(32).toString('hex');
const localLibrary=path.join(dataDir,'reference.json');
let reference=await readLibrary(existsSync(localLibrary)?localLibrary:path.join(root,'examples/reference.json'));
prepareRetrieval(reference.chunks);
const asr=new LocalASR(root,reference.terms,asrOptions());
let demo=new DemoBridge(reference),codex=null,bridge=demo,backend='demo';
let startupError=null,authError=null,fastModel='',fastSelection='',secondaryModel='',secondaryError='',raceModels=[],setupBusy=false,refreshing=null,warming=0;
function selectBridge(){
 const nextBridge=codex?.account&&codex.models.length?codex:demo;
 const selection=selectAnswerModels(nextBridge.models,config);
 bridge=nextBridge;backend=bridge===codex?'codex':'demo';
 const changed=fastSelection!==selection.fastSelection||secondaryModel!==selection.secondaryModel;
 ({fastModel,fastSelection,secondaryModel,secondaryError,raceModels}=selection);
 if(changed)resetWarmups();
 bridge.raceModels=raceModels;
}
async function ensureCodex(){
 if(!codex||codex.lastError||codex.bootFailed){
  const bin=components.state.installed['codex-runtime']?await resolveRuntime(components,'codex-runtime'):config.desktop||!config.codexBin?null:config.codexBin;
  if(!bin)throw new ComponentRequired('codex-runtime');
  codex?.close();codex=new CodexBridge(reference,{bin,language:settings.value.language});
  const instance=codex;codex.on('fatal',e=>{if(codex!==instance)return;authError=e.message;if(bridge===instance)startupError=e.message;resetWarmups(e.message,true);});
 }
 await codex.ready;authError=null;startupError=null;selectBridge();return codex;
}
async function refreshAccount(){
 if(!codex||codex.lastError||active.size||warming||setupBusy)return;
 if(refreshing)return refreshing;
 refreshing=codex.refreshAccount().then(()=>{selectBridge();authError=codex.loginError||null;void autoWarm();}).catch(e=>{authError=e.message;}).finally(()=>{refreshing=null;});
 return refreshing;
}
selectBridge();
const ready=config.backend==='demo'?Promise.resolve():ensureCodex().catch(e=>{if(e.code!=='COMPONENT_REQUIRED')authError=e.message;});
void ready.then(()=>autoWarm());
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function bytes(req,max){let parts=[],size=0;for await(const c of req){size+=c.length;if(size>max)throw Error('Request too large');parts.push(c);}return Buffer.concat(parts);}
const publicFiles=new Set(['index.html','app.js','auth-url.mjs','style.css','pcm-worklet.js','logic.mjs','capture.mjs','speech-pipeline.mjs','answer-lanes.mjs','prepared.mjs','session-fetch.mjs','components-ui.mjs','speech-config.mjs']);
const active=new Map();

function asrOptions(value=settings.value){return {bin:components.state.installed['whisper-runtime']?components.entryPath('whisper-runtime'):config.whisperBin,model:components.state.installed[value.model]?components.entryPath(value.model):config.whisperModel,modelId:value.model,version:components.state.installed['whisper-runtime']?.version,language:value.language,threads:value.threads,useGPU:value.useGPU};}
async function configureASR(value=settings.value){await asr.configure(asrOptions(value));if(asr.state==='ready')await asr.transcribe(silenceWav(),'fast',{language:value.language});}
async function beforeSwitch(id){if(active.size||warming||setupBusy||asr.busy)throw Error('组件已下载，请等当前回答或转写完成后重试安装');if(id==='codex-runtime'){codex?.close();codex=null;selectBridge();}if(id==='whisper-runtime'||id===settings.value.model)await asr.stop();}
async function afterSwitch(id){if(id==='codex-runtime'){if(components.state.installed[id])await ensureCodex().catch(e=>{authError=e.message;});else selectBridge();resetWarmups();void autoWarm();}if(id==='whisper-runtime'||id===settings.value.model)await configureASR();}
async function warmModels(session=startupSession,model=fastSelection,deepModel=secondaryModel){
 const {client,warmup}=session;if(startupError)return warmup.state;
 const enabled=backend==='codex'&&settings.value.autoWarm,candidates=model==='race'?raceModels:[model];
 if(enabled&&(!candidates.every(m=>bridge.models.some(x=>x.id===m))))throw Error(secondaryError||'所选模型不可用');
 const jobs=[...candidates.map(m=>({label:m,run:()=>bridge.prime(m,client)})),{label:'深度回答',run:()=>deepModel?bridge.prime(deepModel,client+':secondary'):Promise.reject(Error(secondaryError||'未选择深度模型'))},{label:'中文辅助',run:()=>bridge.prime(fastModel,client+':translation','translation')}];
 const key=JSON.stringify([client,candidates,deepModel,reference.version,settings.value.language]);
 if(enabled)warming++;try{return await warmup.run(key,jobs,{enabled,message:!settings.value.autoWarm?'自动预热已关闭':config.desktop&&!components.state.installed['codex-runtime']?'等待安装 AI 回答组件，安装并登录后自动预热':'等待登录账号，登录后自动预热'});}finally{if(enabled)warming--;}
}
function autoWarm(session){if(setupBusy)return Promise.resolve();return Promise.all((session?[session]:[...new Set([startupSession,...pageSessions.values()])]).map(s=>warmModels(s).catch(e=>{s.warmup.reset(e.message);s.warmup.state.state='error';})));}

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
   const session=pageSession(url.searchParams.get('client'),true);
   return json(res,200,{configured:!startupError,token,models:bridge.models||[],reference:reference.sources,referenceVersion:reference.version,referenceStats:reference.stats,error:startupError,version:appVersion,warmup:session.warmup.state,settings:settings.value,aiInstalled:!!components.state.installed['codex-runtime']||!config.desktop&&!!config.codexBin,backend,desktop:config.desktop,auth:{signedIn:!!codex?.account&&!codex?.lastError,pending:!!codex?.login&&!codex?.lastError,error:authError},customLibrary:existsSync(localLibrary),mode:backend==='demo'?'离线演示，无 AI 生成':'已连接账号，可生成 AI 回答',raceModels,fastModel,fastSelection,secondaryModel,secondaryError,terms:reference.terms,asr:asr.snapshot()});
  }
  if(req.method==='GET'&&url.pathname==='/api/auth/status'){await ready;await refreshAccount();return json(res,200,{signedIn:!!codex?.account&&!codex?.lastError,pending:!!codex?.login&&!codex?.lastError,error:authError,backend});}
  if(req.method==='GET'&&url.pathname==='/api/components'){if(req.headers['x-session-token']!==token)return json(res,403,{error:'会话已失效，请刷新页面'});return json(res,200,{...await components.snapshot(),settings:settings.value,languages,asr:asr.snapshot()});}
  if(req.method==='GET'&&url.pathname==='/api/faq')return json(res,200,reference.faq.filter(f=>f.reviewed));
  if(req.method==='POST'){
   if(req.headers.origin!==origin||req.headers['x-session-token']!==token)return json(res,403,{error:'会话已失效，请刷新页面'});
   if(url.pathname==='/api/quit'){if(!config.desktop)return json(res,404,{error:'Not found'});process.parentPort?.postMessage({type:'quit'});return json(res,200,{ok:true});}
   if(url.pathname.startsWith('/api/components/')){
    const action=url.pathname.split('/').at(-1);
    if(action==='import')return json(res,200,await components.importFile(String(req.headers['x-component-id']||''),req));
    const d=JSON.parse((await bytes(req,8192)).toString()||'{}');let result;
    if(action==='plan')result=components.plan(d.id,{repair:!!d.repair});
    else if(action==='install')result=await components.start(d.id,{repair:!!d.repair});
    else if(['pause','resume','cancel'].includes(action))result=await components.control(d.task,action);
    else if(action==='verify')result=await components.verify(d.id);
    else if(action==='uninstall')result=await components.uninstall(d.id);
    else if(action==='rollback')result=await components.rollback(d.id);
    else if(action==='clear-cache')result=await components.clearCache();
    else return json(res,404,{error:'Not found'});return json(res,200,result);
   }
   if(url.pathname==='/api/settings'){
    if(active.size||warming||setupBusy||asr.busy||components.busy)return json(res,409,{error:'请先停止收音并等待当前任务完成'});
    // Reserve before reading a possibly slow body; validation and rollback share the lock.
    setupBusy=true;const previous=settings.value;let configuring=false;
    try{
     await ready;await refreshing;
     const d=JSON.parse((await bytes(req,8192)).toString()),next={...previous};
     if(!d||typeof d!=='object'||Array.isArray(d))throw Error('JSON object required');
     for(const key of ['model','language','speechMode','threads','useGPU','autoWarm'])if(key in d)next[key]=d[key];
     const model=components.entry(next.model);if(model.kind!=='model'||!languageAllowed(model,next.language))throw Error('该模型不支持所选语言，英语专用版需要先切换为多语言模型');
     if(!['fast','local','dual'].includes(next.speechMode)||!Number.isInteger(next.threads)||next.threads<1||next.threads>16||typeof next.useGPU!=='boolean'||typeof next.autoWarm!=='boolean')throw Error('语音设置无效');
     if(next.speechMode!=='fast'){await resolveRuntime(components,'whisper-runtime');await resolveRuntime(components,next.model);}
     configuring=true;await configureASR(next);await settings.save(next);
     if(codex){codex.language=next.language;codex.sessions.clear();}resetWarmups();
    }catch(e){if(configuring)await configureASR(previous).catch(()=>{});throw e;}finally{setupBusy=false;}
    void autoWarm();return json(res,200,{settings:settings.value,asr:asr.snapshot()});
   }
   if(['/api/auth/login','/api/auth/cancel','/api/auth/logout','/api/library/import','/api/quit'].includes(url.pathname)){
    if(active.size||warming||setupBusy)return json(res,409,{error:'请等当前回答或资料导入完成后再操作'});
    setupBusy=true;
    try{
     await ready;await refreshing;
     if(url.pathname==='/api/auth/login'){const c=await ensureCodex();queueMicrotask(()=>autoWarm());return json(res,200,c.account&&c.models.length?{connected:true}:await c.startLogin());}
     if(url.pathname==='/api/auth/cancel'){await codex?.cancelLogin();authError=null;return json(res,200,{ok:true});}
     if(url.pathname==='/api/auth/logout'){await codex?.logout();selectBridge();authError=null;queueMicrotask(()=>autoWarm());return json(res,200,{ok:true});}
     if(url.pathname==='/api/quit'){if(!config.desktop)return json(res,404,{error:'Not found'});process.parentPort?.postMessage({type:'quit'});return json(res,200,{ok:true});}
     const name=decodeURIComponent(req.headers['x-file-name']||'');
     const library=await parseImport(name,await bytes(req,maxImportBytes),{parser:id=>parserFor(components,id)});
     const result=await saveLibrary(dataDir,library);
     reference=library;prepareRetrieval(reference.chunks);asr.terms=reference.terms;
     demo.close();demo=new DemoBridge(reference);
     if(codex){codex.reference=reference;codex.sessions.clear();}
     selectBridge();resetWarmups();queueMicrotask(()=>autoWarm());return json(res,200,{ok:true,stats:reference.stats,sources:reference.sources,...result});
    }finally{setupBusy=false;}
   }
   if(setupBusy)return json(res,409,{error:'正在更新账号或资料，请稍后重试'});
   if(url.pathname==='/api/transcribe'){const ac=new AbortController();res.on('close',()=>ac.abort());const audio=await bytes(req,2880044);if(setupBusy)return json(res,409,{error:'正在更新设置，请稍后重试'});return json(res,200,await asr.transcribe(audio,req.headers['x-asr-quality']==='accurate'?'accurate':'fast',{signal:ac.signal,language:settings.value.language}));}
   if(!['/api/answer','/api/translate','/api/warm'].includes(url.pathname))return json(res,404,{error:'Not found'});
   await ready;if(startupError)throw Error(startupError);
   const data=JSON.parse((await bytes(req,64000)).toString()||'{}');
   if(setupBusy)return json(res,409,{error:'正在更新账号或资料，请稍后重试'});
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('JSON object required');
   const translating=url.pathname==='/api/translate',deep=data.lane==='secondary';
   const model=translating?fastModel:data.model||(deep?secondaryModel:fastSelection),session=pageSession(data.client),client=session.client;
   if(deep&&!model)throw Error(secondaryError);
   if(deep&&model==='race')throw Error('深度回答须使用独立模型');
   if(model!=='race'&&!bridge.models.some(m=>m.id===model))throw Error('Unknown model');
   if(model==='race'&&raceModels.length<2)throw Error('Model race requires at least two models');
   if(url.pathname==='/api/warm'){
    const state=await warmModels(session,model,data.secondaryModel||secondaryModel);return json(res,state.state==='error'?503:200,{...state,model:fastSelection+' / '+secondaryModel,tier:backend,effort:'按模型支持的配置'});
   }
   if(typeof data.question!=='string'||!data.question.trim()||data.question.length>8000)return json(res,400,{error:'请输入 1–8000 字符的问题'});
   const actualModel=model;
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
  const contents=await readFile(file==='auth-url.mjs'?path.join(root,file):path.join(root,'public',file));res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'});res.end(contents);
 }catch(e){if(!res.headersSent)json(res,400,{error:e.message,code:e.code,component:e.component});else res.end();}
});
server.requestTimeout=600000;server.headersTimeout=15000;
let closing;function close(){return closing||=(async()=>{for(const controller of active.values())controller.abort();demo.close();codex?.close();components.close();server.close();server.closeAllConnections();await asr.close();})();}
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'端口已占用，请在 .env 修改 PORT':'服务启动失败：'+error.message);close();process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{port=server.address().port;origin=`http://127.0.0.1:${port}`;console.log(`ReplyMate: ${origin}`);process.parentPort?.postMessage({type:'ready',origin});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void close().finally(()=>process.exit());});

process.parentPort?.on('message',({data})=>{if(data?.type==='shutdown'){void close().finally(()=>process.exit());}});

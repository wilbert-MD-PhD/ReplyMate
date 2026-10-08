import {componentCenter} from './components-ui.mjs';
import {speechBudget,browserLocales} from './speech-config.mjs';
import {isLoginURL} from './auth-url.mjs';
import {sessionFetch,setSessionToken} from './session-fetch.mjs';
import {QuestionStore,normalize,hasQuestionContent} from './logic.mjs';
import {CaptureSession,BrowserTranscriber} from './capture.mjs';
import {createPreparedIndex,findPrepared,normalizePreparedQuestion} from './prepared.mjs';
import {AnswerLanes} from './answer-lanes.mjs';
import {resolveSpeech} from './speech-pipeline.mjs';
const $=id=>document.getElementById(id),store=new QuestionStore(),lanes=new AnswerLanes();

const client=crypto.randomUUID(),statusURL='/api/status?client='+encodeURIComponent(client);
let backendMode='demo',speechSettings={language:'en',speechMode:'fast'},aiInstalled=false,pendingImport=null,failedSegment=null;const asrControllers=new Set();

let token='',configured=false,faq=[],faqIndex=new Map(),terms=[],warming=Promise.resolve(),activeController=null,pumping=false;
let listening=false,stream=null,context=null,node=null,transcribing=0,lastSubmitted='',lastSubmitTime=0,processing=Promise.resolve(),recognizer=null,recognizerState='stopped',lastAudioPacket=null,audioReceivedMs=0,pendingSegment=null;
let authTimer=null;
let versionId=null,renderedKey='',audioURL=null;
const sec=n=>Number.isFinite(n)?(n/1000).toFixed(2)+' s':'—';
const notice=t=>{$('notice').textContent=t;$('notice').hidden=!t;};
const center=componentCenter({post,notice,canSwitch:()=>!listening&&!transcribing,onChanged:async snapshot=>{await init();if(pendingImport&&snapshot?.entries.some(e=>e.id===pendingImport.component&&e.state==='installed')){const file=pendingImport.file;pendingImport=null;await importFile(file,true);}}});
async function post(url,data,signal){return sessionFetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({...data,client}),signal});}
function showWarm(state={}){const labels={waiting:'预热待就绪',warming:'正在自动预热',ready:'预热完成',error:'预热未完成'};$('warmupStatus').textContent=labels[state.state]||'正在检查预热';$('warmupStatus').dataset.state=state.state||'waiting';$('warmupDetail').textContent=(state.message||'')+(state.total?' · '+state.completed+'/'+state.total+' 个通道':'')+(state.errors?.length?' · '+state.errors.join('；'):'');$('warmupProgress').max=state.total||1;$('warmupProgress').value=state.completed||0;$('retryWarm').disabled=state.state==='warming'||backendMode==='demo';$('warm').disabled=$('retryWarm').disabled;}
async function warm(){try{showWarm({state:'warming',message:'正在预热所选模型'});const r=await post('/api/warm',{model:$('model').value,secondaryModel:$('deepModel').value});const d=await r.json();showWarm(d);if(!r.ok)throw Error(d.error||d.message);$('backendStatus').textContent=d.model+' · '+d.effort+' · '+d.tier;}catch(e){notice('预热未完成：'+e.message);showWarm({state:'error',message:e.message});}}

async function consume(r,fn){if(!r.ok)throw Error((await r.json()).error);let buffer='';const decoder=new TextDecoder();for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),data=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5);if(data)fn(event,JSON.parse(data));}}}
function prepared(question){return $('cache').checked?findPrepared(faqIndex,question):null;}
function submit(question,meta={}){
 question=question.trim();if(!question)return;
 // Limit ASR duplicate suppression to nearby utterances; allow a repeated question later.
 if(meta.voice&&normalize(question)===lastSubmitted&&performance.now()-lastSubmitTime<2500){if(meta.audioURL)URL.revokeObjectURL(meta.audioURL);return;}
 lastSubmitted=normalize(question);lastSubmitTime=performance.now();const q=store.add(question,{...meta,submittedAt:performance.now()});q.attempts[0].model=$('model').value;q.attempts[0].deepModel=$('deepModel').value;if(meta.manual){store.selected=q.id;store.follow=true;store.holdUntil=0;versionId=null;}render();pump();return q;
}
const attemptKey=(q,a)=>q.id+':'+a.id;
const previousQuestions=q=>store.items.slice(0,store.items.indexOf(q)).slice(-2).map(x=>x.attempts.at(-1).question);
function startCompanions(q,a){
 a.secondary={text:'',state:'queued',model:a.deepModel};
 const key=attemptKey(q,a),context=previousQuestions(q);
 function launch(lane,target,url,data){
  lanes.enqueue(lane,key,async signal=>{
   target.state='running';const start=performance.now();let done=false;render();
   if(!configured)throw Error('连接未就绪，请点击顶部的登录按钮重新连接');
   if(lane==='secondary'&&!target.model)throw Error('请在模型设置中选择深度回答模型');
   const r=await post(url,{question:a.question,previousQuestions:context,...data},signal);
   await consume(r,(event,d)=>{
    if(event==='error')throw Error(d.error);
    if(event==='sources')target.sources=d.sources;
    if(event==='delta'&&d.text){if(target.firstMs===undefined&&d.text.trim()){target.firstMs=performance.now()-start;target.e2e=q.meta.audioEnd!=null&&!a.bypassCache?performance.now()-q.meta.audioEnd:undefined;}target.text+=d.text;render();}
    if(event==='done'){done=true;target.model=d.model||target.model;target.effort=d.effort;target.totalMs=d.totalMs;}
   });
   if(!done)throw Error('连接中断，请重试');target.state='done';
  }).catch(e=>{target.state=e.name==='AbortError'?'stopped':'error';target.error=e.message;}).finally(render);
 }
 launch('secondary',a.secondary,'/api/answer',{model:a.secondary.model,lane:'secondary',verify:true,manual:!!q.meta.manual||!!a.corrected,alternatives:a.corrected?[]:q.meta.alternatives||[]});
 const prior=q.attempts.slice(0,-1).findLast(old=>old.question===a.question&&old.translation?.state==='done');
 const known=findPrepared(faqIndex,a.question);
 if(known?.questionZh&&normalizePreparedQuestion(a.question)===normalizePreparedQuestion(known.question))a.translation={text:known.questionZh,state:'done',kind:'prepared'};
 else if((q.meta.language||speechSettings.language)==='zh')a.translation={text:a.question,state:'done',kind:'original'};
 else if(prior)a.translation={...prior.translation};
 else{a.translation={text:'',state:'queued'};launch('translation',a.translation,'/api/translate',{});}
}
async function pump(){if(pumping)return;pumping=true;
 try{let job;while((job=store.next())){const {q,a}=job;const ac=new AbortController();activeController=ac;startCompanions(q,a);render();
  try{
   if(a.onlySecondary){store.finish(q.id,a.id);continue;}
   const hit=a.bypassCache?null:prepared(a.question);
   if(hit){a.text=hit.answer;a.kind='prepared';a.model='预设快答 · '+(hit.referenceVersion||'本地资料');a.sources=hit.sources;store.finish(q.id,a.id);requestAnimationFrame(()=>{a.preparedDisplayMs=performance.now()-q.meta.submittedAt;render();});continue;}
   if(!configured)throw Error('后端未连接，请检查配置后重启');
   if(ac.signal.aborted)throw new DOMException('已停止','AbortError');
   const start=performance.now();let done=false;a.started=start;
   const prior=previousQuestions(q);
   const r=await post('/api/answer',{question:a.question,model:a.model||$('model').value,previousQuestions:prior,verify:a.verify,alternatives:a.corrected?[]:q.meta.alternatives||[],manual:!!q.meta.manual||!!a.corrected},ac.signal);
   await consume(r,(event,d)=>{
    if(event==='error')throw Error(d.error);
    if(event==='sources')a.sources=d.sources;
    if(event==='delta'&&d.text){if(a.firstMs===undefined&&d.text.trim()){a.goalMs=performance.now()-(a.submittedAt||q.meta.submittedAt);a.firstMs=performance.now()-start;a.e2e=q.meta.audioEnd!=null&&!a.bypassCache?performance.now()-q.meta.audioEnd:undefined;}a.text+=d.text;a.model=d.model||a.model;render();}
    if(event==='done'){done=true;a.effort=d.effort;a.totalMs=d.totalMs;}
   });
   if(!done)throw Error('连接中断，回答未完成');store.finish(q.id,a.id);
  }catch(e){store.finish(q.id,a.id,{state:e.name==='AbortError'?'stopped':'error',error:e.message});}
  finally{activeController=null;render();}
 }}finally{pumping=false;render();}
}
function selected(){return store.items.find(q=>q.id===store.selected);}
function retry(onlySecondary=false,correctedText=null){const q=selected();if(!q)return;const old=q.attempts.find(a=>a.id===versionId)||q.attempts.at(-1);const a=store.enqueue(q.id,correctedText||old.question,{bypassCache:true,submittedAt:performance.now(),corrected:correctedText!==null||old.corrected,model:$('model').value,deepModel:$('deepModel').value,onlySecondary});if(onlySecondary)Object.assign(a,{text:old.text,model:old.model,effort:old.effort,firstMs:old.firstMs,e2e:old.e2e,sources:old.sources,kind:old.kind,error:old.error});versionId=a.id;store.select(q.id);store.holdUntil=0;render();pump();}

function render(){
 store.tick(performance.now(),Number($('hold').value)*1000);
 const q=selected();$('retranscribe').disabled=!q?.meta.audioURL;const idx=store.items.indexOf(q),a=q?.attempts.find(a=>a.id===versionId)||q?.attempts.at(-1);
 $('queueStatus').textContent=`${transcribing?'转写中 '+transcribing+' 条 · ':''}${store.running?'快速回答中 · ':''}${store.items.some(q=>q.attempts.some(a=>['queued','running'].includes(a.secondary?.state)))?'深度回答处理中 · ':''}待答 ${store.jobs.length} 条 · 共 ${store.items.length} 题`;
 $('prev').disabled=idx<=0;$('next').disabled=idx<0||idx>=store.items.length-1;$('live').textContent=store.follow?'自动跟随现场':'回到现场';
 $('cancel').disabled=!a||![a,a.secondary,a.translation].some(x=>x&&['running','queued'].includes(x.state));
 for(const id of ['retry','verify','editBtn','copy','copySecondary'])$(id).disabled=!q;
 if(q&&a){
  $('answeredQuestion').lang=(q.meta.language||speechSettings.language)==='auto'?'':(q.meta.language||speechSettings.language);
  $('goalResult').textContent=a.kind==='prepared'?'预设不计时':backendMode==='demo'?'演示不计时':Number.isFinite(a.goalMs)?sec(a.goalMs)+(a.goalMs<=3000?' · 达标':' · 超时'):a.state==='running'?'计时中':'—';$('goalResult').className=a.goalMs<=3000?'fast':'slow';
  $('questionNumber').textContent='#'+(idx+1);$('answeredQuestion').textContent=a.question;$('answerText').textContent=a.text||(a.state==='queued'?'Waiting in queue…':a.state==='error'?a.error:a.state==='stopped'?'Stopped.':'Preparing answer…');
  $('sourceTag').textContent='快速回答 · 深度回答';$('fastSource').textContent=(a.model==='race'?'多模型竞速中':a.model||'等待')+(a.effort?' · '+a.effort:'');$('answerStatus').textContent=({queued:'Queued',running:'Streaming',done:a.kind==='prepared'?'Prepared':a.kind==='clarification'?'Clarify':'Done',error:'Error',stopped:'Stopped'})[a.state];
  $('e2eLabel').textContent=q.meta.manual?'手动提交 → 首字':'语音结束 → 生成首字¹';
  $('ttftLabel').textContent=a.kind==='prepared'?'预设显示（提交后）':'请求 → 首字';
  $('ttft').textContent=a.kind==='prepared'?(Number.isFinite(a.preparedDisplayMs)?Math.round(a.preparedDisplayMs)+' ms':'即时'):a.kind?'不计时':sec(a.firstMs);$('e2e').textContent=a.kind?'—':sec(a.e2e);$('ttft').className=a.kind==='prepared'||a.firstMs<=3000?'fast':'slow';$('e2e').className=a.e2e<=3000?'fast':'slow';
  $('questionTranslation').textContent=a.translation?.text||(a.translation?.state==='error'?'中文翻译暂不可用，可点击重答重试':a.translation?.state==='stopped'?'中文翻译已停止':'中文翻译中…');
  const secondary=a.secondary||{state:'queued',text:''};
  $('secondaryText').textContent=secondary.text||(secondary.state==='error'?secondary.error:secondary.state==='stopped'?'Stopped.':secondary.state==='queued'?'Waiting for the deep answer…':'Thinking through the question…');
  $('deepSource').textContent=secondary.model||'待选择模型';
  $('secondaryStatus').textContent=({queued:'排队中',running:'生成中',done:'已完成',error:'生成失败',stopped:'已停止'})[secondary.state];
  $('secondaryTiming').textContent=secondary.firstMs!==undefined?'首字 '+sec(secondary.firstMs)+(secondary.effort?' · '+secondary.effort:''):'';
  $('copySecondary').disabled=!secondary.text;

  $('rawTranscript').textContent='浏览器：'+(q.meta.browser||'未使用 / 无结果');$('localTranscript').textContent='本地：'+(q.meta.local||'未使用 / 无结果')+(q.meta.asrMs?' · '+sec(q.meta.asrMs):'')+(q.meta.rechecked?'\n再次转写：'+q.meta.rechecked:'');$('answerSources').textContent='检索依据：'+(a.sources?.join(' / ')||'参考摘要');
  if(audioURL!==q.meta.audioURL){audioURL=q.meta.audioURL;$('replay').pause();if(audioURL)$('replay').src=audioURL;else $('replay').removeAttribute('src');$('replay').hidden=!audioURL;}
  const key=q.id+':'+q.attempts.length;if(renderedKey!==key){renderedKey=key;$('versions').replaceChildren(...q.attempts.map((a,i)=>new Option('第 '+(i+1)+' 次 · '+a.question.slice(0,60),a.id)));}
  $('versions').value=String(a.id);
 }
 const signature=store.items.map(q=>q.id+q.attempts.at(-1).state+q.attempts.at(-1).secondary?.state).join('|')+'|'+store.selected;
 if($('history').dataset.signature!==signature){$('history').dataset.signature=signature;$('history').replaceChildren(...store.items.map((q,i)=>{const b=document.createElement('button');b.className='questioncard'+(q.id===store.selected?' selected':'');const small=document.createElement('small');small.textContent='#'+(i+1)+' · 快速 '+q.attempts.at(-1).state+' / 深度回答 '+(q.attempts.at(-1).secondary?.state||'queued');b.append(small,document.createTextNode(q.text.slice(0,100)));b.onclick=()=>{store.select(q.id);versionId=null;render();};return b;}));}
}
function renderFAQ(){const search=$('faqSearch').value.toLowerCase();$('faqs').replaceChildren(...faq.filter(f=>(f.title+' '+f.question+' '+(f.questionZh||'')+' '+f.answer).toLowerCase().includes(search)).map(f=>{const b=document.createElement('button');b.textContent=f.title;b.onclick=()=>{const q=submit(f.question);if(q){store.select(q.id);versionId=null;render();}};return b;}));}
const capture=new CaptureSession({canSubmit:text=>hasQuestionContent(text,speechSettings.language),silence:()=>Number($('silence').value),threshold:()=>Number($('threshold').value),onDraft:text=>{$('question').value=text;$('partial').textContent='正在转写…';},onSegment:segment=>{
 recognizer?.commit();$('question').value='';$('partial').textContent='问题已结束，正在处理…';
 if(transcribing>=speechBudget.maxQueue){failedSegment=segment;$('retrySpeech').hidden=false;notice('转写积压，已暂停收音。当前片段已保留，可稍后重试或选择更小模型。');stopListening();return;}
 const mode=$('speechMode').value,questionsOnly=$('questionsOnly').checked;transcribing++;render();
 processing=processing.then(async()=>{try{
  if(pendingSegment&&!segment.manual&&performance.now()-pendingSegment.savedAt<20000&&pendingSegment.rate===segment.rate){segment={...segment,text:[pendingSegment.text,segment.text].filter(Boolean).join(' '),frames:[...pendingSegment.frames,...segment.frames].slice(-840)};}pendingSegment=null;
  const result=await resolveSpeech(segment,{mode,questionsOnly,language:speechSettings.language,transcribe:async clip=>{const ac=new AbortController();asrControllers.add(ac);try{const r=await sessionFetch('/api/transcribe',{method:'POST',headers:{'X-Session-Token':token,'Content-Type':'audio/wav'},body:clip,signal:AbortSignal.any([ac.signal,AbortSignal.timeout(speechBudget.requestMs)])});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}finally{asrControllers.delete(ac);}}});
  if(result.defer){if(result.merge)pendingSegment={...segment,savedAt:performance.now()};$('partial').textContent='这一段尚未形成完整问题，继续听取…';return;}
  if(result.empty){$('partial').textContent=result.error;failedSegment=segment;$('retrySpeech').hidden=false;return;}
  if(result.filtered){if(!capture.text)$('question').value=result.question;$('partial').textContent='这句已转写，提问过滤未通过。可点“立即回答”直接提交。';return;}
  result.meta.language=speechSettings.language;const audioURL=result.clip?URL.createObjectURL(result.clip):null;submit(result.question,{...result.meta,audioURL,audioBlob:result.clip});
  if(!capture.text)$('partial').textContent='已提交，继续接收下一题';
 }catch(e){notice('这段处理失败：'+e.message);if(segment.text&&!capture.text)$('question').value=segment.text;}
 finally{transcribing--;render();}});
}});
function seal(manual=false){capture.commit({manual,text:manual?($('question').value||capture.text):undefined});}
function autoCheck(){if(!listening)return;if(lastAudioPacket!==null&&performance.now()-lastAudioPacket>3500){notice('音频采集没有持续返回数据，已暂停。请重新开始收音。');stopListening();return;}capture.tick(performance.now(),{auto:$('auto').checked});recognizer?.watchdog(capture.lastVoice);}
function startRecognition(){
 if($('speechMode').value==='local'){$('listenStatus').textContent='收音中 · 停顿后本地转写';return;}
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 recognizer=new BrowserTranscriber({locale:browserLocales[speechSettings.language],factory:()=>SR?new SR():null,onText:(text,meta)=>{if(listening)capture.updateText(text,meta);},onState:(state,detail)=>{
  recognizerState=state;if(!listening)return;
  const labels={connecting:'收音中 · 正在连接转写',listening:'收音中 · 实时转写',reconnecting:'收音中 · 转写重连',recovering:'收音中 · 转写恢复',unavailable:'浏览器转写不可用',stopped:'已暂停'};
  $('listenStatus').textContent=labels[state]||state;
  if(state==='recovering'||state==='unavailable')$('partial').textContent='浏览器转写暂不可用，本地录音继续。'+(detail||'');
 }});recognizer.start();
}
async function startListening(){
 if($('speechMode').value!=='local'&&!browserLocales[speechSettings.language]){notice('此语言或自动检测没有浏览器 locale 映射，请选择明确的浏览器支持语言，或使用本地模式。');return;}
 if(!(window.SpeechRecognition||window.webkitSpeechRecognition)&&$('speechMode').value==='fast'){notice('此浏览器没有语音识别功能。请手动输入，或配置本地 Whisper。');return;}
 $('listen').disabled=true;notice('');
 try{let source;
 stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
 context=new AudioContext();await context.resume();await context.audioWorklet.addModule('/pcm-worklet.js');
 source=context.createMediaStreamSource(stream);
 node=new AudioWorkletNode(context,'level-processor');const mute=context.createGain();mute.gain.value=0;source.connect(node).connect(mute).connect(context.destination);listening=true;capture.discard();pendingSegment=null;lastAudioPacket=performance.now();audioReceivedMs=0;
 node.port.onmessage=({data})=>{if(!listening)return;lastAudioPacket=performance.now();audioReceivedMs+=1000*data.pcm.length/data.rate;$('audioHealth').textContent='音频数据正常 · '+(audioReceivedMs/1000).toFixed(1)+' 秒';$('levelBar').style.width=Math.min(100,data.rms*650)+'%';capture.push(data);autoCheck();};
 node.onprocessorerror=()=>{notice('音频处理已中断，请重新开始收音。');stopListening();};
 stream?.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(listening){notice('麦克风连接中断，请重新开始收音。');stopListening();}}));
 $('listen').textContent='暂停收音';$('micDot').classList.add('live');$('finish').disabled=false;$('speechMode').disabled=true;startRecognition();
 }catch(e){notice('无法开启麦克风：'+e.message);stopListening();}finally{$('listen').disabled=false;}
}
function stopListening(){listening=false;try{recognizer?.stop();}catch{}recognizer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;context?.close().catch(()=>{});context=null;node=null;capture.discard();$('listen').textContent='开始收音';$('listenStatus').textContent='已暂停';$('audioHealth').textContent='已接收音频 '+(audioReceivedMs/1000).toFixed(1)+' 秒';$('micDot').classList.remove('live');$('finish').disabled=true;$('speechMode').disabled=false;$('levelBar').style.width='0';$('partial').textContent='';}
function showASR(asr){$('asrStatus').textContent=asr.state==='ready'?'本地 Whisper 已就绪':asr.state==='disabled'?'本地转写未启用，可使用浏览器转写或手动输入':'本地语音：'+(asr.error||'启动中');for(const opt of $('speechMode').options)if(opt.value!=='fast')opt.disabled=asr.state!=='ready';}
function syncStatus(s){
 token=s.token;setSessionToken(token);configured=s.configured;backendMode=s.backend;aiInstalled=s.aiInstalled;
 $('connection').textContent=configured?(s.backend==='demo'?'离线演示 · 无 AI 生成':'Codex 已连接'):'连接失败';
 $('backendStatus').textContent=s.error||s.mode;showAccount(s.auth);showWarm(s.warmup);showASR(s.asr);
}
async function init(){try{const s=await(await fetch(statusURL)).json();syncStatus(s);terms=s.terms||[];
 speechSettings=s.settings||speechSettings;$('speechMode').value=speechSettings.speechMode||'fast';$('question').lang=speechSettings.language==='auto'?'':speechSettings.language;$('questionsOnly').disabled=speechSettings.language!=='en';
 $('model').replaceChildren(...s.models.map(m=>new Option('单模型 · '+m.id+' · '+m.effort,m.id)));if(s.raceModels.length>1)$('model').add(new Option('多模型竞速 · 首个返回者回答','race'),0);$('model').value=s.fastSelection;
 $('raceDescription').textContent=s.raceModels.length>1?'默认同时请求 '+s.raceModels.join('、')+'，首个非空正文返回后保留胜出者，停止其他竞速请求。':s.backend==='demo'?'离线演示仅用于体验界面。':'当前只有一个快速模型可用，暂不能竞速。';
 $('deepModel').replaceChildren(...s.models.map(m=>new Option(m.id+(m.id==='gpt-6-astra'?' · 最强模型优先':''),m.id)));if(!s.secondaryModel)$('deepModel').add(new Option('请选择深度回答模型',''),0);$('deepModel').value=s.secondaryModel;
 $('deepDescription').textContent=s.backend==='demo'?'登录后默认使用 GPT-6 Astra 独立生成深度回答。':s.secondaryError||'默认使用 GPT-6 Astra 独立生成，优先回答质量。它可能较慢，竞速结束不会取消深度回答，也不阻塞下一题快答。';
 $('benchResults').textContent=s.backend==='demo'?'演示模式仅显示示例或资料摘录，不调用模型，也不自动翻译未知问题。':'模型来自当前账户列表，访问权限以实际请求为准。';
 $('sources').replaceChildren();for(const src of s.reference){const li=document.createElement('li');li.textContent=src.name;$('sources').append(li);}faq=await(await fetch('/api/faq')).json();faqIndex=createPreparedIndex(faq);$('faqCount').textContent=faq.length+' 条预设问答';$('referenceStatus').textContent=(s.referenceVersion||'')+' · '+faq.length+' 条问答 · '+faqIndex.size+' 种问法已加载';renderFAQ();showAccount(s.auth);if(s.auth?.pending)pollLogin();$('quitApp').hidden=!s.desktop;$('importState').textContent=s.customLibrary?'已载入：'+s.reference.map(x=>x.name).join('、'):'当前使用虚构示例，可直接点击下方预设问题体验。';if(s.backend==='demo')notice('演示模式：不调用 AI。登录后即可生成真实回答。');else if(!configured)notice(s.error);else notice(''); // Reconnection refreshes controls without clearing the in-memory question store.

 }catch(e){notice('连接失败：'+e.message);}render();}
function showAccount(auth={}){
 $('accountState').textContent=auth.signedIn?(auth.error?'账号已登录，AI 连接未就绪：'+auth.error:'账号已连接，已自动选择可用模型。'):auth.pending?'请在浏览器打开的官方页面完成登录，完成后这里会自动连接。':auth.error||'无需配置。可以先用示例体验，再登录自己的账号。';
 $('loginBtn').hidden=auth.signedIn&&!auth.error;$('loginBtn').textContent=auth.signedIn||auth.error&&aiInstalled?'重新连接':aiInstalled?'登录 ChatGPT':'启用 AI 回答';$('loginBtn').disabled=!!auth.pending;
 $('logoutBtn').hidden=!auth.signedIn;$('cancelLogin').hidden=!auth.pending;
 if(!auth.pending)$('loginLink').hidden=true;
}
function pollLogin(){
 clearTimeout(authTimer);
 const deadline=Date.now()+5*60*1000;
 const poll=async()=>{try{const r=await fetch('/api/auth/status');const a=await r.json();showAccount(a);if(a.signedIn){await init();return;}if(!a.pending)return;if(Date.now()>deadline){await post('/api/auth/cancel',{});showAccount({error:'登录等待超时，请点击登录重试。'});return;}authTimer=setTimeout(poll,1500);}catch(e){showAccount({error:'登录状态读取失败，请重新登录。'});}};
 authTimer=setTimeout(poll,1000);
}
$('loginBtn').onclick=async()=>{
 if(!aiInstalled){await center.open('codex-runtime').catch(e=>notice(e.message));return;}
 const popup=window.open('about:blank','replymate-login');if(popup)popup.opener=null;
 $('loginBtn').disabled=true;
 try{const r=await post('/api/auth/login',{});const a=await r.json();if(!r.ok)throw Error(a.error);if(a.connected){popup?.close();await init();return;}if(!isLoginURL(a.authUrl))throw Error('登录地址无效，请重试');if(popup)popup.location.href=a.authUrl;$('loginLink').href=a.authUrl;$('loginLink').hidden=false;showAccount({pending:true});pollLogin();}
 catch(e){popup?.close();showAccount({error:e.message});}
};
$('cancelLogin').onclick=async()=>{try{const r=await post('/api/auth/cancel',{});if(!r.ok)throw Error((await r.json()).error);clearTimeout(authTimer);showAccount();}catch(e){notice(e.message);}};
$('logoutBtn').onclick=async()=>{try{const r=await post('/api/auth/logout',{});if(!r.ok)throw Error((await r.json()).error);await init();}catch(e){notice(e.message);}};
async function importFile(file,resumed=false){
 if(!file)return;if(file.size>20000000){notice('文件最大 20 MB，请精简后重试。');return;}
 if(!resumed&&store.items.length&&!window.confirm('更换资料后将清空当前页面的问答。请先复制需要保留的回答，旧资料会自动备份。继续导入？'))return;
 $('importBtn').disabled=true;$('importState').textContent='正在读取并保存资料…';
 try{const r=await sessionFetch('/api/library/import',{method:'POST',headers:{'X-Session-Token':token,'X-File-Name':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},body:file});const d=await r.json();if(!r.ok){if(d.code==='COMPONENT_REQUIRED'){pendingImport={file,component:d.component};$('importState').textContent=d.error+'，安装完成后将继续读取。';await center.open(d.component);return;}throw Error(d.error);}location.reload();}
 catch(e){$('importState').textContent='导入未完成：'+e.message;}
 finally{$('importBtn').disabled=false;$('libraryFile').value='';}
}
$('importBtn').onclick=()=>$('libraryFile').click();$('libraryFile').onchange=()=>importFile($('libraryFile').files[0]);
$('importZone').ondragover=e=>{e.preventDefault();$('importZone').classList.add('dragover');};$('importZone').ondragleave=()=>$('importZone').classList.remove('dragover');$('importZone').ondrop=e=>{e.preventDefault();$('importZone').classList.remove('dragover');if(e.dataTransfer.files.length!==1){notice('请每次导入一份资料。');return;}importFile(e.dataTransfer.files[0]);};
$('quitApp').onclick=async()=>{const r=await post('/api/quit',{});if(r.ok){document.body.textContent='答伴已退出，可以关闭此页面。';}};
$('listen').onclick=()=>listening?stopListening():startListening();$('finish').onclick=()=>seal(true);$('answer').onclick=()=>{if($('question').value.trim())seal(true);else notice('请先输入问题，或等转写文字出现。');};$('clear').onclick=()=>{$('question').value='';capture.discard();pendingSegment=null;recognizer?.commit();};
$('prev').onclick=()=>{store.move(-1);versionId=null;render();};$('next').onclick=()=>{store.move(1);versionId=null;render();};$('live').onclick=()=>{store.live();versionId=null;render();};$('retry').onclick=()=>retry();$('verify').onclick=()=>retry(true);$('cancel').onclick=()=>{const q=selected(),a=q?.attempts.find(a=>a.id===versionId)||q?.attempts.at(-1);if(!a)return;lanes.cancel(attemptKey(q,a));if(store.running?.qid===q.id&&store.running.aid===a.id)activeController?.abort();if(a.state==='queued'){store.jobs=store.jobs.filter(j=>j.aid!==a.id);a.state='stopped';}render();};$('editBtn').onclick=()=>{$('editPanel').hidden=!$('editPanel').hidden;$('editText').value=selected()?.attempts.at(-1).question||'';};$('saveEdit').onclick=()=>{if($('editText').value.trim()){retry(false,$('editText').value.trim());$('editPanel').hidden=true;}};$('retranscribe').onclick=async()=>{const q=selected();if(!q?.meta.audioURL)return;try{notice('正在重新转写这一题的原音…');const blob=q.meta.audioBlob;if(!blob)throw Error('请重新录制这一题，旧页面没有保留可复核的音频对象');const r=await sessionFetch('/api/transcribe',{method:'POST',headers:{'X-Session-Token':token,'X-ASR-Quality':'accurate','Content-Type':'audio/wav'},body:blob});const d=await r.json();if(!r.ok)throw Error(d.error);q.meta.rechecked=d.text;store.select(q.id);$('editPanel').hidden=false;$('editText').value=d.text;notice('再次转写已放入修改框，请核对后点击重答。');render();}catch(e){notice(e.message);}};
$('retrySpeech').onclick=()=>{if(failedSegment){const segment=failedSegment;failedSegment=null;$('retrySpeech').hidden=true;capture.onSegment(segment);}};
$('speechMode').onchange=async()=>{try{const r=await post('/api/settings',{speechMode:$('speechMode').value}),d=await r.json();if(!r.ok)throw Error(d.error);speechSettings=d.settings;}catch(e){$('speechMode').value=speechSettings.speechMode;notice(e.message);}};
$('replay').onplay=()=>{if(listening)stopListening();};
$('versions').onchange=()=>{versionId=Number($('versions').value);store.select(store.selected);render();};
$('deepModel').onchange=()=>{$('deepDescription').textContent='所选模型独立生成深度回答，竞速结束不会取消它。';notice('深度回答使用 '+$('deepModel').value+'，下次提问或重答时生效。');};$('model').onchange=()=>notice('已选择 '+$('model').value+'，下次提问时生效。');$('warm').onclick=$('retryWarm').onclick=()=>{warming=warming.then(warm);};$('faqSearch').oninput=renderFAQ;$('settingsBtn').onclick=()=>{$('setup').hidden=!$('setup').hidden;};$('copySecondary').onclick=()=>navigator.clipboard.writeText($('secondaryText').textContent).catch(e=>notice(e.message));$('copy').onclick=()=>navigator.clipboard.writeText($('answerText').textContent).catch(e=>notice(e.message));
$('silence').oninput=()=>$('silenceLabel').textContent=$('silence').value+' ms';$('threshold').oninput=()=>$('thresholdLabel').textContent=Number($('threshold').value).toFixed(3);$('hold').oninput=()=>$('holdLabel').textContent=$('hold').value+' 秒';
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('answer').click();}if(e.key==='Escape')stopListening();if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){if(e.key==='ArrowLeft')$('prev').click();if(e.key==='ArrowRight')$('next').click();}});
setInterval(()=>{autoCheck();render();},200);window.addEventListener('beforeunload',()=>{for(const ac of asrControllers)ac.abort();stopListening();activeController?.abort();lanes.cancelAll();for(const q of store.items)if(q.meta.audioURL)URL.revokeObjectURL(q.meta.audioURL);});init();

let checkingStatus=false;setInterval(async()=>{if(checkingStatus)return;checkingStatus=true;try{const s=await(await fetch(statusURL)).json();const changed=s.backend!==backendMode;syncStatus(s);if(changed)await init();}catch{}finally{checkingStatus=false;}},1500);

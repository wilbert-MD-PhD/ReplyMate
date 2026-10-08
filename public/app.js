import {sessionFetch,setSessionToken} from './session-fetch.mjs';
import {QuestionStore,normalize,hasQuestionContent} from './logic.mjs';
import {CaptureSession,BrowserTranscriber} from './capture.mjs';
import {createPreparedIndex,findPrepared,normalizePreparedQuestion} from './prepared.mjs';
import {AnswerLanes} from './answer-lanes.mjs';
import {resolveSpeech} from './speech-pipeline.mjs';
const $=id=>document.getElementById(id),store=new QuestionStore(),client=crypto.randomUUID(),lanes=new AnswerLanes();

let secondaryModel='',backendMode='demo';
let token='',configured=false,faq=[],faqIndex=new Map(),terms=[],warming=Promise.resolve(),activeController=null,pumping=false;
let listening=false,stream=null,context=null,node=null,transcribing=0,lastSubmitted='',lastSubmitTime=0,processing=Promise.resolve(),recognizer=null,recognizerState='stopped',lastAudioPacket=null,audioReceivedMs=0,pendingSegment=null;
let versionId=null,renderedKey='',audioURL=null;
const sec=n=>Number.isFinite(n)?(n/1000).toFixed(2)+' s':'—';
const notice=t=>{$('notice').textContent=t;$('notice').hidden=!t;};
async function post(url,data,signal){return sessionFetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({...data,client}),signal});}
async function warm(){try{$('connection').textContent='模型预热中…';const r=await post('/api/warm',{model:$('model').value});const d=await r.json();if(!r.ok)throw Error(d.error);$('backendStatus').textContent=d.model+' · '+d.effort+' · '+d.tier;$('connection').textContent=backendMode==='demo'?'离线演示 · 无 AI 生成':'Codex 已连接';}catch(e){notice('预热未完成：'+e.message);$('connection').textContent='可提问 · 预热待重试';}}
async function consume(r,fn){if(!r.ok)throw Error((await r.json()).error);let buffer='';const decoder=new TextDecoder();for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),data=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5);if(data)fn(event,JSON.parse(data));}}}
function prepared(question){return $('cache').checked?findPrepared(faqIndex,question):null;}
function submit(question,meta={}){
 question=question.trim();if(!question)return;
 // Limit ASR duplicate suppression to nearby utterances; allow a repeated question later.
 if(meta.voice&&normalize(question)===lastSubmitted&&performance.now()-lastSubmitTime<2500){if(meta.audioURL)URL.revokeObjectURL(meta.audioURL);return;}
 lastSubmitted=normalize(question);lastSubmitTime=performance.now();const q=store.add(question,{...meta,submittedAt:performance.now()});q.attempts[0].model=$('model').value;if(meta.manual){store.selected=q.id;store.follow=true;store.holdUntil=0;versionId=null;}render();pump();return q;
}
const attemptKey=(q,a)=>q.id+':'+a.id;
const previousQuestions=q=>store.items.slice(0,store.items.indexOf(q)).slice(-2).map(x=>x.attempts.at(-1).question);
function startCompanions(q,a){
 a.secondary={text:'',state:'queued',model:secondaryModel};
 const key=attemptKey(q,a),context=previousQuestions(q);
 function launch(lane,target,url,data){
  lanes.enqueue(lane,key,async signal=>{
   target.state='running';const start=performance.now();let done=false;render();
   if(!configured)throw Error('后端未连接，请检查配置后重启');
   const r=await post(url,{question:a.question,previousQuestions:context,...data},signal);
   await consume(r,(event,d)=>{
    if(event==='error')throw Error(d.error);
    if(event==='sources')target.sources=d.sources;
    if(event==='delta'&&d.text){if(target.firstMs===undefined){target.firstMs=performance.now()-start;target.e2e=q.meta.audioEnd!=null&&!a.bypassCache?performance.now()-q.meta.audioEnd:undefined;}target.text+=d.text;render();}
    if(event==='done'){done=true;target.effort=d.effort;target.totalMs=d.totalMs;}
   });
   if(!done)throw Error('连接中断，请重试');target.state='done';
  }).catch(e=>{target.state=e.name==='AbortError'?'stopped':'error';target.error=e.message;}).finally(render);
 }
 launch('secondary',a.secondary,'/api/answer',{model:secondaryModel,lane:'secondary',verify:true,manual:!!q.meta.manual||!!a.corrected,alternatives:a.corrected?[]:q.meta.alternatives||[]});
 const prior=q.attempts.slice(0,-1).findLast(old=>old.question===a.question&&old.translation?.state==='done');
 const known=findPrepared(faqIndex,a.question);
 if(known?.questionZh&&normalizePreparedQuestion(a.question)===normalizePreparedQuestion(known.question))a.translation={text:known.questionZh,state:'done',kind:'prepared'};
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
    if(event==='delta'&&d.text){if(a.firstMs===undefined){a.firstMs=performance.now()-start;a.e2e=q.meta.audioEnd!=null&&!a.bypassCache?performance.now()-q.meta.audioEnd:undefined;}a.text+=d.text;a.model=d.model||a.model;render();}
    if(event==='done'){done=true;a.effort=d.effort;a.totalMs=d.totalMs;}
   });
   if(!done)throw Error('连接中断，回答未完成');store.finish(q.id,a.id);
  }catch(e){store.finish(q.id,a.id,{state:e.name==='AbortError'?'stopped':'error',error:e.message});}
  finally{activeController=null;render();}
 }}finally{pumping=false;render();}
}
function selected(){return store.items.find(q=>q.id===store.selected);}
function retry(onlySecondary=false,correctedText=null){const q=selected();if(!q)return;const old=q.attempts.find(a=>a.id===versionId)||q.attempts.at(-1);const a=store.enqueue(q.id,correctedText||old.question,{bypassCache:true,corrected:correctedText!==null||old.corrected,model:$('model').value,onlySecondary});if(onlySecondary)Object.assign(a,{text:old.text,model:old.model,effort:old.effort,firstMs:old.firstMs,e2e:old.e2e,sources:old.sources,kind:old.kind,error:old.error});versionId=a.id;store.select(q.id);store.holdUntil=0;render();pump();}

function render(){
 store.tick(performance.now(),Number($('hold').value)*1000);
 const q=selected();$('retranscribe').disabled=!q?.meta.audioURL;const idx=store.items.indexOf(q),a=q?.attempts.find(a=>a.id===versionId)||q?.attempts.at(-1);
 $('queueStatus').textContent=`${transcribing?'转写中 '+transcribing+' 条 · ':''}${store.running?'快速回答中 · ':''}${store.items.some(q=>q.attempts.some(a=>['queued','running'].includes(a.secondary?.state)))?'第二回答处理中 · ':''}待答 ${store.jobs.length} 条 · 共 ${store.items.length} 题`;
 $('prev').disabled=idx<=0;$('next').disabled=idx<0||idx>=store.items.length-1;$('live').textContent=store.follow?'自动跟随现场':'回到现场';
 $('cancel').disabled=!a||![a,a.secondary,a.translation].some(x=>x&&['running','queued'].includes(x.state));
 for(const id of ['retry','verify','editBtn','copy','copySecondary'])$(id).disabled=!q;
 if(q&&a){
  $('questionNumber').textContent='#'+(idx+1);$('answeredQuestion').textContent=a.question;$('answerText').textContent=a.text||(a.state==='queued'?'Waiting in queue…':a.state==='error'?a.error:a.state==='stopped'?'Stopped.':'Preparing answer…');
  $('sourceTag').textContent='双版英文回答';$('fastSource').textContent=(a.model||'等待')+(a.effort?' · '+a.effort:'');$('answerStatus').textContent=({queued:'Queued',running:'Streaming',done:a.kind==='prepared'?'Prepared':a.kind==='clarification'?'Clarify':'Done',error:'Error',stopped:'Stopped'})[a.state];
  $('e2eLabel').textContent=q.meta.manual?'手动提交 → 首字':'语音结束 → 生成首字¹';
  $('ttftLabel').textContent=a.kind==='prepared'?'预设显示（提交后）':'请求 → 首字';
  $('ttft').textContent=a.kind==='prepared'?(Number.isFinite(a.preparedDisplayMs)?Math.round(a.preparedDisplayMs)+' ms':'即时'):a.kind?'不计时':sec(a.firstMs);$('e2e').textContent=a.kind?'—':sec(a.e2e);$('ttft').className=a.kind==='prepared'||a.firstMs<=3000?'fast':'slow';$('e2e').className=a.e2e<=3000?'fast':'slow';
  $('questionTranslation').textContent=a.translation?.text||(a.translation?.state==='error'?'中文翻译暂不可用，可点击重答重试':a.translation?.state==='stopped'?'中文翻译已停止':'中文翻译中…');
  const secondary=a.secondary||{state:'queued',text:''};
  $('secondaryText').textContent=secondary.text||(secondary.state==='error'?secondary.error:secondary.state==='stopped'?'Stopped.':secondary.state==='queued'?'Waiting for the second answer…':'Preparing a second answer…');
  $('secondaryStatus').textContent=({queued:'排队中',running:'生成中',done:'已完成',error:'生成失败',stopped:'已停止'})[secondary.state];
  $('secondaryTiming').textContent=secondary.firstMs!==undefined?'首字 '+sec(secondary.firstMs)+(secondary.effort?' · '+secondary.effort:''):'';
  $('copySecondary').disabled=!secondary.text;

  $('rawTranscript').textContent='浏览器：'+(q.meta.browser||'未使用 / 无结果');$('localTranscript').textContent='本地：'+(q.meta.local||'未使用 / 无结果')+(q.meta.asrMs?' · '+sec(q.meta.asrMs):'')+(q.meta.rechecked?'\n再次转写：'+q.meta.rechecked:'');$('answerSources').textContent='检索依据：'+(a.sources?.join(' / ')||'参考摘要');
  if(audioURL!==q.meta.audioURL){audioURL=q.meta.audioURL;$('replay').pause();if(audioURL)$('replay').src=audioURL;else $('replay').removeAttribute('src');$('replay').hidden=!audioURL;}
  const key=q.id+':'+q.attempts.length;if(renderedKey!==key){renderedKey=key;$('versions').replaceChildren(...q.attempts.map((a,i)=>new Option('第 '+(i+1)+' 次 · '+a.question.slice(0,60),a.id)));}
  $('versions').value=String(a.id);
 }
 const signature=store.items.map(q=>q.id+q.attempts.at(-1).state+q.attempts.at(-1).secondary?.state).join('|')+'|'+store.selected;
 if($('history').dataset.signature!==signature){$('history').dataset.signature=signature;$('history').replaceChildren(...store.items.map((q,i)=>{const b=document.createElement('button');b.className='questioncard'+(q.id===store.selected?' selected':'');const small=document.createElement('small');small.textContent='#'+(i+1)+' · 快速 '+q.attempts.at(-1).state+' / 第二回答 '+(q.attempts.at(-1).secondary?.state||'queued');b.append(small,document.createTextNode(q.text.slice(0,100)));b.onclick=()=>{store.select(q.id);versionId=null;render();};return b;}));}
}
function renderFAQ(){const search=$('faqSearch').value.toLowerCase();$('faqs').replaceChildren(...faq.filter(f=>(f.title+' '+f.question+' '+(f.questionZh||'')+' '+f.answer).toLowerCase().includes(search)).map(f=>{const b=document.createElement('button');b.textContent=f.title;b.onclick=()=>{const q=submit(f.question);if(q){store.select(q.id);versionId=null;render();}};return b;}));}
const capture=new CaptureSession({canSubmit:hasQuestionContent,silence:()=>Number($('silence').value),threshold:()=>Number($('threshold').value),onDraft:text=>{$('question').value=text;$('partial').textContent='正在转写…';},onSegment:segment=>{
 recognizer?.commit();$('question').value='';$('partial').textContent='问题已结束，正在处理…';
 const mode=$('speechMode').value,questionsOnly=$('questionsOnly').checked;transcribing++;render();
 processing=processing.then(async()=>{try{
  if(pendingSegment&&!segment.manual&&performance.now()-pendingSegment.savedAt<20000&&pendingSegment.rate===segment.rate){segment={...segment,text:[pendingSegment.text,segment.text].filter(Boolean).join(' '),frames:[...pendingSegment.frames,...segment.frames].slice(-840)};}pendingSegment=null;
  const result=await resolveSpeech(segment,{mode,questionsOnly,transcribe:async clip=>{const r=await sessionFetch('/api/transcribe',{method:'POST',headers:{'X-Session-Token':token,'Content-Type':'audio/wav'},body:clip,signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}});
  if(result.defer){if(result.merge)pendingSegment={...segment,savedAt:performance.now()};$('partial').textContent='这一段尚未形成完整问题，继续听取…';return;}
  if(result.empty){$('partial').textContent=result.error;return;}
  if(result.filtered){if(!capture.text)$('question').value=result.question;$('partial').textContent='这句已转写，提问过滤未通过。可点“立即回答”直接提交。';return;}
  const audioURL=result.clip?URL.createObjectURL(result.clip):null;submit(result.question,{...result.meta,audioURL,audioBlob:result.clip});
  if(!capture.text)$('partial').textContent='已提交，继续接收下一题';
 }catch(e){notice('这段处理失败：'+e.message);if(segment.text&&!capture.text)$('question').value=segment.text;}
 finally{transcribing--;render();}});
}});
function seal(manual=false){capture.commit({manual,text:manual?($('question').value||capture.text):undefined});}
function autoCheck(){if(!listening)return;if(lastAudioPacket!==null&&performance.now()-lastAudioPacket>3500){notice('音频采集没有持续返回数据，已暂停。请重新开始收音。');stopListening();return;}capture.tick(performance.now(),{auto:$('auto').checked});recognizer?.watchdog(capture.lastVoice);}
function startRecognition(){
 if($('speechMode').value==='local'){$('listenStatus').textContent='收音中 · 停顿后本地转写';return;}
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 recognizer=new BrowserTranscriber({factory:()=>SR?new SR():null,onText:(text,meta)=>{if(listening)capture.updateText(text,meta);},onState:(state,detail)=>{
  recognizerState=state;if(!listening)return;
  const labels={connecting:'收音中 · 正在连接转写',listening:'收音中 · 实时转写',reconnecting:'收音中 · 转写重连',recovering:'收音中 · 转写恢复',unavailable:'收音中 · 使用本地转写',stopped:'已暂停'};
  $('listenStatus').textContent=labels[state]||state;
  if(state==='recovering'||state==='unavailable')$('partial').textContent='浏览器转写暂不可用，本地录音继续。'+(detail||'');
 }});recognizer.start();
}
async function startListening(){
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
async function init(){try{const s=await(await fetch('/api/status')).json();token=s.token;setSessionToken(token);configured=s.configured;secondaryModel=s.secondaryModel;backendMode=s.backend;terms=s.terms||[];
 $('connection').textContent=configured?(s.backend==='demo'?'离线演示 · 无 AI 生成':'Codex 已连接'):'连接失败';$('backendStatus').textContent=s.error||s.mode;showASR(s.asr);if(s.asr.state==='disabled')$('speechMode').value='fast';
 $('model').replaceChildren(...s.models.map(m=>new Option(m.id+' · '+m.effort,m.id)));if(s.raceModels.length>1)$('model').add(new Option('快速模型竞速 · 首个响应','race'));$('model').value=s.fastModel;$('raceDescription').textContent='快速模型：'+s.fastModel+'。第二回答：'+s.secondaryModel+'。第二回答独立排队，属于另一份候选答案，不等于事实核验。';
 $('benchResults').textContent=s.backend==='demo'?'演示模式仅显示示例或资料摘录，不调用模型，也不自动翻译未知问题。':'模型来自当前账户列表，访问权限以实际请求为准。此版本不附带他人账户的速度测试数据。';
 for(const src of s.reference){const li=document.createElement('li');li.textContent=src.name;$('sources').append(li);}faq=await(await fetch('/api/faq')).json();faqIndex=createPreparedIndex(faq);$('faqCount').textContent=faq.length+' 条预设问答';$('referenceStatus').textContent=(s.referenceVersion||'')+' · '+faq.length+' 条问答 · '+faqIndex.size+' 种问法已加载';renderFAQ();if(s.backend==='demo')notice('当前为离线演示。启用真实 AI：安装并登录 Codex，在 .env 设置 QA_BACKEND=codex 后重启。');else if(!configured)notice(s.error); // Warm-up is explicit to avoid consuming quota on page load.
 if(s.asr.state==='starting'){const timer=setInterval(async()=>{try{const d=await(await fetch('/api/status')).json();showASR(d.asr);if(d.asr.state!=='starting')clearInterval(timer);}catch{}},2000);}
 }catch(e){notice('连接失败：'+e.message);}render();}
$('listen').onclick=()=>listening?stopListening():startListening();$('finish').onclick=()=>seal(true);$('answer').onclick=()=>{if($('question').value.trim())seal(true);else notice('请先输入问题，或等转写文字出现。');};$('clear').onclick=()=>{$('question').value='';capture.discard();pendingSegment=null;recognizer?.commit();};
$('prev').onclick=()=>{store.move(-1);versionId=null;render();};$('next').onclick=()=>{store.move(1);versionId=null;render();};$('live').onclick=()=>{store.live();versionId=null;render();};$('retry').onclick=()=>retry();$('verify').onclick=()=>retry(true);$('cancel').onclick=()=>{const q=selected(),a=q?.attempts.find(a=>a.id===versionId)||q?.attempts.at(-1);if(!a)return;lanes.cancel(attemptKey(q,a));if(store.running?.qid===q.id&&store.running.aid===a.id)activeController?.abort();if(a.state==='queued'){store.jobs=store.jobs.filter(j=>j.aid!==a.id);a.state='stopped';}render();};$('editBtn').onclick=()=>{$('editPanel').hidden=!$('editPanel').hidden;$('editText').value=selected()?.attempts.at(-1).question||'';};$('saveEdit').onclick=()=>{if($('editText').value.trim()){retry(false,$('editText').value.trim());$('editPanel').hidden=true;}};$('retranscribe').onclick=async()=>{const q=selected();if(!q?.meta.audioURL)return;try{notice('正在重新转写这一题的原音…');const blob=q.meta.audioBlob;if(!blob)throw Error('请重新录制这一题，旧页面没有保留可复核的音频对象');const r=await sessionFetch('/api/transcribe',{method:'POST',headers:{'X-Session-Token':token,'X-ASR-Quality':'accurate','Content-Type':'audio/wav'},body:blob});const d=await r.json();if(!r.ok)throw Error(d.error);q.meta.rechecked=d.text;store.select(q.id);$('editPanel').hidden=false;$('editText').value=d.text;notice('再次转写已放入修改框，请核对后点击重答。');render();}catch(e){notice(e.message);}};
$('replay').onplay=()=>{if(listening)stopListening();};
$('versions').onchange=()=>{versionId=Number($('versions').value);store.select(store.selected);render();};
$('model').onchange=()=>notice('已选择 '+$('model').value+'，下次提问时生效。');$('warm').onclick=()=>{warming=warming.then(warm);};$('faqSearch').oninput=renderFAQ;$('settingsBtn').onclick=()=>{$('setup').hidden=!$('setup').hidden;};$('copySecondary').onclick=()=>navigator.clipboard.writeText($('secondaryText').textContent).catch(e=>notice(e.message));$('copy').onclick=()=>navigator.clipboard.writeText($('answerText').textContent).catch(e=>notice(e.message));
$('silence').oninput=()=>$('silenceLabel').textContent=$('silence').value+' ms';$('threshold').oninput=()=>$('thresholdLabel').textContent=Number($('threshold').value).toFixed(3);$('hold').oninput=()=>$('holdLabel').textContent=$('hold').value+' 秒';
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();$('answer').click();}if(e.key==='Escape')stopListening();if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){if(e.key==='ArrowLeft')$('prev').click();if(e.key==='ArrowRight')$('next').click();}});
setInterval(()=>{autoCheck();render();},200);window.addEventListener('beforeunload',()=>{stopListening();activeController?.abort();lanes.cancelAll();for(const q of store.items)if(q.meta.audioURL)URL.revokeObjectURL(q.meta.audioURL);});init();

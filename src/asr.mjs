import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {config} from './config.mjs';
import {randomBytes} from 'node:crypto';
import {speechBudget} from '../public/speech-config.mjs';
import {repeatedTranscript} from '../public/logic.mjs';
export function validateWav(b){
 if(b.length<44||b.length>16000*2*90+44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44)throw Error('需要 16 kHz、单声道、16 位 WAV，最长 90 秒');
}
const abortable=(promise,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const abort=()=>reject(signal.reason);signal?.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));});
export class LocalASR{
 constructor(root,terms,options={}){this.root=root;this.terms=terms;this.queue=[];this.epoch=0;this.options={bin:config.whisperBin,model:config.whisperModel,language:'en',threads:4,useGPU:true,...options};this.state='disabled';this.ready=this.launch();}
 launch(){const epoch=this.epoch+1;return this.start().catch(e=>{if(this.epoch===epoch){this.state='error';this.error=e.message;}});}
 async start(){
  const opts={...this.options},epoch=++this.epoch;this.error=null;if(!opts.bin&&!opts.model){this.state='disabled';return;}if(!opts.bin||!opts.model){this.state='disabled';this.error='缺少识别引擎或模型，请在组件中心安装';return;}
  this.state='starting';const model=path.resolve(this.root,opts.model);if(!existsSync(model))throw Error('模型文件缺失，请重新校验或修复');
  const probe=net.createServer();await new Promise((r,j)=>{probe.once('error',j);probe.listen(0,'127.0.0.1',r);});const port=probe.address().port;await new Promise(r=>probe.close(r));if(this.closed||epoch!==this.epoch)throw Error('语音服务已关闭');
  const secret=randomBytes(24).toString('hex');this.url=`http://127.0.0.1:${port}/${secret}/inference`;const publicDir=mkdtempSync(path.join(tmpdir(),'replymate-asr-'));this.publicDir=publicDir;
  const args=['-m',model,'--host','127.0.0.1','--port',String(port),'--request-path','/'+secret,'--public',publicDir,'-l','auto','-t',String(opts.threads),'-bo','1','-bs','1','-nf','-sns',...(opts.useGPU===false?['-ng']:[])];
  const child=spawn(opts.bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=child;let logs='';
  this.exited=new Promise(resolve=>{child.once('error',e=>{if(epoch===this.epoch){this.error=e.message;this.state='error';}resolve();});child.once('exit',()=>{if(epoch===this.epoch&&!this.closed){this.state='error';this.error||='本地语音服务已退出 '+logs.slice(-300);}resolve();});});
  child.stdout.on('data',()=>{});child.stderr.on('data',d=>{logs=(logs+d.toString()).slice(-2000);});
  const deadline=Date.now()+speechBudget.loadMs;
  while(Date.now()<deadline&&!this.closed&&epoch===this.epoch){if(this.state==='error')throw Error(this.error);try{const r=await fetch(`http://127.0.0.1:${port}/${secret}/health`,{signal:AbortSignal.timeout(700)});if(r.ok){this.state='ready';return;}}catch{}await new Promise(r=>setTimeout(r,200));}
  child.kill();throw Error('本地语音加载超时或已关闭');
 }
 get busy(){return !!this.running||this.queue.length>0;}
 snapshot(){return {state:this.state,error:this.error,queued:this.queue.length,running:!!this.running,model:this.options.modelId,language:this.options.language,version:this.options.version};}
 async configure(options){if(this.busy)throw Error('请先停止收音并等当前转写完成');if(this.state==='ready'&&['bin','model','threads','useGPU'].every(k=>options[k]===this.options[k])){this.options={...this.options,...options};return;}if(this.busy)throw Error('请先停止收音并等当前转写完成');const previous=this.options;await this.stop();this.closed=false;this.options={...previous,...options};this.ready=this.start();try{await this.ready;}catch(e){await this.stop();this.closed=false;this.options=previous;this.ready=this.launch();await this.ready;throw e;}}
 async transcribe(wav,quality='fast',{signal,language=this.options.language||'en'}={}){validateWav(wav);const deadline=AbortSignal.timeout(speechBudget.requestMs);signal=signal?AbortSignal.any([signal,deadline]):deadline;await abortable(this.ready,signal);if(this.state!=='ready')throw Error(this.error||'本地语音服务未就绪');
  if(this.queue.length>=speechBudget.maxQueue)throw Error('转写队列已满，请暂停收音或选择更小模型');const options={...this.options,language},queued=Date.now();
  return new Promise((resolve,reject)=>{const job={wav,quality,options,signal,resolve,reject,queued};const abort=()=>{const index=this.queue.indexOf(job);if(index>=0){this.queue.splice(index,1);clearTimeout(job.timer);reject(signal.reason);} };job.abort=abort;signal.addEventListener('abort',abort,{once:true});job.timer=setTimeout(()=>{const i=this.queue.indexOf(job);if(i>=0){this.queue.splice(i,1);signal.removeEventListener('abort',abort);reject(Error('转写排队超时，请暂停收音或选择更小模型'));}},speechBudget.queueMs);this.queue.push(job);this.drain();});
 }
 async drain(){if(this.running||!this.queue.length||this.closed)return;const job=this.queue.shift();this.running=job;clearTimeout(job.timer);job.signal.removeEventListener('abort',job.abort);const start=performance.now();
  try{job.signal.throwIfAborted();const signal=AbortSignal.any([job.signal,AbortSignal.timeout(speechBudget.inferenceMs)]);let result=await this.infer(job,false,signal);if(result.text&&repeatedTranscript(result.text))result=await this.infer(job,true,signal);const duration=(job.wav.length-44)/32000,ms=Math.round(performance.now()-start);job.resolve({...result,text:result.text&&repeatedTranscript(result.text)?'':result.text,ms,queueMs:Date.now()-job.queued-ms,rtf:ms/1000/duration,engine:'whisper.cpp',engineVersion:job.options.version,model:job.options.modelId,language:job.options.language});
  }catch(e){job.reject(e); // The server cannot cancel inference. Terminate and reload this worker before accepting more audio.
   await this.stop();if(!this.closedPermanently){this.closed=false;this.ready=this.launch();await this.ready;}
  }finally{this.running=null;this.drain();}
 }
 async infer(job,short,signal){const form=new FormData();form.set('file',new Blob([job.wav],{type:'audio/wav'}),'question.wav');for(const [k,v] of Object.entries({response_format:'verbose_json',language:job.options.language,translate:'false',temperature:'0',beam_size:job.quality==='accurate'?'5':'1',best_of:job.quality==='accurate'?'5':'1',temperature_inc:'0',prompt:short?'':termsPrompt(this.terms),carry_initial_prompt:'false',audio_ctx:'0',no_language_probabilities:'true'}))form.set(k,v);
  const r=await fetch(this.url,{method:'POST',body:form,signal});if(!r.ok)throw Error('本地语音转写失败 '+r.status);const result=await r.json(),segments=result.segments||[],silent=job.wav.subarray(44).every(v=>v===0);return {text:silent?'':result.text?.trim()||'',noSpeech:silent||!!segments.length&&segments.every(s=>s.no_speech_prob>.7),detectedLanguage:result.detected_language||result.language||null,segments};
 }
 async stop(){this.closed=true;++this.epoch;for(const j of this.queue){clearTimeout(j.timer);j.signal.removeEventListener('abort',j.abort);j.reject(Error('本地语音服务已停止'));}this.queue=[];const child=this.child;this.child=null;if(child&&child.exitCode===null){child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await this.exited;clearTimeout(timer);}if(this.publicDir){rmSync(this.publicDir,{recursive:true,force:true});this.publicDir=null;}this.state='disabled';}
 close(){this.closedPermanently=true;return this.stop();}
}
function termsPrompt(terms){return [...new Set(terms)].filter(t=>t.length>1).slice(0,18).join(', ');}

import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {config} from './config.mjs';
import {randomBytes} from 'node:crypto';
export function validateWav(b){
 if(b.length<44||b.length>16000*2*90+44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44)throw Error('需要 16 kHz、单声道、16 位 WAV，最长 90 秒');
}
export class LocalASR{
 constructor(root,terms){this.root=root;this.terms=terms;this.state='starting';this.queue=Promise.resolve();this.ready=this.start().catch(e=>{this.state='error';this.error=e.message;});}
 async start(){
  if(!config.whisperBin&&!config.whisperModel){this.state='disabled';return;}if(!config.whisperBin||!config.whisperModel)throw Error('请同时配置 WHISPER_BIN 和 WHISPER_MODEL');const model=path.resolve(this.root,config.whisperModel);if(!existsSync(model))throw Error('找不到 WHISPER_MODEL 指定的模型文件');
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const secret=randomBytes(24).toString('hex');this.url=`http://127.0.0.1:${port}/${secret}/inference`;
  this.publicDir=mkdtempSync(path.join(tmpdir(),'meeting-asr-'));this.child=spawn(config.whisperBin,['-m',model,'--host','127.0.0.1','--port',String(port),'--request-path','/'+secret,'--public',this.publicDir,'-l','en','-t','4','-bo','1','-bs','1','-nf','-sns','--prompt',termsPrompt(this.terms)],{stdio:['ignore','pipe','pipe']});
  this.child.on('error',e=>{this.error=e.message;this.state='error';});this.child.on('exit',()=>{this.state='error';this.error||='本地语音服务已退出';});
  this.child.stdout.on('data',()=>{});this.child.stderr.on('data',()=>{});
  const deadline=Date.now()+90000;
  while(Date.now()<deadline&&!this.closed){if(this.state==='error')throw Error(this.error);try{const r=await fetch(`http://127.0.0.1:${port}/${secret}/health`,{signal:AbortSignal.timeout(700)});if(r.ok){this.state='ready';return;}}catch{}await new Promise(r=>setTimeout(r,250));}
  this.child?.kill();throw Error('本地语音服务启动超时或已关闭');
 }
 async transcribe(wav,quality='fast'){validateWav(wav);await this.ready;if(this.state!=='ready')throw Error(this.error||'本地语音服务未就绪');
  const run=async()=>{const start=performance.now();const form=new FormData();form.set('file',new Blob([wav],{type:'audio/wav'}),'question.wav');form.set('response_format','verbose_json');form.set('language','en');form.set('temperature','0');form.set('beam_size',quality==='accurate'?'5':'1');form.set('best_of',quality==='accurate'?'5':'1');form.set('temperature_inc','0');form.set('prompt',termsPrompt(this.terms));form.set('carry_initial_prompt','true');
   form.set('audio_ctx','0');
   const r=await fetch(this.url,{method:'POST',body:form,signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('本地语音转写失败 '+r.status);const result=await r.json();const segments=result.segments||[],confidence=segments.length?Math.exp(Math.min(...segments.map(s=>s.avg_logprob??0))):null,noSpeech=segments.length&&segments.every(s=>s.no_speech_prob>.7);return {text:result.text?.trim()||'',confidence,noSpeech:!!noSpeech,ms:Math.round(performance.now()-start),engine:'local whisper.cpp',segments:result.segments};};
  const p=this.queue.then(run);this.queue=p.catch(()=>{});return p;
 }
 close(){this.closed=true;this.child?.kill();if(this.publicDir)rmSync(this.publicDir,{recursive:true,force:true});}
}
function termsPrompt(terms){return [...new Set(terms)].filter(t=>t.length>1).slice(0,18).join(', ')+'.';}

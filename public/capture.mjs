// Shared by microphone capture and the recorded-audio regression harness.
export class CaptureSession {
 constructor({now=()=>performance.now(),silence=()=>900,threshold=()=>.012,onSegment=()=>{},onDraft=()=>{},canSubmit=()=>true}={}){Object.assign(this,{now,silence,threshold,onSegment,onDraft,canSubmit});this.pre=[];this.noise=[];this.generation=0;this.reset();}
 reset(){this.frames=[];this.text='';this.final=false;this.confidence=null;this.started=null;this.lastVoice=null;this.lastText=null;this.voiceMs=0;this.rate=48000;}
 push({pcm,rate,rms},time=this.now()){
  this.rate=rate;const duration=1000*pcm.length/rate;
  this.noise.push(rms);if(this.noise.length>40)this.noise.shift();
  const floor=[...this.noise].sort((a,b)=>a-b)[Math.floor(this.noise.length*.2)]||0;
  const gate=Math.max(.002,Math.min(this.threshold(),floor*2.5),floor*1.7);
  const voice=rms>gate;
  if(voice){if(this.started===null){this.started=time-duration;this.frames=this.pre.map(p=>p.pcm);}this.lastVoice=time;this.voiceMs+=duration;}
  if(this.started!==null){this.frames.push(pcm);if(this.frames.length>850)this.frames.shift();}
  this.pre.push({pcm,ms:duration});let preMs=this.pre.reduce((s,p)=>s+p.ms,0);while(preMs>1200&&this.pre.length>1)preMs-=this.pre.shift().ms;
 }
 updateText(text,{final=false,confidence=null}={},time=this.now()){
  text=text.trim();if(!text)return;
  if(text!==this.text){this.text=text;this.lastText=time;this.onDraft(text);}
  this.final=final;this.confidence=confidence;
  if(this.started===null){this.started=time;this.frames=this.pre.map(p=>p.pcm);}
 }
 tick(time=this.now(),{auto=true}={}){
  if(!auto||this.started===null)return false;
  const silence=this.silence(),stable=this.lastText===null?0:time-this.lastText,quiet=this.lastVoice===null?Infinity:time-this.lastVoice;
  // Speech text is evidence even if the microphone is quiet or background noise never falls below the gate.
  const textReady=this.text&&this.canSubmit(this.text)&&(stable>=silence&&quiet>=silence||stable>=(this.final?silence+450:silence+1200));
  const audioReady=!this.text&&this.voiceMs>=300&&quiet>=silence;
  if(textReady||audioReady||time-this.started>=84000){this.commit();return true;}return false;
 }
 commit({manual=false,text}={}){
  const segment={id:++this.generation,text:(text??this.text).trim(),final:this.final,confidence:this.confidence,frames:this.frames,rate:this.rate,audioEnd:this.lastVoice??this.lastText??this.now(),manual};
  this.reset();this.pre=[];if(segment.text||segment.frames.length)this.onSegment(segment);return segment;
 }
 discard(){this.reset();this.pre=[];}
}
// One owner for recognizer lifecycle. Old callbacks cannot mutate the next question.
export class BrowserTranscriber {
 constructor({locale='en-US',factory,onText=()=>{},onState=()=>{},now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),unschedule=id=>clearTimeout(id)}={}){Object.assign(this,{locale,factory,onText,onState,now,schedule,unschedule});this.enabled=false;this.rec=null;this.timer=null;this.prefix='';this.current='';this.startedAt=0;this.lastEvent=0;this.epoch=0;this.failures=0;}
 start(){this.enabled=true;this.launch();}
 launch(){
  if(!this.enabled||this.rec)return;this.unschedule(this.timer);let rec;try{rec=this.factory();}catch(e){this.onState('unavailable',e.message);return;}
  if(!rec){this.onState('unavailable','浏览器不提供语音识别');return;}
  const epoch=this.epoch;this.rec=rec;this.connected=false;this.startedAt=this.lastEvent=this.now();this.onState('connecting');
  rec.lang=this.locale;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=3;
  const live=()=>this.enabled&&this.rec===rec&&epoch===this.epoch;
  rec.onstart=()=>{if(live()){this.connected=true;this.failures=0;this.onState('listening');}};
  rec.onresult=e=>{if(!live())return;this.lastEvent=this.now();let text='',confidence=[];for(let i=0;i<e.results.length;i++){text+=' '+e.results[i][0].transcript;const v=e.results[i][0].confidence;if(v>0)confidence.push(v);}this.current=[this.prefix,text.trim()].filter(Boolean).join(' ');this.onText(this.current,{final:!!e.results[e.results.length-1]?.isFinal,confidence:confidence.length?Math.min(...confidence):null});};
  rec.onerror=e=>{if(!live())return;this.lastEvent=this.now();if(!['no-speech','aborted'].includes(e.error)){this.failures++;this.onState('recovering',e.error);}this.scheduleRecovery(500+Math.min(2000,this.failures*400));};
  rec.onend=()=>{if(!live())return;this.prefix=this.current;this.rec=null;this.onState('reconnecting');this.queueLaunch(120);};
  try{rec.start();}catch(e){this.rec=null;this.failures++;this.onState('recovering',e.message);this.queueLaunch(500);}
 }
 queueLaunch(ms){this.unschedule(this.timer);if(this.enabled)this.timer=this.schedule(()=>{this.timer=null;this.launch();},ms);}
 scheduleRecovery(ms){this.unschedule(this.timer);this.timer=this.schedule(()=>{if(!this.enabled)return;this.replace({preserve:true});},ms);}
 replace({preserve=false}={}){
  const old=this.rec;this.epoch++;this.rec=null;this.unschedule(this.timer);this.timer=null;
  this.prefix=preserve?this.current:'';this.current=this.prefix;
  if(old){old.onstart=old.onresult=old.onerror=old.onend=null;try{old.abort();}catch{}}
  this.queueLaunch(120);
 }
 commit(){this.replace();}
 watchdog(voiceAt){if(this.enabled&&this.rec&&((!this.connected&&this.now()-this.startedAt>8000)||(voiceAt!==null&&this.now()-voiceAt<2500&&this.now()-this.lastEvent>15000))){this.onState('recovering','识别器无响应，正在重连');this.replace({preserve:true});}}
 stop(){this.enabled=false;this.replace();this.onState('stopped');}
}
export function wavBlob(list,inputRate){
 const length=list.reduce((s,a)=>s+a.length,0),input=new Float32Array(length);let offset=0;for(const p of list){input.set(p,offset);offset+=p.length;}const n=Math.floor(length*16000/inputRate),b=new ArrayBuffer(44+n*2),v=new DataView(b);const ascii=(i,s)=>[...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));ascii(0,'RIFF');v.setUint32(4,36+n*2,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const begin=Math.floor(i*inputRate/16000),end=Math.max(begin+1,Math.floor((i+1)*inputRate/16000));let sum=0;for(let j=begin;j<end&&j<input.length;j++)sum+=input[j];const s=Math.max(-1,Math.min(1,sum/(end-begin)));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([b],{type:'audio/wav'});
}

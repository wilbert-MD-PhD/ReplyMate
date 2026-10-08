import {transcriptDecision,looksQuestion,hasQuestionContent,repeatedTranscript} from './logic.mjs';
import {wavBlob} from './capture.mjs';
export async function resolveSpeech(segment,{mode='dual',transcribe,questionsOnly=false}={}){
 const browser=mode==='local'&&!segment.manual?'':segment.text.trim(),clip=segment.frames.length?wavBlob(segment.frames,segment.rate):null;
 // Clicking submit makes the visible text authoritative, including edits and short follow-ups.
 if(segment.manual&&browser)return {question:browser,clip,meta:{manual:true,browser,audioEnd:segment.audioEnd,reason:'按当前输入直接回答',alternatives:[]}};
 let local='',asrMs=null,localConfidence=null,error='';
 if(mode!=='fast'&&clip){try{const d=await transcribe(clip);if(!d.noSpeech){local=d.text||'';asrMs=d.ms;localConfidence=d.confidence;}}catch(e){error=e.message;}}
 const d=transcriptDecision(browser,local,{confidence:segment.confidence,localConfidence,verified:!!local});
 if(error&&mode==='local')return {empty:true,error:'本地转写失败：'+error};
 if(!segment.manual&&!hasQuestionContent(d.text))return {defer:true,text:d.text,merge:!!d.text&&!repeatedTranscript(d.text)&&!/^.*(?:hello|here is (?:a|the) question|i have a question).*$/i.test(d.text)};
 if(!d.text)return {empty:true,error:error||'这一段未识别到文字，请继续说话。'};
 return {question:d.text,clip,filtered:questionsOnly&&!segment.manual&&!looksQuestion(d.text),meta:{voice:true,browser,local,asrMs,audioEnd:segment.audioEnd,reason:error?'本地转写暂不可用，已使用浏览器文字':d.reason,alternatives:d.alternatives,needsReview:d.needsReview}};
}

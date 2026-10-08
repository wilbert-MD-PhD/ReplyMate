export const normalize=t=>t.toLowerCase().replace(/[^a-z0-9]/g,'');
export function cleanTranscript(t){return t.trim();}
export function looksQuestion(t){return /^(?:(?:okay|ok|so|well|yes|thank you)[,. ]+)*(what|why|how|when|where|which|who|can|could|would|should|do|does|did|is|are|will|please|explain|describe|tell|have|has)\b|\b(could you|can you|would you|wondering|my question|i wonder|i want to ask)\b|\?/i.test(t);}
export function transcriptDecision(browser,local,{confidence=null,localConfidence=null,verified=false}={}){
 browser=cleanTranscript(browser||'');local=cleanTranscript(local||'');
 const score=t=>{if(repeatedTranscript(t))return -100;const words=t.match(/[a-z]+/gi)||[];return (looksQuestion(t)?4:0)+Math.min(words.length,8)/4-(/\b(?:to|the|a|an|of|with|and)\s*[?.]*$/i.test(t)?3:0);};
 const text=local&&(!browser||score(local)>=score(browser))?local:browser;
 const disagreement=!!(browser&&local&&normalize(browser)!==normalize(local));
 const unclear=(text.match(/[a-z]+/gi)||[]).length<2;
 // A warning is visible and accompanies the model input; it must not replace a usable answer.
 return {text,clarify:false,needsReview:unclear||disagreement||!!(confidence!==null&&confidence<.55)||!!(localConfidence!==null&&localConfidence<.55),reason:unclear?'部分词未听清，已交给答题模型结合原问题判断':disagreement?'转写存在差异，原文可展开查看':verified?'本地转写完成':'浏览器转写',alternatives:[browser,local].filter((x,i,a)=>x&&!repeatedTranscript(x)&&a.indexOf(x)===i)};
}
// Queue and selection are independent. Every callback owns an immutable attempt ID.
export class QuestionStore{
 constructor(){this.items=[];this.jobs=[];this.running=null;this.selected=null;this.follow=true;this.holdUntil=0;this.seq=0;}
 add(text,meta={}){const q={id:++this.seq,text,meta,attempts:[],created:Date.now()};this.items.push(q);this.enqueue(q.id,text);if(!this.selected)this.selected=q.id;return q;}
 enqueue(id,text,options={}){const q=this.items.find(q=>q.id===id);if(!q)throw Error('Question missing');const a={id:++this.seq,question:text||q.text,text:'',state:'queued',...options};q.attempts.push(a);this.jobs.push({qid:id,aid:a.id});return a;}
 next(){if(this.running)return null;const job=this.jobs.shift();if(!job)return null;this.running=job;const q=this.items.find(q=>q.id===job.qid),a=q.attempts.find(a=>a.id===job.aid);a.state='running';return {q,a};}
 update(qid,aid,change){const a=this.items.find(q=>q.id===qid)?.attempts.find(a=>a.id===aid);if(a)Object.assign(a,change);return a;}
 finish(qid,aid,change={}){this.update(qid,aid,{state:'done',...change});if(this.running?.qid===qid&&this.running.aid===aid)this.running=null;}
 select(id){if(this.items.some(q=>q.id===id)){this.selected=id;this.follow=false;}}
 move(delta){const i=this.items.findIndex(q=>q.id===this.selected);const q=this.items[Math.max(0,Math.min(this.items.length-1,i+delta))];if(q)this.select(q.id);}
 live(){this.follow=true;this.holdUntil=0;this.selected=this.running?.qid||this.items.at(-1)?.id||null;}
 tick(now,holdMs){if(!this.follow)return;const i=this.items.findIndex(q=>q.id===this.selected);const q=this.items[i],a=q?.attempts.at(-1);if(!q)return;
  if(['done','error','stopped'].includes(a?.state)&&(!a.secondary||['done','error','stopped'].includes(a.secondary.state))){if(!this.holdUntil)this.holdUntil=now+holdMs;const next=this.items[i+1];if(next&&now>=this.holdUntil){this.selected=next.id;this.holdUntil=0;}}
 }
}
// Continuous recognizer results are consumed once, without aborting recognition per question.
export class TranscriptBuffer{
 constructor(){this.results=new Map();this.cursor=0;this.prefix='';this.confidence=null;}
 update(e){for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];this.results.set(i,{text:r[0].transcript,final:r.isFinal,confidence:r[0].confidence,alternatives:Array.from(r,a=>a.transcript)});}}
 get final(){return [this.prefix,...[...this.results].filter(([i,r])=>i>=this.cursor&&r.final).map(([,r])=>r.text)].join(' ').trim();}
 get interim(){return [...this.results].filter(([i,r])=>i>=this.cursor&&!r.final).map(([,r])=>r.text).join(' ').trim();}
 take(){const entries=[...this.results].filter(([i,r])=>i>=this.cursor&&r.final);const text=this.final;this.prefix='';if(entries.length)this.cursor=entries.at(-1)[0]+1;const confidences=entries.map(([,r])=>r.confidence).filter(v=>v>0);return {text,confidence:confidences.length?Math.min(...confidences):null,alternatives:entries.flatMap(([,r])=>r.alternatives)};}
 restart(){this.prefix=this.final;this.results.clear();this.cursor=0;}
 clear(){this.prefix='';this.cursor=this.results.size;}
}
export function repeatedTranscript(text){
 const words=text.toLowerCase().match(/[a-z]+/g)||[];if(!words.length)return true;
 for(let n=1;n<=4;n++){const counts=new Map();for(let i=0;i+n<=words.length;i++){const key=words.slice(i,i+n).join(' ');counts.set(key,(counts.get(key)||0)+1);}const max=Math.max(0,...counts.values());if(max>=Math.max(n===1?6:4,Math.ceil(words.length/(n*2))))return true;}
 return false;
}
export function hasQuestionContent(text){
 const t=text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();if(!t||repeatedTranscript(text))return false;
 if(/^(?:(?:hello|hi|okay|ok|yes|right|thanks|thank you|so|well)\s*)+$/.test(t))return false;
 if(/^(?:(?:okay|ok|so|well)\s+)*(?:i have a question|here is (?:a|the) question|my question is|i want to ask(?: a question)?)$/.test(t))return false;
 if(/\b(?:to|the|a|an|of|with|and|from|about|through|can|could|will|would|you)\s*$/.test(t))return false;
 const words=t.split(' ');
 if(words.length<4)return words.length>=2||/^(why|how|when|where)$/.test(t)||(/\?\s*$/.test(text)&&words[0].length>=2);
 return true;
}

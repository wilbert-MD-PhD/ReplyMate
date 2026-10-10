export function normalizeQuestion(text){return text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');}
const stop=new Set('what why when how is are the a an of in to do does we you our and for this that it with would could should can please your explain tell me method approach'.split(' '));
const segmenter=new Intl.Segmenter(undefined,{granularity:'word'});
const tokens=s=>[...new Set([...segmenter.segment(s.normalize('NFKC').toLocaleLowerCase())].filter(x=>x.isWordLike).map(x=>x.segment).filter(t=>!stop.has(t)))];
const indexes=new WeakMap();
export function prepareRetrieval(chunks){
 if(indexes.has(chunks))return indexes.get(chunks);
 const docs=chunks.map(c=>({c,title:new Set(tokens(c.title)),terms:new Set(tokens(c.title+' '+c.text+' '+(c.keywords||'')))}));
 const frequency=new Map();for(const d of docs)for(const term of d.terms)frequency.set(term,(frequency.get(term)||0)+1);
 const index={docs,idf:new Map([...frequency].map(([t,n])=>[t,Math.log(1+docs.length/(1+n))]))};indexes.set(chunks,index);return index;
}
export function retrieve(question,chunks){
 const ts=tokens(question),{docs,idf}=prepareRetrieval(chunks);
 return docs.map(d=>({c:d.c,score:ts.reduce((sum,t)=>sum+(d.terms.has(t)?(idf.get(t)||0)*(d.title.has(t)?1.8:1):0),0)*(d.c.priority||1)})).filter(d=>d.score>1).sort((a,b)=>b.score-a.score).slice(0,3).map(d=>d.c);
}
function relevantWindow(text,query,idf,width){
 if(text.length<=width)return text;
 // Segment the original text so Unicode normalization cannot shift source offsets.
 const matches=[];
 for(const word of segmenter.segment(text)){
  const term=word.segment.normalize('NFKC').toLocaleLowerCase();
  if(word.isWordLike&&query.has(term))matches.push({term,start:word.index,end:word.index+word.segment.length});
 }
 const starts=new Set([0]);
 for(const hit of matches)starts.add(Math.max(0,Math.min(text.length-width,hit.start-Math.floor(width/2))));
 let best=0,bestScore=-1;
 for(const start of starts){
  const covered=new Set(matches.filter(hit=>hit.start>=start&&hit.end<=start+width).map(hit=>hit.term));
  const score=[...covered].reduce((sum,term)=>sum+(idf.get(term)||1),0);
  if(score>bestScore){bestScore=score;best=start;}
 }
 return text.slice(best,best+width);
}
export function selectExcerpts(question,chunks){
 const selected=retrieve(question,chunks),query=new Set(tokens(question)),{idf}=prepareRetrieval(chunks);
 const headers=selected.map(c=>`[${String(c.id||c.title).slice(0,80)}] ${c.title.slice(0,120)}\n`);
 let remaining=4800-headers.reduce((n,h)=>n+h.length,0)-Math.max(0,selected.length-1)*2;
 return selected.map((c,i)=>{
  const width=Math.min(2000,Math.floor(remaining/(selected.length-i)));
  const text=relevantWindow(c.text,query,idf,width);remaining-=text.length;return headers[i]+text;
 }).join('\n\n');
}
export async function* readSSE(body){const decoder=new TextDecoder();let buffer='';for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);if(line.startsWith('data:')){const d=line.slice(5).trim();if(d&&d!=='[DONE]')yield JSON.parse(d);}}}}

export function normalizeQuestion(text){return text.toLowerCase().replace(/[^a-z0-9]/g,'');}
const stop=new Set('what why when how is are the a an of in to do does we you our and for this that it with would could should can please your explain tell me method approach'.split(' '));
const tokens=s=>[...new Set((s.toLowerCase().match(/[a-z][a-z0-9-]*|\d+(?:\.\d+)?/g)||[]).filter(t=>!stop.has(t)))];
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
export function selectExcerpts(question,chunks){return retrieve(question,chunks).map(c=>`[${c.id||c.title}] ${c.title}\n${c.text.slice(0,2000)}`).join('\n\n').slice(0,4800);}
export async function* readSSE(body){const decoder=new TextDecoder();let buffer='';for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);if(line.startsWith('data:')){const d=line.slice(5).trim();if(d&&d!=='[DONE]')yield JSON.parse(d);}}}}

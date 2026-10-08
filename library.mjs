import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPreparedIndex} from './public/prepared.mjs';
export function validateLibrary(r){
 const fail=message=>{throw Error('Invalid library: '+message);};
 if(!r||typeof r!=='object'||Array.isArray(r))fail('object required');
 for(const key of ['context','version'])if(typeof r[key]!=='string'||!r[key].trim())fail(key+' required');
 if(r.context.length>24000)fail('context exceeds 24000 characters');
 for(const key of ['sources','chunks','faq','terms'])if(!Array.isArray(r[key]))fail(key+' must be an array');
 if(r.chunks.length>2000||r.faq.length>1000||r.terms.length>100)fail('too many entries');
 const ids=new Set();
 for(const source of r.sources){if(typeof source.id!=='string'||typeof source.name!=='string'||ids.has(source.id))fail('source id/name required and unique');ids.add(source.id);}
 const chunkIds=new Set();
 for(const c of r.chunks){if(typeof c.id!=='string'||chunkIds.has(c.id)||typeof c.title!=='string'||typeof c.text!=='string'||c.text.length>6000||!ids.has(c.sourceId))fail('invalid chunk');chunkIds.add(c.id);}
 const faqIds=new Set();
 for(const f of r.faq){
  if(typeof f.id!=='string'||faqIds.has(f.id))fail('FAQ id required and unique');faqIds.add(f.id);
  for(const key of ['title','question','answer'])if(typeof f[key]!=='string'||!f[key].trim()||f[key].length>8000)fail('invalid FAQ '+key);
  if(f.questionZh!==undefined&&typeof f.questionZh!=='string')fail('questionZh must be text');
  if(!Array.isArray(f.aliases)||f.aliases.some(x=>typeof x!=='string'||x.length>8000))fail('invalid aliases');
  if(!Array.isArray(f.sourceIds)||!f.sourceIds.length||f.sourceIds.some(id=>!ids.has(id)))fail('unknown FAQ source');
  if(typeof f.reviewed!=='boolean')fail('reviewed must be boolean');
  f.sources=f.sourceIds.map(id=>r.sources.find(s=>s.id===id).name);f.referenceVersion=r.version;
 }
 if(r.terms.some(t=>typeof t!=='string'||t.length>100))fail('invalid terms');
 createPreparedIndex(r.faq);
 r.stats={chunks:r.chunks.length,prepared:r.faq.filter(f=>f.reviewed).length};return r;
}
export async function readLibrary(file){
 if((await stat(file)).size>5000000)throw Error('Library exceeds 5 MB');
 return validateLibrary(JSON.parse(await readFile(file,'utf8')));
}
export function compileText(text,name='notes.txt'){
 if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>1000000)throw Error('Provide 1 byte–1 MB of UTF-8 text');
 if(text.includes('\0'))throw Error('Binary files are not supported. Export Markdown or plain text first.');
 const chunks=[];let title='Presentation notes';
 for(const paragraph of text.split(/\n\s*\n/)){
  const heading=paragraph.match(/^#{1,6}\s+(.+)/);if(heading)title=heading[1];
  for(let i=0;i<paragraph.length;i+=1800)chunks.push({id:'note-'+(chunks.length+1),sourceId:'notes',source:name,title,text:paragraph.slice(i,i+1800)});
 }
 return validateLibrary({version:'custom',context:text.slice(0,12000),terms:[],sources:[{id:'notes',name,sha256:createHash('sha256').update(text).digest('hex')}],chunks,faq:[]});
}

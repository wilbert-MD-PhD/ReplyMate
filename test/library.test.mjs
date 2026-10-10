import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,cp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileText,validateLibrary,readLibrary} from '../src/library.mjs';
import {selectExcerpts,readSSE} from '../src/core.mjs';
import {createPreparedIndex,findPrepared} from '../public/prepared.mjs';
import {selectEffort} from '../src/bridge.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const example=await readLibrary(new URL('../examples/reference.json',import.meta.url));
test('only exact reviewed questions select prepared answers',()=>{
 const index=createPreparedIndex(example.faq);
 for(const f of example.faq)for(const q of [f.question,...f.aliases])assert.equal(findPrepared(index,q)?.id,f.id);
 assert.equal(findPrepared(index,'Okay, so '+example.faq[0].question)?.id,'demo-1');
 for(const q of ['Does it NOT collect personal data?','Does it collect 20 personal records?','Does it collect personal data and what is the budget?','And that?'])assert.equal(findPrepared(index,q),null);
});
test('unreviewed answers cannot bypass generation',()=>{const f={...example.faq[0],reviewed:false};assert.equal(createPreparedIndex([f]).size,0);});
test('prepared answers preserve signs, decimal points, operators and word boundaries',()=>{
 for(const [original,changed] of [
  ['Is the temperature -5 C?','Is the temperature 5 C?'],
  ['Is the temperature +5 C?','Is the temperature -5 C?'],
  ['Is the threshold 1.5?','Is the threshold 15?'],
  ['Is p < 0.05?','Is p > 0.05?'],
  ['Is p <= 0.05?','Is p < 0.05?'],
  ['Is the rate 5%?','Is the rate 5?'],
  ['Is the threshold 1e-5?','Is the threshold 1e5?'],
  ['Do we re-sign?','Do we resign?'],
  ['Is this AB C?','Is this A BC?']
 ]){
  const faq={...example.faq[0],question:original,aliases:[]};
  const index=createPreparedIndex([faq]);assert.equal(findPrepared(index,original)?.id,faq.id);
  assert.equal(findPrepared(index,changed),null,changed);
  const library=structuredClone(example);library.faq=[faq,{...faq,id:'distinct',question:changed}];
  assert.doesNotThrow(()=>validateLibrary(library));
 }
 const faq={...example.faq[0],question:'Is the temperature -5 C?',aliases:[]};
 assert.equal(findPrepared(createPreparedIndex([faq]),' Okay, so IS THE TEMPERATURE −５ C！ ')?.id,faq.id);
});
test('long chunks send evidence around the query, including near their end',()=>{
 for(const prefix of ['Background information. '.repeat(130),'ﬁ 温度记录。'.repeat(400)]){
  const text=prefix+'Cobalt calibration coefficient is 17.42.';
  const chunks=[{id:'calibration',title:'Cobalt calibration coefficient',text}];
  assert.ok(text.length>2000&&text.length<=6000);
  const excerpt=selectExcerpts('What is the Cobalt calibration coefficient?',chunks);
  assert.match(excerpt,/Cobalt calibration coefficient is 17\.42\./);
  assert.match(excerpt,/^\[calibration\]/);assert.ok(excerpt.length<=4800);
  assert.equal(chunks[0].text,text);
 }
 assert.equal(selectExcerpts('unrelated question',[]),'');
});
test('all three selected chunks retain their relevant windows within the shared budget',()=>{
 const chunks=Array.from({length:3},(_,i)=>({id:'source-'+i,title:'Cobalt calibration coefficient',text:'Background information. '.repeat(180)+`Cobalt calibration coefficient is ${17+i}.42.`}));
 const excerpt=selectExcerpts('Cobalt calibration coefficient?',chunks);
 assert.ok(excerpt.length<=4800);
 for(let i=0;i<3;i++){assert.ok(excerpt.includes(`[source-${i}]`));assert.ok(excerpt.includes(`coefficient is ${17+i}.42.`));}
 const short={id:'short',title:'Cobalt calibration coefficient',text:'Cobalt calibration coefficient is 2.'};
 assert.equal(selectExcerpts('Cobalt calibration coefficient',[short]),'[short] Cobalt calibration coefficient\n'+short.text);
});
test('invalid source references and conflicting aliases fail closed',()=>{
 const r=structuredClone(example);r.faq[0].sourceIds=['missing'];assert.throws(()=>validateLibrary(r),/unknown FAQ source/);
 const c=structuredClone(example);c.faq[1].aliases=[c.faq[0].question];assert.throws(()=>validateLibrary(c),/冲突/);
});
test('text import creates a new library with no prior prepared answers',()=>{
 const r=compileText('# Solar panels\n\nThis project measures daily panel output.','slides.md');
 assert.equal(r.faq.length,0);assert.equal(r.sources[0].name,'slides.md');assert.match(selectExcerpts('panel output',r.chunks),/daily panel output/);
 assert.throws(()=>compileText(''),/UTF-8/);assert.throws(()=>compileText('binary\0data'),/Binary/);
});
test('effort selection uses model-supported settings only',()=>{
 assert.equal(selectEffort({id:'m',efforts:['low','high']}),'low');
 assert.equal(selectEffort({id:'m',efforts:['medium'],defaultEffort:'medium'}),'medium');
 assert.throws(()=>selectEffort({id:'m',efforts:['low']},'none'),/Unsupported/);
});
test('UTF-8 streamed text survives fragmented bytes',async()=>{
 const b=new TextEncoder().encode('data: {"text":"用电量 / meter’s"}\n\ndata: [DONE]\n');
 const stream=(async function*(){for(let i=0;i<b.length;i+=3)yield b.slice(i,i+3);})();
 const out=[];for await(const x of readSSE(stream))out.push(x);assert.deepEqual(out,[{text:'用电量 / meter’s'}]);
});
test('import CLI supports paths with spaces and backs up the previous library',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'qa-import-'));
 try{
  await cp(path.join(root,'src/library.mjs'),path.join(temp,'src/library.mjs'));
  await cp(path.join(root,'public'),path.join(temp,'public'),{recursive:true});
  await cp(path.join(root,'scripts'),path.join(temp,'scripts'),{recursive:true});
  const source=path.join(temp,'my notes.md');await writeFile(source,'# Example\n\nFirst unique text.');
  for(const value of ['First unique text.','Second new text.']){await writeFile(source,value);const r=spawnSync(process.execPath,[path.join(temp,'scripts/import-library.mjs'),source],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  const result=JSON.parse(await readFile(path.join(temp,'user-data/reference.json'),'utf8'));assert.equal(result.context,'Second new text.');assert.equal(result.faq.length,0);
  const extra=path.join(temp,'extra.txt');await writeFile(extra,'Additional unique material.');
  const appended=spawnSync(process.execPath,[path.join(temp,'scripts/import-library.mjs'),'--append',extra],{encoding:'utf8'});assert.equal(appended.status,0,appended.stderr);
  const merged=JSON.parse(await readFile(path.join(temp,'user-data/reference.json'),'utf8'));assert.equal(merged.sources.length,2);assert.match(JSON.stringify(merged),/Second new text/);assert.match(JSON.stringify(merged),/Additional unique material/);
 }finally{await rm(temp,{recursive:true,force:true});}
});

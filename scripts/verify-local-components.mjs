// Disposable local integration run: managed artifacts only; never uses account credentials.
import {mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCatalog} from '../components/catalog.mjs';
import {ComponentManager} from '../components/manager.mjs';
import {selfTest,silenceWav} from '../components/self-test.mjs';
import {LocalASR} from '../src/asr.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),catalog=await loadCatalog(),dir=path.join(root,'dist/qa/component-data');await mkdir(dir,{recursive:true});const manager=await new ComponentManager(dir,catalog,{selfTest}).init();
process.on('SIGINT',()=>{manager.close();process.exitCode=130;});
const report={platform:process.platform+'-'+process.arch,started:new Date().toISOString(),components:[],models:[],qualityScope:'Public English JFK sample plus silence; no real microphone or language-quality validation.'};
const output=path.join(root,'dist/qa/component-integration.json');const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n');
try{
 for(const e of catalog.filter(e=>e.kind==='runtime'&&!e.unavailable)){
  const file=path.join(root,'dist/components',new URL(e.url).pathname.split('/').at(-1));
  if(!manager.installed(e.id))await manager.importFile(e.id,createReadStream(file));await manager.verify(e.id);report.components.push({id:e.id,version:e.version,downloadBytes:e.bytes,installedBytes:manager.state.installed[e.id].bytes,verified:true});await save();console.log('Verified component '+e.id);
 }
 const original=await readFile(path.join(root,'dist/qa/jfk.wav'));let pcm;
 for(let offset=12;offset+8<=original.length;){const size=original.readUInt32LE(offset+4);if(original.toString('ascii',offset,offset+4)==='data'){pcm=original.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
 if(!pcm)throw Error('Public WAV sample has no PCM data');const wav=Buffer.concat([silenceWav().subarray(0,44),pcm]);wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(pcm.length,40);
 for(const model of catalog.filter(e=>e.kind==='model')){
  const modelFile=process.argv[2];if(model.id==='whisper-large-v3-turbo-q5_0'&&modelFile&&!manager.installed(model.id))await manager.importFile(model.id,createReadStream(path.resolve(modelFile)));
  if(!manager.installed(model.id)){const task=await manager.start(model.id);while(manager.busy)await new Promise(r=>setTimeout(r,500));if(task.state!=='done')throw Error(model.id+': '+task.error);}
  const start=performance.now(),asr=new LocalASR(root,[],{bin:manager.entryPath('whisper-runtime'),model:manager.entryPath(model.id),modelId:model.id,version:'1.9.5-replymate.1',language:'en',threads:4});
  try{await asr.ready;if(asr.state!=='ready')throw Error(asr.error);const loadMs=Math.round(performance.now()-start),cold=await asr.transcribe(wav),warm=await asr.transcribe(wav),silence=await asr.transcribe(silenceWav());
   const forbidden=await fetch(asr.url.replace('/inference','/health'),{headers:{Origin:'https://example.invalid'}});if(forbidden.status!==403)throw Error('Worker accepted a browser origin');
   report.models.push({id:model.id,bytes:model.bytes,loadMs,cold:{text:cold.text,ms:cold.ms,rtf:cold.rtf},warm:{text:warm.text,ms:warm.ms,rtf:warm.rtf},silence:silence.text,silenceSuppressed:silence.text==='',originBlocked:forbidden.status===403});console.log('Verified model '+model.id+' RTF '+warm.rtf.toFixed(2));await save();
  }finally{await asr.close();}
 }
 report.completed=new Date().toISOString();await save();
}finally{manager.close();}

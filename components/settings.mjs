import {readFile,writeFile,rename,mkdir,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
export const defaults={model:'whisper-large-v3-turbo-q5_0',language:'en',speechMode:'fast',threads:4,useGPU:true,autoWarm:true};
export async function readJSON(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
const pendingWrites=new Map();
export function atomicJSON(file,value){
 file=path.resolve(file);const contents=JSON.stringify(value,null,2)+'\n';
 // Windows cannot reliably replace the same destination from concurrent renames.
 const writing=(pendingWrites.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,contents,{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await rm(temp,{force:true});}
 });
 const done=writing.finally(()=>{if(pendingWrites.get(file)===done)pendingWrites.delete(file);});pendingWrites.set(file,done);return done;
}
export class Settings{
 constructor(dir){this.file=path.join(dir,'settings.json');this.value={...defaults};}
 async load(){this.value={...defaults,...await readJSON(this.file,{})};return this.value;}
 async save(next){await atomicJSON(this.file,next);this.value=next;return next;}
}

import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
export const defaults={model:'whisper-large-v3-turbo-q5_0',language:'en',speechMode:'fast',threads:4,useGPU:true,autoWarm:true};
export async function readJSON(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function atomicJSON(file,value){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file);}
export class Settings{
 constructor(dir){this.file=path.join(dir,'settings.json');this.value={...defaults};}
 async load(){this.value={...defaults,...await readJSON(this.file,{})};return this.value;}
 async save(next){await atomicJSON(this.file,next);this.value=next;return next;}
}

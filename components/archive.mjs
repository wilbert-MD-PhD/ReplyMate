// Minimal deterministic USTAR: only regular files and directories, no links or extensions.
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,open,lstat,readdir} from 'node:fs/promises';
import {createGunzip,createGzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
export function safeRelative(name){
 if(!name||name.includes('\\')||name.startsWith('/')||/[:\x00-\x1f]/.test(name)||name.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x)))throw Error('组件包含不安全路径');
 return name;
}
export async function unpack(archive,dest,limit,signal){
 await mkdir(dest,{recursive:true,mode:0o700});
 const source=createReadStream(archive),gunzip=createGunzip();source.on('error',e=>gunzip.destroy(e));source.pipe(gunzip);
 let buffer=Buffer.alloc(0),remaining=0,padding=0,handle=null,total=0,count=0,ended=false;const names=new Set();
 try{for await(const chunk of gunzip){signal?.throwIfAborted();buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length){
   if(remaining){const n=Math.min(buffer.length,remaining);await handle.write(buffer.subarray(0,n));buffer=buffer.subarray(n);remaining-=n;if(!remaining){await handle.close();handle=null;}continue;}
   if(padding){const n=Math.min(buffer.length,padding);buffer=buffer.subarray(n);padding-=n;continue;}
   if(buffer.length<512)break;
   const h=buffer.subarray(0,512);buffer=buffer.subarray(512);
   if(h.every(x=>x===0)){ended=true;continue;}if(ended)throw Error('组件归档尾部异常');
   const field=(a,b)=>h.subarray(a,b).toString().replace(/\0.*$/s,'');
   let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:h[i];if(checksum!==parseInt(field(148,156).trim(),8))throw Error('组件归档校验头损坏');
   const name=safeRelative([field(345,500),field(0,100)].filter(Boolean).join('/').replace(/\/$/,''));
   if(names.has(name.toLowerCase()))throw Error('组件包含重复路径');names.add(name.toLowerCase());if(++count>30000)throw Error('组件文件过多');
   const size=parseInt(field(124,136).trim(),8)||0,type=field(156,157),mode=parseInt(field(100,108).trim(),8)||0;
   if(!Number.isSafeInteger(size)||size<0||(total+=size)>limit)throw Error('组件超过解包上限');
   if(!['','0','5'].includes(type)||type==='5'&&size)throw Error('组件不允许链接或特殊文件');
   const file=path.join(dest,name);await mkdir(type==='5'?file:path.dirname(file),{recursive:true,mode:0o700});
   if(type!=='5'){handle=await open(file,'wx',mode&0o111?0o700:0o600);remaining=size;padding=(512-size%512)%512;if(!remaining){await handle.close();handle=null;}}
  }
 }
 if(remaining||padding||!ended||buffer.some(x=>x!==0))throw Error('组件归档不完整');
 return {bytes:total,files:count};
 }finally{await handle?.close();source.destroy();gunzip.destroy();}
}
export async function pack(dir,archive){
 let bytes=0,files=0;
 async function* walk(rel=''){
  for(const name of (await readdir(path.join(dir,rel))).sort()){
   const relative=rel?rel+'/'+name:name,file=path.join(dir,relative),s=await lstat(file);safeRelative(relative);
   if(s.isSymbolicLink())throw Error('Build must materialize symlinks: '+relative);
   if(s.isDirectory()){yield* walk(relative);continue;}if(!s.isFile())throw Error('Unsupported build file');
   const h=Buffer.alloc(512);let basename=relative,prefix='';
   if(Buffer.byteLength(basename)>100){const split=relative.lastIndexOf('/');prefix=relative.slice(0,split);basename=relative.slice(split+1);}
   if(Buffer.byteLength(basename)>100||Buffer.byteLength(prefix)>155)throw Error('Archive path too long: '+relative);
   const put=(text,pos,len)=>h.write(text,pos,len,'utf8'),oct=(n,pos,len)=>put(n.toString(8).padStart(len-1,'0')+'\0',pos,len);
   put(basename,0,100);oct(s.mode&0o111?0o755:0o644,100,8);oct(0,108,8);oct(0,116,8);oct(s.size,124,12);oct(0,136,12);h.fill(32,148,156);put('0',156,1);put('ustar\0',257,6);put('00',263,2);put(prefix,345,155);put([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148,8);
   yield h;yield* createReadStream(file);if(s.size%512)yield Buffer.alloc(512-s.size%512);bytes+=s.size;files++;
  }
 }
 async function* tar(){yield* walk();yield Buffer.alloc(1024);}
 await pipeline(Readable.from(tar()),createGzip({level:9}),createWriteStream(archive,{flags:'wx'}));return {bytes,files};
}

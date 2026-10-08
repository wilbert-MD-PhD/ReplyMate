import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function selfTest(e,dir){const entry=path.join(dir,e.entry);
 if(e.kind==='model'){const f=await open(entry,'r');try{const h=Buffer.alloc(8);await f.read(h,0,8,0);if(h.readUInt32LE(0)!==0x67676d6c)throw Error('Whisper 模型头无效');}finally{await f.close();}return;}
 if(e.id.startsWith('docs-')){const plugin=await import(pathToFileURL(entry).href);if(typeof plugin.extract!=='function'||plugin.protocol!==1)throw Error('解析器协议不兼容');await plugin.selfTest();return;}
 await new Promise((resolve,reject)=>{const child=spawn(entry,[e.id==='codex-runtime'?'--version':'--help'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',d=>text+=d);child.stderr.on('data',d=>text+=d);const timer=setTimeout(()=>{child.kill();reject(Error('组件启动自检超时'));},15000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);if(code!==0||!new RegExp(e.id==='codex-runtime'?'codex':'request-path').test(text))reject(Error('组件启动自检失败'));else resolve();});});
}
export function silenceWav(){const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}

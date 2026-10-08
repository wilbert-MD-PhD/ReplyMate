import {cp,mkdir,rm,readFile,writeFile,stat,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {pack} from '../components/archive.mjs';
import {sha256} from '../components/manager.mjs';
import {selfTest} from '../components/self-test.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),require=createRequire(import.meta.url),platform=process.platform+'-'+process.arch;
const triples={'darwin-arm64':'aarch64-apple-darwin','darwin-x64':'x86_64-apple-darwin','win32-x64':'x86_64-pc-windows-msvc'};
if(!triples[platform])throw Error('Unsupported release platform: '+platform);
const pkg=path.dirname(require.resolve('@openai/codex-'+platform+'/package.json'));
const output=path.join(root,'dist/components');await mkdir(output,{recursive:true});const staging=path.join(root,'build/component-staging');await mkdir(staging,{recursive:true});
const version='2.5.0',release='https://github.com/wilbert-MD-PhD/ReplyMate/releases/download/v'+version+'/';
const definitions=[
 {id:'codex-runtime',name:'AI 回答',version:JSON.parse(await readFile(path.join(pkg,'package.json'),'utf8')).version,sourceDir:path.join(pkg,'vendor',triples[platform]),entry:'bin/'+(process.platform==='win32'?'codex.exe':'codex'),license:'Apache-2.0',source:'https://github.com/openai/codex',extraLicense:path.join(root,'desktop/CODEX-LICENSE')},
 {id:'docs-office',name:'Word 与 PowerPoint',version:'1.0.0',sourceDir:path.join(root,'plugins/docs-office'),entry:'index.mjs',license:'MIT; ISC',source:'https://github.com/wilbert-MD-PhD/ReplyMate/tree/v'+version+'/plugins/docs-office',nodeMin:22},
 {id:'docs-pdf',name:'PDF 文字读取',version:'1.0.0',sourceDir:path.join(root,'plugins/docs-pdf'),entry:'index.mjs',license:'Apache-2.0; MIT',source:'https://github.com/mozilla/pdf.js',nodeMin:22},
 {id:'whisper-runtime',name:'本地语音识别引擎',version:'1.9.5-replymate.1',sourceDir:path.join(root,'build/whisper-runtime'),entry:'bin/'+(process.platform==='win32'?'whisper-server.exe':'whisper-server'),license:'MIT',source:'https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.5'}
];
const catalog=[];
for(const def of definitions){try{await stat(path.join(def.sourceDir,def.entry));}catch(e){if(def.id==='whisper-runtime'){console.log('Whisper engine has not been built; catalog will mark it unavailable.');continue;}throw e;}
 const stage=path.join(staging,def.id);await rm(stage,{recursive:true,force:true});await cp(def.sourceDir,stage,{recursive:true,dereference:true,filter:p=>!p.includes(path.sep+'.bin'+path.sep)&&!p.endsWith(path.sep+'.bin')});
 if(def.extraLicense)await cp(def.extraLicense,path.join(stage,'LICENSE'));
 const name=`${def.id}-${def.version}-${platform}.tar.br`,file=path.join(output,name);await rm(file,{force:true});
 const entry={id:def.id,name:def.name,kind:'runtime',version:def.version,platform,minApp:version,protocol:1,format:'tar.br',entry:def.entry,dependencies:[],license:def.license,source:def.source,nodeMin:def.nodeMin,signature:'not-code-signed',url:release+name};
 await selfTest(entry,stage);const measured=await pack(stage,file,entry.format);Object.assign(entry,{bytes:(await stat(file)).size,unpackedBytes:measured.bytes,sha256:await sha256(file)});catalog.push(entry);console.log(`${def.id}: ${(entry.bytes/1e6).toFixed(2)} MB download / ${(entry.unpackedBytes/1e6).toFixed(2)} MB installed`);
}
await writeFile(path.join(root,'components/catalog.generated.json'),JSON.stringify(catalog,null,2)+'\n');await writeFile(path.join(output,'catalog-'+platform+'.json'),JSON.stringify(catalog,null,2)+'\n');await writeFile(path.join(output,'SHA256SUMS-'+platform+'.txt'),catalog.map(e=>e.sha256+'  '+new URL(e.url).pathname.split('/').at(-1)).join('\n')+'\n');

import {cp,mkdir,rm,readFile,writeFile,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dest=path.join(root,'build/core');
const coreFiles=['desktop/main.cjs','desktop/icon.png','desktop/icon.icns','desktop/icon.ico','config.mjs','model-policy.mjs','library.mjs','workspace.mjs','auth-url.mjs','server.mjs','bridge.mjs','demo.mjs','core.mjs','asr.mjs','warmup.mjs','LICENSE','THIRD_PARTY_NOTICES.md'];
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const name of coreFiles){await mkdir(path.dirname(path.join(dest,name)),{recursive:true});await cp(path.join(root,name),path.join(dest,name));}
for(const name of ['public','examples','components'])await cp(path.join(root,name),path.join(dest,name),{recursive:true,filter:async source=>!(await lstat(source)).isSymbolicLink()});
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));delete pkg.devDependencies;delete pkg.scripts;pkg.dependencies={};await writeFile(path.join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
let bytes=0;async function scan(dir){for(const n of await readdir(dir)){const f=path.join(dir,n),s=await lstat(f);if(s.isDirectory())await scan(f);else bytes+=s.size;}}await scan(dest);
console.log('Core staging: '+bytes+' bytes; zero production dependencies.');

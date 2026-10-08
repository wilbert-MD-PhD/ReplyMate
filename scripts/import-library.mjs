import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileText,readLibrary,mergeLibraries} from '../src/library.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try{
 const args=process.argv.slice(2),mode=args[0]==='--append'?'append':'replace';
 if(['--append','--replace'].includes(args[0]))args.shift();
 if(!args.length)throw Error('Usage: npm run import -- [--append|--replace] file1.md file2.json ...');
 const libraries=[];
 if(mode==='append'){try{libraries.push(await readLibrary(path.join(root,'user-data/reference.json')));}catch(e){if(e.code!=='ENOENT')throw e;}}
 for(const input of args){
  const file=path.resolve(input),extension=path.extname(file).toLowerCase();
  if(!['.md','.txt','.json'].includes(extension))throw Error('Supported formats: .md, .txt, .json. Use the UI for Office/PDF.');
  libraries.push(extension==='.json'?await readLibrary(file):compileText(await readFile(file,'utf8'),path.basename(file)));
 }
 const library=mergeLibraries(libraries);
 const dir=path.join(root,'user-data');await mkdir(dir,{recursive:true,mode:0o700});
 const dest=path.join(dir,'reference.json');
 try{const prior=await readFile(dest);await writeFile(path.join(dir,'reference-'+Date.now()+'.backup.json'),prior,{mode:0o600});}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path.join(dir,'reference.tmp');await writeFile(temp,JSON.stringify(library,null,2)+'\n',{mode:0o600});await rename(temp,dest);
 console.log(`Imported ${library.chunks.length} chunks and ${library.stats.prepared} reviewed answers. Restart the server and refresh the page.`);
}catch(e){console.error(e.message);process.exitCode=1;}

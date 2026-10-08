import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileText,readLibrary} from '../src/library.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try{
 const input=process.argv[2];if(!input)throw Error('Usage: npm run import -- path/to/notes.md (or a library JSON)');
 const file=path.resolve(input),extension=path.extname(file).toLowerCase();
 if(!['.md','.txt','.json'].includes(extension))throw Error('Supported formats: .md, .txt, .json. Export Office/PDF text first.');
 if((await stat(file)).size>5000000)throw Error('Input exceeds 5 MB');
 const library=extension==='.json'?await readLibrary(file):compileText(await readFile(file,'utf8'),path.basename(file));
 const dir=path.join(root,'user-data');await mkdir(dir,{recursive:true,mode:0o700});
 const dest=path.join(dir,'reference.json');
 try{const prior=await readFile(dest);await writeFile(path.join(dir,'reference-'+Date.now()+'.backup.json'),prior,{mode:0o600});}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path.join(dir,'reference.tmp');await writeFile(temp,JSON.stringify(library,null,2)+'\n',{mode:0o600});await rename(temp,dest);
 console.log(`Imported ${library.chunks.length} chunks and ${library.stats.prepared} reviewed answers. Restart the server and refresh the page.`);
}catch(e){console.error(e.message);process.exitCode=1;}

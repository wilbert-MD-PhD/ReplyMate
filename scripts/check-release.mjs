import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseFiles} from './release-files.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function checkRelease(){
 let total=0;
 const patterns=[/\/(?:Users|home)\/[^\s/]+\//,/[A-Z]:\\Users\\/i,/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/,/sk-[A-Za-z0-9_-]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
 for(const name of releaseFiles){
  const file=path.join(root,name),meta=await lstat(file);if(!meta.isFile()||meta.isSymbolicLink())throw Error('Release file must be a regular file: '+name);
  const content=await readFile(file);total+=content.length;
  for(const pattern of patterns)if(pattern.test(content.toString()))throw Error('Potential private data in '+name);
  if(content.length>5000000)throw Error('Unexpected large file: '+name);
 }
 const html=await readFile(path.join(root,'public/index.html'),'utf8');
 if(/<meta[^>]+name=["']generator["']/i.test(html))throw Error('Public HTML contains generator metadata');
 if(!html.includes('<meta name="author" content="wilbert">'))throw Error('Missing document author metadata');
 console.log(`Release audit passed: ${releaseFiles.length} allowlisted files, ${total} bytes.`);
 return {count:releaseFiles.length,bytes:total};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await checkRelease();

import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseFiles} from './release-files.mjs';
import {checkRelease} from './check-release.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await checkRelease();
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const stem='meeting-qa-assistant-v'+version,dir=path.join(root,'dist');await mkdir(dir,{recursive:true});
function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
const local=[],central=[],manifest=[];let offset=0;
for(const name of releaseFiles){
 const data=await readFile(path.join(root,name)),filename=Buffer.from(stem+'/'+name),crc=crc32(data);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
 local.push(header,filename,data);
 const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x0314,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(((name.endsWith('.sh')||name.endsWith('.command')?0o100755:0o100644)*65536)>>>0,38);entry.writeUInt32LE(offset,42);
 central.push(entry,filename);offset+=header.length+filename.length+data.length;
 manifest.push({path:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(releaseFiles.length,8);end.writeUInt16LE(releaseFiles.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...local,cd,end]);await writeFile(path.join(dir,stem+'.zip'),zip);
const manifestName=stem+'-manifest.json',manifestBytes=Buffer.from(JSON.stringify({version,files:manifest},null,2)+'\n');await writeFile(path.join(dir,manifestName),manifestBytes);
await writeFile(path.join(dir,'SHA256SUMS.txt'),[[stem+'.zip',zip],[manifestName,manifestBytes]].map(([n,b])=>createHash('sha256').update(b).digest('hex')+'  '+n).join('\n')+'\n');
console.log(stem+'.zip: '+(await stat(path.join(dir,stem+'.zip'))).size+' bytes');

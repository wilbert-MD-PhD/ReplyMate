import {unzipSync,strFromU8,zipSync,strToU8} from 'fflate';
import {SaxesParser} from 'saxes';
import path from 'node:path';
export const protocol=1;
function parse(xml,handlers){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('文档包含不支持的实体声明');const p=new SaxesParser({xmlns:true});for(const [k,v] of Object.entries(handlers))p.on(k,v);p.write(xml).close();}
function text(xml,word=false){let out='',capture=0;parse(xml,{opentag:n=>{if(n.local==='t')capture++;if(n.local==='tab')out+='\t';if(n.local==='br')out+='\n';},text:t=>{if(capture)out+=t;},closetag:n=>{if(n.local==='t')capture--;if(n.local==='p')out+='\n';if(word&&n.local==='tc')out+='\t';if(word&&n.local==='tr')out+='\n';}});return out;}
function attrs(xml,tag){const list=[];parse(xml,{opentag:n=>{if(n.local===tag){const a={};for(const v of Object.values(n.attributes))a[v.name]=v.value;list.push(a);}}});return list;}
export async function extract(data,ext){
 const files=unzipSync(data,{filter:f=>/\.xml$|\.rels$/.test(f.name)});
 const xml=name=>{if(!files[name])throw Error('文档缺少 '+name);return strFromU8(files[name]);};
 if(ext==='.docx')return text(xml('word/document.xml'),true);
 if(ext!=='.pptx')throw Error('文档格式不支持');
 const rels=attrs(xml('ppt/_rels/presentation.xml.rels'),'Relationship');
 const slides=attrs(xml('ppt/presentation.xml'),'sldId');let out='';
 for(const [i,slide] of slides.entries()){
  const rel=rels.find(r=>r.Id===slide['r:id']);if(!rel||rel.TargetMode==='External')throw Error('幻灯片关系无效');
  const file=path.posix.normalize(path.posix.join('ppt',rel.Target));if(!file.startsWith('ppt/'))throw Error('幻灯片路径无效');out+=`\n第 ${i+1} 页\n`+text(xml(file));
  const rp=path.posix.join(path.posix.dirname(file),'_rels',path.posix.basename(file)+'.rels');
  if(files[rp])for(const r of attrs(xml(rp),'Relationship'))if(r.Type?.endsWith('/notesSlide')&&r.TargetMode!=='External'){
   const note=path.posix.normalize(path.posix.join(path.posix.dirname(file),r.Target));if(!note.startsWith('ppt/'))throw Error('备注路径无效');if(files[note])out+='\n讲者备注\n'+text(xml(note));
  }
 }
 return out;
}
export async function selfTest(){const value='组件文字读取自检';const data=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:word"><w:p><w:r><w:t>'+value+'</w:t></w:r></w:p></w:document>')});if(!(await extract(data,'.docx')).includes(value))throw Error('Office 解析自检失败');}

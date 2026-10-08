import {readFile, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {compileText, validateLibrary, mergeLibraries} from './library.mjs';

export const importExtensions = ['.md', '.txt', '.json', '.docx', '.pptx', '.pdf'];
export async function parseImport(name, data, {parser}={}) {
  name = path.basename(String(name).replaceAll('\\', '/'));
  const ext = path.extname(name).toLowerCase();
  if (!importExtensions.includes(ext)) throw Error('请选择 Word、PowerPoint、PDF、Markdown、TXT 或资料 JSON 文件');
  if (!data.length) throw Error('文件不能为空');
  if (ext === '.json') {
    return validateLibrary(JSON.parse(data.toString('utf8')));
  }
  let text;
  if (ext === '.md' || ext === '.txt') text = new TextDecoder('utf-8', {fatal:true}).decode(data);
  else {
    const id=ext==='.pdf'?'docs-pdf':'docs-office';
    if(!parser){const {ComponentRequired}=await import('../components/runtime-resolver.mjs');throw new ComponentRequired(id);}
    text=await (await parser(id)).extract(data,ext);
    if (!text?.trim()) throw Error('未提取到文字。扫描件和图片请先识别文字后导入');
  }
  return compileText(text, name);
}
export async function saveLibrary(dir, library) {
  await mkdir(dir, {recursive:true, mode:0o700});
  const destination = path.join(dir, 'reference.json');
  const temporary = path.join(dir, 'reference-'+randomUUID()+'.tmp');
  let backup = null;
  try {
    const previous = await readFile(destination);
    backup = 'reference-'+Date.now()+'-'+randomUUID()+'.backup.json';
    await writeFile(path.join(dir, backup), previous, {mode:0o600, flag:'wx'});
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await writeFile(temporary, JSON.stringify(library, null, 2)+'\n', {mode:0o600, flag:'wx'});
    await rename(temporary, destination);
  } finally { await rm(temporary, {force:true}); }
  return {backup};
}

export async function parseImports(files,{mode='replace',current,parser}={}){
 if(!['append','replace'].includes(mode))throw Error('请选择追加或替换资料库');
 if(!files.length)throw Error('请选择至少一份资料');
 const libraries=mode==='append'&&current?[current]:[];
 for(const file of files){
  try{libraries.push(await parseImport(file.name,await file.bytes(),{parser}));}
  catch(error){error.message=file.name+'：'+error.message;throw error;}
 }
 return mergeLibraries(libraries);
}

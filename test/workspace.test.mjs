import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {parseImport as parseImportCore,saveLibrary,maxImportBytes} from '../src/workspace.mjs';

const parseImport=(name,data)=>parseImportCore(name,data,{parser:id=>import('../plugins/'+id+'/index.mjs')});
const zip=files=>Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)]))));
test('imports text, clears sample FAQ, backs up replaced data and preserves invalid input',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'replymate-import-test-'));
 try{
  const first=await parseImport('notes.md',Buffer.from('# My project\n\nOur sample includes 24 participants.'));
  assert.equal(first.faq.length,0);assert.match(first.context,/24 participants/);
  await saveLibrary(dir,first);
  const next=await parseImport('second.txt',Buffer.from('This is another project.'));
  const saved=await saveLibrary(dir,next);assert.ok(saved.backup);
  assert.match(await readFile(path.join(dir,saved.backup),'utf8'),/24 participants/);
  assert.match(await readFile(path.join(dir,'reference.json'),'utf8'),/another project/);
  await assert.rejects(parseImport('invalid.json',Buffer.from('{"context":"incomplete"}')));
  assert.match(await readFile(path.join(dir,'reference.json'),'utf8'),/another project/);
  assert.equal((await readdir(dir)).some(n=>n.endsWith('.tmp')),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('import rejects unsupported, empty, oversized and non-UTF8 files',async()=>{
 for(const [name,data] of [['bad.exe',Buffer.from('bad')],['empty.txt',Buffer.alloc(0)],['big.txt',Buffer.alloc(maxImportBytes+1)],['bad.txt',Buffer.from([0xff])]])await assert.rejects(parseImport(name,data));
});
test('imports Word paragraphs and PowerPoint slides without external programs',async()=>{
 const docx=zip({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>','word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word project has 24 participants.</w:t></w:r></w:p></w:body></w:document>'});
 const word=await parseImport('slides.docx',docx);assert.match(word.context,/24 participants/);
 const pptx=zip({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>','ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>','ppt/_rels/presentation.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/></Relationships>','ppt/slides/slide1.xml':'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>PowerPoint project has 12 teams.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'});
 const slides=await parseImport('slides.pptx',pptx);assert.match(slides.context,/12 teams/);
});
test('imports PDF text without OCR or network downloads',async()=>{
 const stream='BT /F1 12 Tf 50 750 Td (PDF project has 18 teams.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const library=await parseImport('reference.pdf',Buffer.from(pdf));assert.match(library.context,/18 teams/);
});

test('Office plugin preserves table text and PPT presentation order plus speaker notes',async()=>{
 const office=await import('../plugins/docs-office/index.mjs');
 const word=zip({'word/document.xml':'<w:document xmlns:w="urn:w"><w:p><w:r><w:t>前言</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>组别</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>结果</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>'});
 assert.match(await office.extract(word,'.docx'),/前言[\s\S]*组别[\s\S]*结果/);
 const ppt=zip({'ppt/presentation.xml':'<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="two"/><p:sldId r:id="one"/></p:sldIdLst></p:presentation>','ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="one" Target="slides/slide1.xml"/><Relationship Id="two" Target="slides/slide2.xml"/></Relationships>','ppt/slides/slide1.xml':'<a:p xmlns:a="urn:a"><a:r><a:t>second slide</a:t></a:r></a:p>','ppt/slides/slide2.xml':'<a:p xmlns:a="urn:a"><a:r><a:t>first slide</a:t></a:r></a:p>','ppt/slides/_rels/slide2.xml.rels':'<Relationships><Relationship Id="note" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>','ppt/notesSlides/notesSlide2.xml':'<a:p xmlns:a="urn:a"><a:r><a:t>speaker note</a:t></a:r></a:p>'});
 assert.match(await office.extract(ppt,'.pptx'),/first slide[\s\S]*speaker note[\s\S]*second slide/);
 await assert.rejects(office.extract(zip({'word/document.xml':'<!DOCTYPE foo [<!ENTITY x "bad">]><foo>&x;</foo>'}),'.docx'),/实体/);
});

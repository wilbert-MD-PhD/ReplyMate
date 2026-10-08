const assert = require('node:assert/strict');
const {zipSync, strToU8} = require('fflate');

module.exports = async function checkPackagedApp(origin) {
  const status = await (await fetch(origin+'/api/status')).json();
  assert.equal(status.version, '2.4.0');
  assert.equal(status.desktop, true);
  assert.equal(status.backend, 'demo');
  assert.equal(status.auth.signedIn, false);
  assert.equal(status.auth.error, null);
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('会议问答助手') && html.includes('选择资料'));
  const headers = {Origin:origin, 'X-Session-Token':status.token};
  const docx = zipSync({
    '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>The packaged Word reader works.</w:t></w:r></w:p></w:body></w:document>')
  });
  const stream = 'BT /F1 12 Tf 50 750 Td (Packaged PDF project has 18 teams.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n', offsets = [];
  for(const [i, obj] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${obj}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  for(const [name, body] of [['check.docx',docx],['check.pdf',Buffer.from(pdf)]]) {
    const res = await fetch(origin+'/api/library/import',{method:'POST',headers:{...headers,'X-File-Name':name},body});
    assert.equal(res.status,200,await res.text());
  }
  const updated = await (await fetch(origin+'/api/status')).json();
  assert.equal(updated.customLibrary,true);
  assert.equal(updated.reference[0].name,'check.pdf');
  const res = await fetch(origin+'/api/answer',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({question:'Tell me about the project with 18 teams'})});
  assert.equal(res.status,200);
  const answer = await res.text();
  assert.match(answer,/event: done/);
  assert.doesNotMatch(answer,/event: error/);
  assert.match([...answer.matchAll(/^data: (.+)$/gm)].map(m=>JSON.parse(m[1]).text||'').join(''),/18 teams/);
};

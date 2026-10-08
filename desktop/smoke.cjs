const assert = require('node:assert/strict');

module.exports = async function checkPackagedApp(origin) {
  const status = await (await fetch(origin+'/api/status')).json();
  assert.equal(status.version, '2.5.0');
  assert.equal(status.desktop, true);
  assert.equal(status.backend, 'demo');
  assert.equal(status.auth.signedIn, false);
  assert.equal(status.auth.error, null);
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('会议问答助手') && html.includes('选择资料'));
  const headers = {Origin:origin, 'X-Session-Token':status.token};
  assert.equal(status.warmup.state,'waiting');
  const components=await (await fetch(origin+'/api/components',{headers:{'X-Session-Token':status.token}})).json();
  assert.ok(components.entries.every(e=>e.state==='missing'));
  const missing=await fetch(origin+'/api/library/import',{method:'POST',headers:{...headers,'X-File-Name':'check.docx'},body:Buffer.from('missing component')});
  assert.equal(missing.status,400);assert.equal((await missing.json()).code,'COMPONENT_REQUIRED');
  const source='The packaged TXT reader works. This project has 18 teams.';
  const imported=await fetch(origin+'/api/library/import',{method:'POST',headers:{...headers,'X-File-Name':'check.txt'},body:source});assert.equal(imported.status,200);
  const updated = await (await fetch(origin+'/api/status')).json();
  assert.equal(updated.customLibrary,true);
  assert.equal(updated.reference[0].name,'check.txt');
  const res = await fetch(origin+'/api/answer',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({question:'Tell me about the project with 18 teams'})});
  assert.equal(res.status,200);
  const answer = await res.text();
  assert.match(answer,/event: done/);
  assert.doesNotMatch(answer,/event: error/);
  assert.match([...answer.matchAll(/^data: (.+)$/gm)].map(m=>JSON.parse(m[1]).text||'').join(''),/18 teams/);
};

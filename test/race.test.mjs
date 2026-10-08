import test from 'node:test';import assert from 'node:assert/strict';import {CodexBridge} from '../bridge.mjs';
function fake(answer){const b=Object.create(CodexBridge.prototype);b.models=[{id:'fast-model'},{id:'review-model'}];b.raceModels=['fast-model','review-model'];b.answer=answer;return b;}
test('race forwards only the first responder and cancels the other',async()=>{
 let cancelled=false;
 const b=fake(({model},onDelta,signal)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{onDelta(model);resolve({model});},model==='fast-model'?5:50);
  signal.addEventListener('abort',()=>{cancelled=true;clearTimeout(timer);reject(new Error('cancelled'));});
 }));const chunks=[];const result=await b.race({},(t)=>chunks.push(t));assert.deepEqual(chunks,['fast-model']);assert.equal(result.model,'fast-model');assert.equal(cancelled,true);
});
test('race fails clearly if all models fail',async()=>{const b=fake(async()=>{throw new Error('offline');});await assert.rejects(b.race({},()=>{}),/offline/);});
test('race respects cancellation before starting any work',async()=>{let called=false;const b=fake(async()=>{called=true;});const c=new AbortController();c.abort();await assert.rejects(b.race({},()=>{},c.signal),/已取消/);assert.equal(called,false);});
test('whitespace does not win; an empty response does not hang the race',async()=>{
 const b=fake(async({model},onDelta)=>{if(model==='fast-model'){onDelta('  ');return {model};}onDelta('Useful answer');return {model};});
 const chunks=[];assert.equal((await b.race({},t=>chunks.push(t))).model,'review-model');assert.deepEqual(chunks,['Useful answer']);
 await assert.rejects(fake(async()=>({text:''})).race({},()=>{}),/未返回正文/);
});
test('winning the fast race never cancels an independent deep request',async()=>{
 const controllers=[],started=[];let finishDeep;
 const b=fake(({model},onDelta,signal)=>new Promise((resolve,reject)=>{
  started.push(model);controllers.push({model,signal});
  if(model==='deep-model'){finishDeep=()=>{onDelta('Deep answer');resolve({model});};return;}
  const timer=setTimeout(()=>{onDelta(model);resolve({model});},model==='fast-model'?5:50);
  signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('cancelled'));});
 }));
 const deepController=new AbortController(),deep=b.answer({model:'deep-model'},()=>{},deepController.signal);
 const fast=b.race({},()=>{});assert.equal(started.length,3);await fast;
 assert.equal(deepController.signal.aborted,false);
 assert.equal(controllers.find(c=>c.model==='review-model').signal.aborted,true);
 finishDeep();assert.equal((await deep).model,'deep-model');
});

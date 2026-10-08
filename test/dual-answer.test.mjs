import test from 'node:test';
import assert from 'node:assert/strict';
import {AnswerLanes} from '../public/answer-lanes.mjs';
import {QuestionStore} from '../public/logic.mjs';
import {CodexBridge} from '../bridge.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('slow deep answer does not block fast answers or translation; its own questions stay ordered',async()=>{
 const lanes=new AnswerLanes(),gate=deferred(),started=deferred(),events=[];
 const a=lanes.enqueue('secondary','q1',async()=>{events.push('a1');started.resolve();await gate.promise;events.push('a1 done');});
 await started.promise;
 const a2=lanes.enqueue('secondary','q2',()=>events.push('a2'));
 await Promise.all([lanes.enqueue('fast','q2',()=>events.push('fast q2')),lanes.enqueue('translation','q2',()=>events.push('Chinese q2'))]);
 assert.deepEqual(events,['a1','fast q2','Chinese q2']);
 gate.resolve();await Promise.all([a,a2]);assert.deepEqual(events.slice(-2),['a1 done','a2']);
});
test('cancelling one question cancels its queued companion without losing the next',async()=>{
 const lanes=new AnswerLanes(),gate=deferred(),started=deferred();let ran=false;
 const first=lanes.enqueue('secondary','old',async()=>{started.resolve();await gate.promise;});await started.promise;
 const cancelled=lanes.enqueue('secondary','cancel',()=>{ran=true;});
 const rejected=assert.rejects(cancelled,{name:'AbortError'});lanes.cancel('cancel');
 const next=lanes.enqueue('secondary','next',()=>42);gate.resolve();await first;await rejected;
 assert.equal(ran,false);assert.equal(await next,42);assert.equal(lanes.tasks.size,0);
});
test('failed deep answer request releases its lane for the next question',async()=>{
 const lanes=new AnswerLanes();await assert.rejects(lanes.enqueue('secondary','q1',()=>{throw Error('offline');}));
 assert.equal(await lanes.enqueue('secondary','q2',()=>true),true);
});
test('auto-follow waits until both answers finish then starts reading hold',()=>{
 const s=new QuestionStore(),q1=s.add('first'),q2=s.add('second'),j=s.next();
 j.a.secondary={state:'running'};s.finish(q1.id,j.a.id);s.tick(100,6000);s.tick(20000,6000);assert.equal(s.selected,q1.id);
 j.a.secondary.state='done';s.tick(21000,6000);s.tick(26000,6000);assert.equal(s.selected,q1.id);s.tick(27001,6000);assert.equal(s.selected,q2.id);
});
test('question translation has a separate session and language policy from English answers',async()=>{
 const b=Object.create(CodexBridge.prototype),calls=[];b.ready=Promise.resolve();b.sessions=new Map();b.models=[{id:'fast',effort:'none',efforts:['none'],fast:true}];b.reference={context:'reference'};b.cwd='/tmp';
 b.rpc=async(method,p)=>{calls.push(p);return {thread:{id:String(calls.length)},model:p.model};};
 const answer=await b.session('fast','same'),translation=await b.session('fast','same',undefined,'translation');
 assert.notEqual(answer.id,translation.id);assert.equal((await b.session('fast','same')).id,answer.id);
 assert.match(calls[0].developerInstructions,/Only return the English answer/);
 assert.match(calls[1].developerInstructions,/Simplified Chinese translation/);
 assert.doesNotMatch(calls[1].baseInstructions,/REFERENCE:/);
});
test('deep model keeps its own reasoning default and session even when also requested for speed',async()=>{
 const b=Object.create(CodexBridge.prototype),calls=[];b.ready=Promise.resolve();b.sessions=new Map();
 b.models=[{id:'quality-model',effort:'low',defaultEffort:'medium',efforts:['low','medium']}];b.reference={context:'reference'};b.cwd='/tmp';
 b.rpc=async(method,p)=>{calls.push(p);return {thread:{id:String(calls.length)},model:p.model};};
 const fast=await b.session('quality-model','q'),deep=await b.session('quality-model','q:secondary');
 assert.notEqual(fast.id,deep.id);assert.equal(fast.effort,'low');assert.equal(deep.effort,'medium');
 assert.equal(calls[1].config.model_reasoning_effort,'medium');
});

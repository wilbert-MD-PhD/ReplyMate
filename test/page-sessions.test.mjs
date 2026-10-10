import test from 'node:test';
import assert from 'node:assert/strict';
import {PageSessions} from '../src/page-sessions.mjs';
import {CodexBridge} from '../src/bridge.mjs';

function registry(){
 let time=0,id=0;const disposed=[];
 const pages=new PageSessions({create:()=>({id:++id}),dispose:s=>disposed.push(s.id),busy:s=>!!s.busy,now:()=>time,idleMs:100});
 return {pages,disposed,tick:ms=>time+=ms};
}
test('startup is claimed once; closing the last page leaves no phantom warm-up',()=>{
 const {pages,disposed}=registry(),startup=pages.peek();
 const a=pages.get('a'),b=pages.get('b');assert.equal(a.session,startup);assert.notEqual(a.session,b.session);
 assert.equal(pages.get('a').created,false);
 assert.equal(pages.release('a'),true);assert.equal(pages.release('a'),false);
 assert.equal(pages.release('unknown'),false);assert.deepEqual(pages.live(),[b.session]);
 pages.release('b');assert.deepEqual(pages.live(),[]);assert.equal(pages.peek(),null);
 assert.deepEqual(disposed,[a.session.id,b.session.id]);
 assert.notEqual(pages.get('a').session,startup);
});
test('status heartbeats renew live pages while abandoned pages expire',()=>{
 const {pages,disposed,tick}=registry(),a=pages.get('a').session,b=pages.get('b').session;
 tick(60);assert.equal(pages.get('a').session,a);tick(40);
 assert.deepEqual(pages.live(),[a]);assert.deepEqual(disposed,[b.id]);
 assert.equal(pages.pages.has('b'),false);tick(60);pages.sweep();assert.deepEqual(disposed,[b.id,a.id]);
});
test('unclaimed startup expires without being retained by passive status reads',()=>{
 const {pages,disposed,tick}=registry(),startup=pages.peek();tick(100);
 assert.equal(pages.peek(),null);assert.deepEqual(disposed,[startup.id]);
 assert.notEqual(pages.get('first').session,startup);
});
test('idle cleanup preserves an in-flight answer but excludes it from new warm-ups',()=>{
 const {pages,disposed,tick}=registry(),session=pages.get('a').session;
 session.busy=true;tick(100);assert.deepEqual(pages.live(),[]);assert.deepEqual(disposed,[]);
 assert.equal(pages.get('a').session,session);assert.deepEqual(pages.live(),[session]);
 tick(100);session.busy=false;pages.sweep();assert.deepEqual(disposed,[session.id]);
});
test('explicit close disposes busy sessions and releases only their model lanes',()=>{
 const {pages,disposed}=registry(),session=pages.get('a').session;session.busy=true;
 pages.release('a');assert.deepEqual(disposed,[session.id]);
 const bridge=Object.create(CodexBridge.prototype);
 bridge.sessions=new Map(['page:model','page:secondary:model','page:translation:model','page-other:model'].map(k=>[k,{}]));
 bridge.releaseClient('page');assert.deepEqual([...bridge.sessions.keys()],['page-other:model']);
});
test('closing a page cancels warm-up and prevents queued generation after thread creation',async()=>{
 const bridge=Object.create(CodexBridge.prototype),controller=new AbortController();let release,runs=0;
 bridge.session=()=>new Promise(resolve=>release=resolve);bridge.answer=async()=>{runs++;};
 const pending=bridge.prime('model','page','answer',controller.signal);
 controller.abort();release({});await assert.rejects(pending,{name:'AbortError'});assert.equal(runs,0);
 await assert.rejects(bridge.prime('model','page','answer',controller.signal),{name:'AbortError'});
 const live=new AbortController();bridge.session=async()=>({});
 bridge.answer=async(_params,_delta,signal)=>{assert.equal(signal,live.signal);runs++;};
 await bridge.prime('model','page','answer',live.signal);assert.equal(runs,1);
});

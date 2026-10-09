import test from 'node:test';
import assert from 'node:assert/strict';
import {LibrarySync} from '../public/library-sync.mjs';
import {findPrepared} from '../public/prepared.mjs';
const question='What is the purpose of this project?';
const snapshot=(version,answer)=>({version,customLibrary:true,sources:[{id:version,name:version+'.txt'}],faq:answer?[{id:version,question,answer,aliases:[],reviewed:true,sourceIds:[version],referenceVersion:version}]:[]});
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};

test('a version change invalidates old prepared answers before loading the replacement snapshot',async()=>{
 const changes=[],replacement=deferred();let calls=0;
 const library=new LibrarySync({load:()=>++calls===1?snapshot('old','Old project answer'):replacement.promise,onChange:value=>changes.push(value?.version||null)});
 await library.refresh('old');assert.equal(findPrepared(library.snapshot.index,question).answer,'Old project answer');
 const pending=library.refresh('new');assert.equal(library.snapshot,null);
 assert.equal(library.refresh('new'),pending,'same-version callers share the request');
 replacement.resolve(snapshot('new','New project answer'));await pending;
 assert.equal(findPrepared(library.snapshot.index,question).answer,'New project answer');
 assert.equal(library.snapshot.sources[0].name,'new.txt');
 await library.refresh('new');assert.equal(calls,2,'unchanged status polls do not reload the library');
 assert.deepEqual(changes,[null,'old',null,'new']);
});

test('answer preflight detects imports before the next status poll, including an empty FAQ',async()=>{
 let current=snapshot('old','Old project answer');
 const library=new LibrarySync({load:async()=>current});
 await library.refresh('old');current=snapshot('new');
 await library.refresh();assert.equal(library.snapshot.version,'new');
 assert.equal(findPrepared(library.snapshot.index,question),null);
 assert.deepEqual(library.snapshot.faq,[]);
});

test('a delayed older snapshot cannot restore stale prepared answers after a newer refresh',async()=>{
 const older=deferred(),newer=deferred();let calls=0;
 const library=new LibrarySync({load:()=>++calls===1?older.promise:newer.promise});
 const first=library.refresh('old');await Promise.resolve();
 const second=library.refresh('new');await Promise.resolve();
 newer.resolve(snapshot('new','New project answer'));await second;
 older.resolve(snapshot('old','Old project answer'));await first;
 assert.equal(library.snapshot.version,'new');assert.equal(findPrepared(library.snapshot.index,question).answer,'New project answer');
});

test('a failed refresh disables cached answers and remains retryable',async()=>{
 let fail=false;
 const library=new LibrarySync({load:async()=>{if(fail)throw Error('connection lost');return snapshot('old','Old project answer');}});
 await library.refresh('old');fail=true;
 await assert.rejects(library.refresh(),/connection lost/);assert.equal(library.snapshot,null);
 fail=false;await library.refresh('old');assert.equal(library.snapshot.version,'old');
});

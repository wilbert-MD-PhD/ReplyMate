import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionFetch,setSessionToken} from '../public/session-fetch.mjs';
test('session recovery retries only rejected requests and never repeats accepted generation',async()=>{
 const original=globalThis.fetch,calls=[];setSessionToken('old');
 try{
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(url==='/api/session')return Response.json({token:'new'});return opts.headers['X-Session-Token']==='old'?Response.json({}, {status:403}):new Response('accepted');};
  const response=await sessionFetch('/api/answer',{method:'POST',body:'question'});assert.equal(await response.text(),'accepted');assert.equal(calls.length,3);assert.equal(calls[2].opts.headers['X-Session-Token'],'new');
  calls.length=0;await sessionFetch('/api/answer',{method:'POST',body:'next'});assert.equal(calls.length,1);
 }finally{globalThis.fetch=original;}
});

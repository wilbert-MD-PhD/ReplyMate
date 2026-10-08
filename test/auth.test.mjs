import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {CodexBridge} from '../src/bridge.mjs';
import {isLoginURL} from '../src/auth-url.mjs';
function bridge(rpc){const b=new EventEmitter();Object.setPrototypeOf(b,CodexBridge.prototype);Object.assign(b,{connected:Promise.resolve(),rpc,models:[],account:null,sessions:new Map(),pending:new Map()});return b;}
test('login URLs are limited to official HTTPS destinations',()=>{
 for(const url of ['https://auth.openai.com/authorize?state=x','https://chatgpt.com/auth'])assert.equal(isLoginURL(url),true);
 for(const url of ['https://auth.openai.com.evil.test/','https://evil.test/','http://auth.openai.com/','file:///etc/passwd','https://user:pass@auth.openai.com/','https://auth.openai.com:9443/','javascript:alert(1)'])assert.equal(isLoginURL(url),false);
});
test('clean first run needs no login and loads no model until authorized',async()=>{
 let account=null;const calls=[];
 const b=bridge(async(method)=>{calls.push(method);if(method==='account/read')return {account};if(method==='model/list')return {data:[{model:'test-model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'}]}]};});
 assert.deepEqual(await b.refreshAccount(),[]);assert.deepEqual(calls,['account/read']);
 account={type:'chatgpt'};assert.equal((await b.refreshAccount())[0].id,'test-model');
 await b.refreshAccount();assert.equal(calls.filter(x=>x==='model/list').length,1);
 account=null;b.sessions.set('old',{});await b.refreshAccount();assert.equal(b.sessions.size,0);assert.deepEqual(b.models,[]);
});
test('login is reusable while pending and can cancel, finish or log out',async()=>{
 const calls=[];const b=bridge(async(method,params)=>{calls.push({method,params});return method==='account/login/start'?{loginId:'one',authUrl:'https://auth.openai.com/authorize'}:{};});
 const first=await b.startLogin();assert.equal(await b.startLogin(),first);assert.equal(calls.length,1);
 await b.cancelLogin();assert.equal(b.login,null);assert.equal(calls.at(-1).params.loginId,'one');
 await b.startLogin();b.receive({method:'account/login/completed',params:{success:false,error:'cancelled'}});assert.equal(b.login,null);assert.equal(b.loginError,'cancelled');
 b.account={type:'chatgpt'};b.models=[{id:'one'}];await b.logout();assert.equal(b.account,null);assert.deepEqual(b.models,[]);
});

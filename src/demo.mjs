import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {retrieve} from './core.mjs';
import {createPreparedIndex,findPrepared} from '../public/prepared.mjs';
export class DemoBridge extends EventEmitter{
 constructor(reference){super();this.reference=reference;this.index=createPreparedIndex(reference.faq);this.models=[{id:'demo',effort:'offline',hidden:false}];this.ready=Promise.resolve(this.models);}
 async prime(){return {model:'demo'};}
 async answer({question,task,verify},onDelta,signal){
  const hit=findPrepared(this.index,question);
  const text=task==='translation'?(hit?.questionZh||'离线演示不翻译未知问题；启用 Codex 后可自动翻译。'):
   '[Offline demo — no AI generation] '+(hit?.answer||('Reference excerpt: '+(retrieve(question,this.reference.chunks)[0]?.text||'No matching example was found. Import your notes and enable Codex for generated answers.')))+(verify?' This second panel is also a demonstration, not an independent review.':'');
  for(const part of text.match(/.{1,24}/gu)||[]){signal?.throwIfAborted();onDelta(part);await delay(12,undefined,{signal});}
  return {model:'demo',tier:'offline',effort:'offline',text};
 }
 close(){}
}

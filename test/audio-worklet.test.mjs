import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const code=fs.readFileSync(new URL('../public/pcm-worklet.js',import.meta.url),'utf8');
test('audio worklet survives actual buffer detachment and keeps emitting PCM after initial silence',()=>{
 const packets=[];let Processor;class AudioWorkletProcessor{constructor(){this.port={postMessage:(data,transfer)=>{packets.push(structuredClone(data,{transfer}));}};}}
 vm.runInNewContext(code,{AudioWorkletProcessor,sampleRate:48000,Float32Array,Math,registerProcessor:(name,type)=>{Processor=type;}});
 const processor=new Processor();for(let i=0;i<48000*3/128;i++)processor.process([[new Float32Array(128).fill(i<40?0:.05)]]);
 assert.equal(packets.length,30);assert.equal(packets[0].rms,0);assert.ok(packets.at(-1).rms>.049);assert.ok(packets.every(p=>p.pcm.length===4800));assert.equal(processor.data.length,4800);
});

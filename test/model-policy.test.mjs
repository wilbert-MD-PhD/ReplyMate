import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAnswerModels} from '../src/model-policy.mjs';
const catalog=[{id:'gpt-6.1-sol',isDefault:true},{id:'gpt-6-astra'},{id:'gpt-6-sol'},{id:'gpt-6-luna'}];
test('default fast lane races distinct models and reserves Astra for independent depth',()=>{
 const p=selectAnswerModels(catalog);
 assert.equal(p.fastSelection,'race');assert.equal(p.secondaryModel,'gpt-6-astra');
 assert.deepEqual(p.raceModels,['gpt-6.1-sol','gpt-6-sol']);assert.ok(!p.raceModels.includes(p.secondaryModel));
 assert.equal(selectAnswerModels([...catalog].reverse()).secondaryModel,'gpt-6-astra');
});
test('missing Astra remains explicit instead of silently copying the fast model',()=>{
 const p=selectAnswerModels(catalog.filter(m=>m.id!=='gpt-6-astra'));
 assert.equal(p.secondaryModel,'');assert.match(p.secondaryError,/gpt-6-astra/);assert.equal(p.fastSelection,'race');
});
test('explicit model choices are respected and a custom deep model is excluded from racing',()=>{
 const p=selectAnswerModels(catalog,{secondaryModel:'gpt-6-sol'});
 assert.equal(p.secondaryModel,'gpt-6-sol');assert.ok(!p.raceModels.includes('gpt-6-sol'));
 assert.equal(selectAnswerModels(catalog,{fastModel:'gpt-6-luna'}).fastSelection,'gpt-6-luna');
 assert.throws(()=>selectAnswerModels(catalog,{fastModel:'missing'}),/QA_FAST_MODEL/);
 assert.equal(selectAnswerModels(catalog,{secondaryModel:'missing'}).secondaryModel,'');
});
test('restricted catalogs and offline demo never claim to run a multi-model race',()=>{
 for(const models of [[catalog[0]],[catalog[0],catalog[1]],[catalog[1]],[{id:'demo'}]]){
  const p=selectAnswerModels(models);assert.notEqual(p.fastSelection,'race');assert.ok(p.fastModel);
 }
 const p=selectAnswerModels([{id:'demo'}]);assert.equal(p.secondaryModel,'demo');assert.deepEqual(p.raceModels,[]);
});

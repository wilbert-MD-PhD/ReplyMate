// Keep the quality lane separate from the fast race. Catalog order is not a quality ranking.
export const preferredDeepModel='gpt-6-astra';
export function selectAnswerModels(models,options={}){
 const available=models.filter(m=>!m.hidden),has=id=>available.some(m=>m.id===id);
 if(available.length===1&&available[0].id==='demo')return {fastModel:'demo',fastSelection:'demo',secondaryModel:'demo',secondaryError:'',raceModels:[]};
 const deep=options.secondaryModel||preferredDeepModel;
 const secondaryModel=has(deep)?deep:'';
 const secondaryError=secondaryModel?'':`深度模型 ${deep} 不在当前账号列表中，请在模型设置中选择。`;
 if(options.fastModel&&options.fastModel!=='race'&&!has(options.fastModel))throw Error('QA_FAST_MODEL 不在当前账号列表中');
 const pool=available.filter(m=>m.id!==deep);
 const first=options.fastModel&&options.fastModel!=='race'?options.fastModel:pool.find(m=>m.isDefault)?.id||pool[0]?.id||secondaryModel;
 // A single-model fallback is exposed in the UI; it is never labelled as a race.
 const raceModels=[...new Set([first,...pool.map(m=>m.id)])].filter(Boolean).filter(id=>id!==deep).slice(0,2);
 const fastModel=first||'';
 const fastSelection=options.fastModel&&options.fastModel!=='race'?fastModel:raceModels.length>1?'race':fastModel;
 return {fastModel,fastSelection,secondaryModel,secondaryError,raceModels};
}

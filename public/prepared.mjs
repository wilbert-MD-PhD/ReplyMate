// Only reviewed, exact phrasings can bypass live generation. Keep semantic punctuation.
export function normalizePreparedQuestion(text){
 let t=String(text||'').normalize('NFKC').toLocaleLowerCase().trim();
 for(let i=0;i<4;i++)t=t.replace(/^(?:thank you|thanks|okay|ok|so|well|my question is|i would like to ask)[,.:!\s]+/,'');
 if(!/[\p{L}\p{M}\p{N}]/u.test(t))return '';
 // Normalize typography and sentence endings, never signs, decimals or operators.
 return t.replace(/\u2212/g,'-').replace(/[’‘]/g,"'").replace(/[.!?。！？]+$/u,'').replace(/\s+/gu,' ').trim();
}
export function createPreparedIndex(entries){
 const index=new Map();
 for(const item of entries){
  if(!item.reviewed||!item.answer||!item.sourceIds?.length)continue;
  for(const q of [item.question,...item.aliases||[]]){
   const key=normalizePreparedQuestion(q);if(!key)continue;
   if(index.has(key)&&index.get(key).id!==item.id)throw Error('预设问法冲突：'+q);
   index.set(key,item);
  }
 }
 return index;
}
export const findPrepared=(index,question)=>index.get(normalizePreparedQuestion(question))||null;

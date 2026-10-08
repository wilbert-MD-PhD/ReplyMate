import {readFile} from 'node:fs/promises';
export const appVersion='2.5.0';
export const platform=process.platform+'-'+process.arch;
const base=new URL('./',import.meta.url);
export const languages=JSON.parse(await readFile(new URL('languages.json',base),'utf8'));
export async function loadCatalog(){
 const models=JSON.parse(await readFile(new URL('models.json',base),'utf8'));
 let generated=[];try{generated=JSON.parse(await readFile(new URL('catalog.generated.json',base),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const placeholders=[['codex-runtime','AI 回答'],['docs-office','Word 与 PowerPoint'],['docs-pdf','PDF 文字读取'],['whisper-runtime','本地语音识别引擎']].filter(([id])=>!generated.some(e=>e.id===id&&(e.platform===platform||e.platform==='any'))).map(([id,name])=>({id,name,kind:'runtime',platform,version:'待构建',dependencies:[],unavailable:'本平台组件尚未构建，请使用包含固定组件目录的发行版。'}));
 return [...generated.filter(e=>e.platform===platform||e.platform==='any'),...placeholders,...models];
}
export function languageAllowed(model,code){return languages.some(l=>l.code===code)&&(!model.englishOnly||code==='en')&&(code!=='yue'||model.supportsYue);}

import {access,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export class ComponentRequired extends Error{
 constructor(id){super('需要先安装'+({'codex-runtime':' AI 回答','docs-office':' Word 与 PowerPoint','docs-pdf':' PDF 文字读取','whisper-runtime':'本地语音识别引擎'}[id]||id)+'组件');this.code='COMPONENT_REQUIRED';this.component=id;}
}
export async function resolveRuntime(manager,id){const entry=manager.entry(id),record=manager.state.installed[id];if(!record)throw new ComponentRequired(id);manager.compatible(entry);const file=manager.entryPath(id);try{await access(file);}catch{const e=new Error('组件文件缺失，请在组件中心修复');e.code='COMPONENT_DAMAGED';e.component=id;throw e;}return file;}
export async function parserFor(manager,id){return import(pathToFileURL(await resolveRuntime(manager,id)).href+'?v='+manager.state.installed[id].version);}

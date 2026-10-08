import {createReadStream} from 'node:fs';
import {mkdir,stat,statfs,open,readFile,rm,rename,readdir,lstat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {unpack,safeRelative} from './archive.mjs';
import {readJSON,atomicJSON} from './settings.mjs';
import {appVersion,platform} from './catalog.mjs';
export async function sha256(file){const h=createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');}
const error=message=>new Error(message);
const semver=s=>s.split('.').reduce((n,x)=>n*1000+Number(x),0);
export class ComponentManager{
 constructor(dir,catalog,{selfTest=async()=>{},beforeSwitch=async()=>{},afterSwitch=async()=>{},fetcher=fetch}={}){Object.assign(this,{dir,catalog,selfTest,beforeSwitch,afterSwitch,fetcher});this.state={installed:{}};this.tasks=new Map();this.busy=false;this.closed=false;}
 async init(){await mkdir(this.dir,{recursive:true,mode:0o700});this.state=await readJSON(path.join(this.dir,'component-state.json'),{installed:{}});await mkdir(this.downloads,{recursive:true,mode:0o700});
  const saved=await readJSON(path.join(this.downloads,'tasks.json'),[]);for(const task of saved){if(!['done','cancelled'].includes(task.state)){task.state='paused';task.error='上次任务未完成，可继续或取消';}this.tasks.set(task.id,task);}return this;
 }
 get downloads(){return path.join(this.dir,'downloads');}
 entry(id){const e=this.catalog.find(e=>e.id===id);if(!e)throw error('未知组件');return e;}
 compatible(e){if(e.unavailable)throw error(e.unavailable);if(e.platform!=='any'&&e.platform!==platform)throw error('组件平台或架构不兼容');if(e.protocol!==1||semver(e.minApp)>semver(appVersion))throw error('请先更新主程序以使用此组件');if(e.nodeMin&&Number(process.versions.node.split('.')[0])<e.nodeMin)throw error('组件需要更新的 Node 运行时');if(!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<=0||!Number.isSafeInteger(e.unpackedBytes)||e.unpackedBytes<=0)throw error('组件目录缺少可信校验信息');safeRelative(e.id);safeRelative(e.entry);}
 directory(id,record=this.state.installed[id]){if(!record)return null;safeRelative(record.folder);return path.join(this.dir,this.entry(id).kind==='model'?'models':'components',id,record.folder);}
 entryPath(id){return path.join(this.directory(id),safeRelative(this.entry(id).entry));}
 installed(id){const r=this.state.installed[id],e=this.entry(id);return !!r&&r.sha256===e.sha256;}
 async snapshot(){
  const entries=[];for(const e of this.catalog){const r=this.state.installed[e.id];let state=r?'installed':'missing';if(r){try{await stat(this.entryPath(e.id));}catch{state='damaged';}}
   entries.push({...e,state,installedVersion:r?.version,installedBytes:r?.bytes||0,missingDependencies:(e.dependencies||[]).filter(id=>!this.state.installed[id])});}
  let cacheBytes=0;for(const n of await readdir(this.downloads))if(n.endsWith('.part'))cacheBytes+=(await stat(path.join(this.downloads,n))).size;
  return {entries,tasks:[...this.tasks.values()],busy:this.busy,cacheBytes,platform};
 }
 plan(id,{repair=false}={}){const result=[],seen=new Set();const visit=(key)=>{if(seen.has(key))return;seen.add(key);const e=this.entry(key);this.compatible(e);for(const d of e.dependencies||[])visit(d);if(!this.installed(key)||repair&&key===id)result.push(e);};visit(id);return {entries:result,downloadBytes:result.reduce((s,e)=>s+e.bytes,0),installedBytes:result.reduce((s,e)=>s+e.unpackedBytes,0)};}
 async saveTasks(){await atomicJSON(path.join(this.downloads,'tasks.json'),[...this.tasks.values()].slice(-40));}
 async lock(){if(this.busy)throw error('已有组件任务正在进行');const file=path.join(this.dir,'.component-install.lock');
  try{const h=await open(file,'wx',0o600);await h.writeFile(JSON.stringify({pid:process.pid}));await h.close();}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(await readFile(file,'utf8'));}catch{throw error('安装锁异常，请关闭其他实例后检查');}let alive=true;try{process.kill(owner.pid,0);}catch(x){if(x.code==='ESRCH')alive=false;}if(alive)throw error('另一实例正在管理组件');await rm(file);return this.lock();}
  try{this.state=await readJSON(path.join(this.dir,'component-state.json'),{installed:{}});}catch(e){await rm(file,{force:true});throw e;}
  this.busy=true;return async()=>{this.busy=false;await rm(file,{force:true});};
 }
 async start(id,options={}){const plan=this.plan(id,options),unlock=await this.lock();const task={id:randomUUID(),component:id,state:'queued',downloaded:0,total:plan.downloadBytes,items:plan.entries.map(e=>e.id),completed:[],created:Date.now()};this.tasks.set(task.id,task);void this.run(task,unlock).catch(e=>{task.state='error';task.error=e.message;});return task;}
 async resume(taskId){const task=this.tasks.get(taskId);if(!task||!['paused','error'].includes(task.state))throw error('此任务不可恢复');const unlock=await this.lock();task.error=null;void this.run(task,unlock).catch(e=>{task.state='error';task.error=e.message;});return task;}
 async run(task,unlock){const controller=new AbortController();this.controller=controller;this.current=task;task.intent=null;
  try{task.completed||=[];for(const id of task.items){if(task.completed.includes(id)&&this.installed(id))continue;controller.signal.throwIfAborted();const e=this.entry(id);this.compatible(e);task.current=id;await this.space(e);const file=await this.download(e,task,controller.signal);await this.installFile(e,file,task,controller.signal);task.completed.push(id);await this.saveTasks();}task.state='done';task.error=null;
  }catch(e){task.state=task.intent||'error';task.error=e.message;if(task.state==='cancelled')await this.removePartial(task);}finally{this.controller=null;this.current=null;try{await this.saveTasks();}finally{await unlock();}}
 }
 async space(e){const fs=await statfs(this.dir);let partial=0;try{partial=(await stat(this.partial(e))).size;}catch{}const required=Math.max(0,e.bytes-partial)+e.unpackedBytes+32_000_000;if(fs.bavail*fs.bsize<required)throw error('磁盘空间不足，需要额外 '+Math.ceil(required/1e6)+' MB（含下载、解包与余量）');}
 partial(e){return path.join(this.downloads,e.id+'-'+e.sha256.slice(0,16)+'.part');}
 async download(e,task,signal){
  const file=this.partial(e),metaFile=file+'.json';let offset=0;try{offset=(await stat(file)).size;}catch{}const meta=await readJSON(metaFile,{});
  if(offset===e.bytes&&await sha256(file)===e.sha256)return file;
  if(offset>e.bytes||meta.url!==e.url||meta.sha256!==e.sha256){offset=0;await rm(file,{force:true});}
  if(!e.url||new URL(e.url).protocol!=='https:')throw error('此组件尚未发布下载，请使用手动导入');
  task.state='downloading';task.downloaded=offset;task.total=e.bytes;await this.saveTasks();
  const headers=offset?{Range:`bytes=${offset}-`,...(meta.etag?{'If-Range':meta.etag}:{})}:{};
  const response=await this.fetcher(e.url,{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(600000)])});
  if(!response.ok)throw error('下载失败 HTTP '+response.status+'，可续传或手动导入');
  if(response.status===206){const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!match||Number(match[1])!==offset||Number(match[2])!==e.bytes-1||Number(match[3])!==e.bytes||meta.etag&&response.headers.get('etag')!==meta.etag)throw error('续传内容已变化，请取消后重新下载');}
  else if(response.status===200)offset=0;else throw error('下载响应无效');
  await atomicJSON(metaFile,{url:e.url,sha256:e.sha256,etag:response.headers.get('etag')});
  const handle=await open(file,offset?'a':'w',0o600);let received=offset;const start=Date.now();
  try{for await(const chunk of response.body){signal.throwIfAborted();received+=chunk.length;if(received>e.bytes)throw error('下载超过目录声明大小');await handle.write(chunk);task.downloaded=received;task.speed=Math.round((received-offset)*1000/Math.max(1,Date.now()-start));}}finally{await handle.close();}
  if(received!==e.bytes)throw error('下载未完成，可继续下载');return file;
 }
 async installFile(e,file,task,signal){task.state='verifying';task.speed=0;await this.saveTasks();if((await stat(file)).size!==e.bytes||await sha256(file)!==e.sha256)throw error('文件大小或 SHA-256 不匹配，请重新下载');signal.throwIfAborted();
  const parent=path.join(this.dir,e.kind==='model'?'models':'components',e.id),folder=e.version.slice(0,48)+'-'+randomUUID(),stage=path.join(parent,'.staging-'+folder),dest=path.join(parent,folder);await mkdir(stage,{recursive:true,mode:0o700});
  let switched=false,prepared=false;const previous=this.state.installed[e.id];
  try{task.state='extracting';if(e.format==='raw'){const input=await open(file,'r'),out=await open(path.join(stage,e.entry),'wx',0o600);try{for await(const c of input.createReadStream()){signal.throwIfAborted();await out.write(c);}}finally{await out.close();await input.close();}}
   else if(['tar.gz','tar.br'].includes(e.format))await unpack(file,stage,e.unpackedBytes,signal,e.format);else throw error('不支持的组件格式');
   task.state='checking';await this.selfTest(e,stage);signal.throwIfAborted();
   const manifest=[];let installedBytes=0;async function scan(dir,rel=''){for(const n of await readdir(dir)){const p=path.join(dir,n),s=await lstat(p);if(s.isSymbolicLink())throw error('组件包含链接');if(s.isDirectory())await scan(p,rel+n+'/');else {manifest.push({path:rel+n,sha256:await sha256(p)});installedBytes+=s.size;}}}await scan(stage);
   await this.beforeSwitch(e.id);prepared=true;await rename(stage,dest);this.state.installed[e.id]={version:e.version,sha256:e.sha256,folder,bytes:installedBytes,manifest,previous:previous?{...previous,previous:undefined}:null};
   switched=true;await atomicJSON(path.join(this.dir,'component-state.json'),this.state);
   await this.afterSwitch(e.id);task.state='installed';await rm(file,{force:true});await rm(file+'.json',{force:true});
  }catch(err){if(switched){if(previous)this.state.installed[e.id]=previous;else delete this.state.installed[e.id];await atomicJSON(path.join(this.dir,'component-state.json'),this.state);}if(prepared)await this.afterSwitch(e.id).catch(()=>{});await rm(dest,{recursive:true,force:true});throw err;
  }finally{await rm(stage,{recursive:true,force:true});}
 }
 async importFile(id,stream){const e=this.entry(id);this.compatible(e);const unlock=await this.lock(),task={id:randomUUID(),component:id,current:id,items:[id],state:'importing',downloaded:0,total:e.bytes,created:Date.now()};this.tasks.set(task.id,task);const controller=new AbortController();this.controller=controller;this.current=task;
  try{await this.space(e);const file=this.partial(e),h=await open(file,'w',0o600);try{for await(const c of stream){controller.signal.throwIfAborted();task.downloaded+=c.length;if(task.downloaded>e.bytes)throw error('导入文件大小不匹配');await h.write(c);}}finally{await h.close();}await this.installFile(e,file,task,controller.signal);task.state='done';return task;
  }catch(err){task.state='error';task.error=err.message;throw err;}finally{this.controller=null;this.current=null;try{await this.saveTasks();}finally{await unlock();}}
 }
 async control(id,action){const task=this.tasks.get(id);if(!task)throw error('任务不存在');if(action==='resume')return this.resume(id);if(!['pause','cancel'].includes(action))throw error('无效操作');
  if(task===this.current){if(task.state!=='downloading'&&task.state!=='queued')throw error('正在校验或切换组件，请稍候');task.intent=action==='pause'?'paused':'cancelled';this.controller.abort(error(action==='pause'?'下载已暂停':'下载已取消'));}
  else{if(action==='pause')throw error('任务未在下载');const unlock=await this.lock();try{task.state='cancelled';await this.removePartial(task);await this.saveTasks();}finally{await unlock();}}return task;
 }
 async removePartial(task){for(const id of task.items){const p=this.partial(this.entry(id));await rm(p,{force:true});await rm(p+'.json',{force:true});}}
 async verify(id){const unlock=await this.lock();try{const r=this.state.installed[id];if(!r)throw error('组件未安装');if(!r.manifest?.length)throw error('组件缺少校验清单，请修复');for(const f of r.manifest||[]){safeRelative(f.path);if(await sha256(path.join(this.directory(id),f.path))!==f.sha256)throw error('组件损坏，请修复');}await this.selfTest(this.entry(id),this.directory(id));return {ok:true};}finally{await unlock();}}
 async switchRecord(id,next){const previous=this.state.installed[id];await this.beforeSwitch(id);if(next)this.state.installed[id]=next;else delete this.state.installed[id];try{await atomicJSON(path.join(this.dir,'component-state.json'),this.state);await this.afterSwitch(id);}catch(e){if(previous)this.state.installed[id]=previous;else delete this.state.installed[id];try{await atomicJSON(path.join(this.dir,'component-state.json'),this.state);}catch{}await this.afterSwitch(id).catch(()=>{});throw e;}}
 async uninstall(id){const unlock=await this.lock();try{this.entry(id);const r=this.state.installed[id];if(!r)return;await this.switchRecord(id,null);await rm(path.dirname(this.directory(id,r)),{recursive:true,force:true});return {ok:true};}finally{await unlock();}}
 async rollback(id){const unlock=await this.lock();try{const r=this.state.installed[id],old=r?.previous;if(!old)throw error('没有可回滚版本');for(const f of old.manifest||[]){safeRelative(f.path);if(await sha256(path.join(this.directory(id,old),f.path))!==f.sha256)throw error('旧版本已损坏，不能回滚');}await this.selfTest(this.entry(id),this.directory(id,old));await this.switchRecord(id,old);return {ok:true};}finally{await unlock();}}
 async clearCache(){const unlock=await this.lock();try{let bytes=0;for(const n of await readdir(this.downloads)){if(!/\.part(?:\.json)?$/.test(n))continue;const p=path.join(this.downloads,n);bytes+=(await stat(p)).size;await rm(p);}return {bytes};}finally{await unlock();}}
 close(){this.closed=true;if(this.current){this.current.intent='paused';this.controller?.abort(error('程序退出，下载已暂停'));}}
}

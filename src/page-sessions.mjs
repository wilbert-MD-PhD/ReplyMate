// Status polling renews a page lease. Closed or abandoned pages must not be warmed.
export class PageSessions {
 constructor({create,dispose=()=>{},busy=()=>false,now=()=>Date.now(),idleMs=180000}){
  Object.assign(this,{create,dispose,busy,now,idleMs});
  this.pages=new Map();
  this.startup={session:create(),lastSeen:now()};
 }
 get(id){
  this.sweep();
  const key=String(id).slice(0,80);
  let entry=this.pages.get(key);const created=!entry;
  if(!entry){entry=this.startup||{session:this.create()};this.startup=null;this.pages.set(key,entry);}
  entry.lastSeen=this.now();return {session:entry.session,created};
 }
 release(id){
  const key=String(id).slice(0,80),entry=this.pages.get(key);
  if(!entry)return false;
  this.pages.delete(key);this.dispose(entry.session);return true;
 }
 sweep(){
  const expired=entry=>this.now()-entry.lastSeen>=this.idleMs&&!this.busy(entry.session);
  for(const [key,entry] of this.pages)if(expired(entry))this.release(key);
  if(this.startup&&expired(this.startup)){const {session}=this.startup;this.startup=null;this.dispose(session);}
 }
 live(){
  this.sweep();
  return [...(this.startup?[this.startup]:[]),...this.pages.values()]
   .filter(entry=>this.now()-entry.lastSeen<this.idleMs).map(entry=>entry.session);
 }
 peek(){return this.live()[0]||null;}
}

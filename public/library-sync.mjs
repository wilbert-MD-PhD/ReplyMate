import {createPreparedIndex} from './prepared.mjs';

// A snapshot keeps the FAQ and source list tied to the same library version.
export class LibrarySync {
 constructor({load,onChange=()=>{}}){this.load=load;this.onChange=onChange;this.snapshot=null;this.pending=null;this.generation=0;}
 invalidate(){this.snapshot=null;this.onChange(null);}
 refresh(expectedVersion){
  if(expectedVersion!==undefined&&this.snapshot?.version===expectedVersion)return Promise.resolve(this.snapshot);
  if(this.pending&&(expectedVersion===undefined||expectedVersion===this.pendingVersion))return this.pending;
  if(expectedVersion!==undefined)this.invalidate();
  const generation=++this.generation;this.pendingVersion=expectedVersion;
  const pending=Promise.resolve().then(()=>this.load()).then(data=>{
   if(generation!==this.generation)return this.pending||this.snapshot;
   if(!data||typeof data.version!=='string'||!Array.isArray(data.faq)||!Array.isArray(data.sources))throw Error('资料同步响应无效');
   const snapshot={...data,index:createPreparedIndex(data.faq)};
   const changed=this.snapshot?.version!==snapshot.version;this.snapshot=snapshot;
   if(changed)this.onChange(snapshot);return snapshot;
  }).catch(error=>{
   if(generation!==this.generation)return this.pending||this.snapshot;
   this.invalidate();throw error;
  }).finally(()=>{if(this.pending===pending)this.pending=null;});
  this.pending=pending;return pending;
 }
}

// One observable warm-up per page/configuration. Resets invalidate in-flight results.
export class Warmup{
 constructor(){this.state={state:'waiting',message:'启动后自动预热',completed:0,total:0};this.key=null;this.pending=null;this.generation=0;}
 reset(message='配置已更新，等待预热'){this.generation++;this.key=null;this.state={state:'waiting',message,completed:0,total:0};}
 async run(key,jobs,{enabled=true,message='请先安装 AI 组件并登录账号'}={}){
  if(!enabled){this.reset(message);return this.state;}
  const generation=this.generation;
  if(this.pending){if(this.key===key)return this.pending;await this.pending;if(generation!==this.generation)return this.state;return this.run(key,jobs,{enabled,message});}if(this.key===key&&this.state.state==='ready')return this.state;
  this.key=key;const state=this.state={state:'warming',message:'正在预热回答与翻译通道',startedAt:Date.now(),completed:0,total:jobs.length,errors:[]};
  this.pending=(async()=>{const results=await Promise.allSettled(jobs.map(async job=>{try{await job.run();}catch(e){state.errors.push(job.label+'：'+e.message);throw e;}finally{state.completed++;}}));const failed=results.filter(x=>x.status==='rejected').length;if(generation===this.generation)this.state={...state,state:failed?'error':'ready',message:failed?'部分通道预热失败，可点击重试':'预热完成，可以开始提问',finishedAt:Date.now()};return this.state;})().finally(()=>{this.pending=null;});return this.pending;
 }
}

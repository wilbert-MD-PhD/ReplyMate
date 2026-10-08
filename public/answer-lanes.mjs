// Each lane is serial, while fast answers, deep answers and translation run independently.
export class AnswerLanes {
 constructor(){this.tails=new Map();this.tasks=new Set();}
 enqueue(lane,key,run){
  const controller=new AbortController(),task={key,controller};this.tasks.add(task);
  const promise=(this.tails.get(lane)||Promise.resolve()).catch(()=>{}).then(()=>{
   if(controller.signal.aborted)throw new DOMException('已停止','AbortError');
   return run(controller.signal);
  }).finally(()=>this.tasks.delete(task));
  this.tails.set(lane,promise.catch(()=>{}));return promise;
 }
 cancel(key){for(const task of this.tasks)if(task.key===key)task.controller.abort();}
 cancelAll(){for(const task of this.tasks)task.controller.abort();}
}

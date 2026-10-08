class LevelProcessor extends AudioWorkletProcessor{
 constructor(){super();this.frameSize=Math.round(sampleRate/10);this.data=new Float32Array(this.frameSize);this.n=0;this.square=0;}
 process(inputs){const samples=inputs[0]?.[0];if(samples)for(const s of samples){this.data[this.n++]=s;this.square+=s*s;if(this.n===this.frameSize){const data=this.data,rms=Math.sqrt(this.square/this.n);this.data=new Float32Array(this.frameSize);this.n=0;this.square=0;this.port.postMessage({rms,pcm:data,rate:sampleRate},[data.buffer]);}}return true;}
}registerProcessor('level-processor',LevelProcessor);

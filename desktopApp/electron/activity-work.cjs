const {randomUUID}=require('node:crypto');
const {INACTIVITY_MS}=require('./capture-schedule.cjs');

// Presence only: timestamps and action receipts, never keys, text or mouse
// coordinates. The server remains authoritative for every timer transition.
class ActivityWork {
  constructor({now=()=>performance.now(),perform,onCommitted=()=>{},onError=()=>{},onSettled=()=>{}}){
    Object.assign(this,{now,perform,onCommitted,onError,onSettled});this.clear();
  }
  clear(){this.generation=(this.generation||0)+1;this.state=null;this.lastInputAt=this.now();this.inputVersion=0;this.pending=null;this.running=false;this.resumeRequested=false;this.retryAt=0;}
  update(state){
    if(!state?.enabled||!state.sessionId){if(this.state)this.clear();return;}
    const scope=`${state.workspaceId}:${state.userId}:${state.sessionId}`;
    if(this.state?.scope!==scope){this.clear();this.state={...state,scope};}
    else this.state={...state,scope};
  }
  input(){
    this.lastInputAt=this.now();this.inputVersion++;
    if(this.pending?.action==='pause')this.resumeRequested=true;
    if(this.state?.status==='PAUSED'&&this.state.canResume&&!this.pending){this.resumeRequested=true;this.tick();}
  }
  pollIdle(seconds){
    if(!Number.isFinite(seconds)||seconds<0||!this.state)return;
    // OS idle time has whole-second precision. Use its lower bound so the
    // click that initiated a manual break cannot itself resume that break.
    const inputAt=this.now()-seconds*1000-1000;
    if(inputAt>this.lastInputAt){this.lastInputAt=inputAt;this.inputVersion++;if(this.state.status==='PAUSED'&&inputAt>this.state.observedAt)this.resumeRequested=true;}
  }
  tick(){
    const state=this.state;if(!state||this.running||this.now()<this.retryAt)return;
    if(this.pending){
      if(this.pending.action==='pause'&&!state.canPause||this.pending.action==='resume'&&!state.canResume)return;
    }else{
      const action=state.status==='RUNNING'&&state.canPause&&this.now()-this.lastInputAt>=INACTIVITY_MS?'pause':state.status==='PAUSED'&&state.canResume&&this.resumeRequested?'resume':null;
      if(!action)return;
      this.pending={action,operationId:randomUUID(),sessionId:state.sessionId,expectedRevision:state.revision,...(action==='pause'?{idleSeconds:Math.floor((this.now()-this.lastInputAt)/1000)}:{})};
      this.resumeRequested=false;
    }
    const operation=this.pending,generation=this.generation;
    this.running=true;
    Promise.resolve().then(()=>this.perform(operation)).then(async receipt=>{
      if(generation!==this.generation)return;
      this.pending=null;this.retryAt=0;
      await this.onCommitted(receipt,operation);
    }).catch(error=>{
      if(generation!==this.generation)return;
      // Keep ambiguous network/server failures idempotent. Do not create new
      // operations on each input event or replay an old pause into a new day.
      if(error.status&&error.status<500&&error.status!==429)this.pending=null;
      this.retryAt=this.now()+Math.max(5000,error.retryAfterMs||0);
      this.onError(error);
    }).finally(()=>{if(generation===this.generation){this.running=false;this.onSettled();if(this.resumeRequested&&!this.pending)this.tick();}});
  }
}
module.exports={ActivityWork};

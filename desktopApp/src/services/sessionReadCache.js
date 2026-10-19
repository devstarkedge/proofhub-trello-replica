// In-memory, identity-scoped reads. A route subscription never owns the data.
export function createSessionReadCache({field,read,merge=(old,next)=>next}) {
  const empty=Object.freeze({[field]:null,error:'',loading:false,stale:false,updatedAt:0});
  let snapshot=empty,flight=null,epoch=0,queued=false,failures=0,retryAt=0;
  const listeners=new Set();
  const publish=next=>{snapshot=next;for(const listener of listeners)listener();};
  const cache={
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    apply(result){
      const value=merge(snapshot[field],result);if(!value)return false;
      const now=performance.now();epoch++;
      failures=0;retryAt=0;
      publish({[field]:{...value,receivedAt:now,unconfirmedAt:null},error:'',loading:false,stale:false,updatedAt:now});return true;
    },
    clear(){epoch++;queued=false;failures=0;retryAt=0;publish(empty);},
    invalidate(){epoch++;queued=Boolean(flight);publish({...snapshot,stale:true});},
    disconnected(message='Connection interrupted. Showing last confirmed session state until reconnect.'){
      epoch++;queued=false;publish({...snapshot,[field]:snapshot[field]?{...snapshot[field],unconfirmedAt:performance.now()}:null,loading:false,stale:true,error:message});
    },
    ensure(){return performance.now()<retryAt?Promise.resolve(snapshot[field]):!snapshot[field]||snapshot.stale||performance.now()-snapshot.updatedAt>=30000?cache.reload():Promise.resolve(snapshot[field]);},
    reload(){
      if(flight)return flight;
      const generation=epoch;publish({...snapshot,loading:true});
      let request;try{request=read();}catch(error){request=Promise.reject(error);}
      flight=Promise.resolve(request).then(result=>{if(generation===epoch&&!cache.apply(result)&&!snapshot[field])publish({...empty,error:'Session could not be verified. Retry or sign in again.',stale:true});return result;}).catch(error=>{
        if(generation!==epoch)return;
        if([401,403,404].includes(error.response?.status)){epoch++;retryAt=performance.now()+60000;publish({...empty,error:'Session access changed. Reconnect or sign in again.'});}
        else {failures++;retryAt=performance.now()+Math.min(60000,1000*2**Math.min(failures,6));publish({...snapshot,[field]:snapshot[field]?{...snapshot[field],unconfirmedAt:performance.now()}:null,error:error.response?.data?.message||'Could not refresh. Showing last confirmed session state.',loading:false,stale:true});}
      }).finally(()=>{
        flight=null;if(snapshot.loading)publish({...snapshot,loading:false});
        if(queued){queued=false;cache.reload();}
      });return flight;
    }
  };return cache;
}
export function sessionCutoffReached(value,cutoff){
  if(!cutoff)return false;
  const now=value?.serverNow?+new Date(value.serverNow)+Math.max(0,performance.now()-(value.receivedAt??performance.now())):Date.now();
  return now>=+new Date(cutoff);
}

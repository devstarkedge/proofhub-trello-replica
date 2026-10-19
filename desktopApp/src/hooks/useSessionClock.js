import {useSyncExternalStore} from 'react';
const listeners=new Set();let now=performance.now(),timer;
function subscribe(listener){
  listeners.add(listener);
  if(!timer){now=performance.now();timer=setInterval(()=>{now=performance.now();for(const notify of listeners)notify();},1000);}
  return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=null;}};
}
export default function useSessionClock(){return useSyncExternalStore(subscribe,()=>now);}

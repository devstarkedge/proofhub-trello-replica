import {useEffect,useSyncExternalStore} from 'react';
import useSessionSynchronization from './useSessionSynchronization';
import {workSelectionStore} from '../services/workSelectionState';
export default function useWorkSelectionData(key,enabled=true){
  const {scope}=useSessionSynchronization(),store=workSelectionStore(scope,key);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
  useEffect(()=>{if(enabled)store.ensure();},[store,enabled,snapshot.stale]);
  return {...snapshot,store,scope};
}

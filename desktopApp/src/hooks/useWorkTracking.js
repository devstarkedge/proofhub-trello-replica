import {useSyncExternalStore} from 'react';
import {trackingStore} from '../services/trackingState';
import useSessionSynchronization from './useSessionSynchronization';
import {sessionCutoffReached} from '../services/sessionReadCache';
export default function useWorkTracking(){
  const {scope,workspaceId}=useSessionSynchronization(),store=trackingStore(scope,workspaceId);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
  return {...snapshot,expired:sessionCutoffReached(snapshot.state,snapshot.state?.attendance?.cutoffAt),reload:store.reload,store};
}

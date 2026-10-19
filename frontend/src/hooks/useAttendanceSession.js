import {useSyncExternalStore} from 'react';
import useSessionSynchronization from './useSessionSynchronization';
import {attendanceStore} from '../services/attendanceState';
import {sessionCutoffReached} from '../services/sessionReadCache';
export default function useAttendanceSession(){
  const {scope,workspaceId}=useSessionSynchronization(),store=attendanceStore(scope,workspaceId);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
  return {...snapshot,expired:sessionCutoffReached(snapshot.status,snapshot.status?.activeSession?.missedCheckoutCutoffAt),scope,workspaceId,store,reload:store.reload};
}

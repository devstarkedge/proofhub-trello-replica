import { useEffect, useState } from 'react';
import queue from '../../services/movementPersistence';
export default function MovementSyncStatus({boardId}) {
  const [state,setState]=useState({pending:0,errors:[]});
  useEffect(()=>{
    let live=true;
    const refresh=async()=>{try{const [pending,errors]=await Promise.all([queue.pending(boardId),queue.failures(boardId)]);if(live)setState({pending:pending.length,errors});}catch{/* Storage failure is reported by the initiating action. */}};
    void refresh();const handler=()=>{void refresh();};window.addEventListener('flowtask:movement-status',handler);
    return()=>{live=false;window.removeEventListener('flowtask:movement-status',handler);};
  },[boardId]);
  if(!state.pending&&!state.errors.length)return null;
  return <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-2rem)] rounded-lg border border-white/20 bg-gray-900/95 px-3 py-2 text-sm text-white shadow-lg" role="status" aria-live="polite">
    {state.pending>0&&<span>{state.pending} card {state.pending===1?'move is':'moves are'} waiting to sync. You can keep working.</span>}
    {state.errors.length>0&&<span className="flex items-center justify-between gap-3">{state.errors.at(-1).error || 'A card move could not be saved. Refresh the board and try again.'}<button className="underline shrink-0" onClick={()=>queue.dismissFailures(boardId)}>Dismiss</button></span>}
  </div>;
}

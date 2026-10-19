const records=new Map(),listeners=new Set(),pending=new Map();
const idle=Object.freeze({phase:'IDLE',action:'',operationId:null,error:''});
const storageKey=scope=>`flowtask-action:${scope}`;
export const subscribeActions=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function actionSnapshot(scope){
  if(!records.has(scope))try{const saved=JSON.parse(sessionStorage.getItem(storageKey(scope)));if(saved?.operationId)records.set(scope,{...saved,phase:'RECONCILIATION_REQUIRED',error:'Verify the previous action before making another change.'});}catch{/* memory guard remains available */}
  return records.get(scope)||idle;
}
function publish(scope,value){records.set(scope,value);try{if(['PENDING','RECONCILIATION_REQUIRED'].includes(value.phase))sessionStorage.setItem(storageKey(scope),JSON.stringify(value));else sessionStorage.removeItem(storageKey(scope));}catch{/* memory guard remains available */}for(const listener of listeners)listener();}
export const actionBusy=value=>['PENDING','RECONCILIATION_REQUIRED'].includes(value.phase);
export async function recoverSessionAction(scope,read,onConfirmed){
  if(pending.has(scope))return pending.get(scope);
  const saved=actionSnapshot(scope);if(!actionBusy(saved))return null;
  const task=(async()=>{try{const result=await read(saved);if(result?.committed){onConfirmed?.(result,saved);publish(scope,{...saved,phase:'CONFIRMED',error:''});return result;}
    publish(scope,{...saved,phase:'RECONCILIATION_REQUIRED',error:'The action is not confirmed. Retry the same operation safely.'});return null;
  }catch{publish(scope,{...saved,phase:'RECONCILIATION_REQUIRED',error:'Reconnect to verify the last action before changing work.'});return null;}finally{pending.delete(scope);}})();pending.set(scope,task);return task;
}
export async function performSessionAction(scope,descriptor,send,{read,onConfirmed}={}){
  const existing=actionSnapshot(scope);
  if(pending.has(scope)||existing.phase==='PENDING')throw new Error('Another attendance or work action is in progress.');
  if(existing.phase==='RECONCILIATION_REQUIRED'&&existing.operationId!==descriptor.operationId)throw new Error('Verify or retry the previous action first.');
  if(existing.phase==='RECONCILIATION_REQUIRED'&&JSON.stringify(existing.payload)!==JSON.stringify(descriptor.payload))throw new Error('The interrupted action must retain its original selection. Use Retry safely before making another change.');
  const value={...descriptor,phase:'PENDING',error:''};publish(scope,value);
  const execute=async()=>{try{
    if(existing.phase==='RECONCILIATION_REQUIRED'){
      let receipt;
      try{receipt=await read(existing);}catch{throw new Error('Reconnect to verify the interrupted action before retrying.');}
      if(receipt?.committed){onConfirmed?.(receipt,existing);publish(scope,{...value,phase:'CONFIRMED',error:''});return receipt;}
      if(receipt?.committed!==false)throw new Error('Reconnect to verify the interrupted action before retrying.');
    }
    const result=await send(value);onConfirmed?.(result,value);publish(scope,{...value,phase:'CONFIRMED',error:''});return result;
  }catch(error){const status=error.response?.status;
    if(!status||status>=500){try{const result=await read(value);if(result?.committed){onConfirmed?.(result,value);publish(scope,{...value,phase:'CONFIRMED',error:''});return result;}}catch{/* preserve uncertainty */}
      publish(scope,{...value,phase:'RECONCILIATION_REQUIRED',error:'The response was interrupted. Verify or retry this same action before changing work.'});
    }else publish(scope,{...value,phase:'FAILED',error:error.response?.data?.message||error.message});throw error;
  }};
  const task=(async()=>{try{return await (globalThis.navigator?.locks?navigator.locks.request(`flowtask-session:${scope}`,{ifAvailable:true},lock=>{if(!lock){const error=new Error('Another tab is changing this session.');error.response={status:409};throw error;}return execute();}):execute());}
    catch(error){if(actionSnapshot(scope).phase==='PENDING')publish(scope,{...value,phase:'FAILED',error:error.message});throw error;}finally{pending.delete(scope);}})();pending.set(scope,task);return task;
}

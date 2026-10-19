import {getWorkOptions,getAgendas} from './trackingApi';
import {createSessionReadCache} from './sessionReadCache';
import {registerResettable} from '../store/resetRegistry';

const scopes=new Map();
const unique=items=>[...new Map(items.map(item=>[String(item._id),item])).values()];
export function workSelectionStore(scope,key='ASSIGNED') {
  let entries=scopes.get(scope);if(!entries){entries=new Map();scopes.set(scope,entries);}
  if(entries.has(key))return entries.get(key);
  if(entries.size>=24)for(const [oldKey,oldStore]of entries){if(oldKey.startsWith('project:')&&!oldStore.observers){oldStore.clear();entries.delete(oldKey);break;}}
  const workspaceId=scope.split(':')[0],userId=scope.split(':').at(-1);
  const read=async(page={})=>{
    if(localStorage.getItem('workspaceId')!==workspaceId)throw new DOMException('Workspace changed','AbortError');
    const primary=entries.get('ASSIGNED'),initial=primary?.getSnapshot();
    if(key.startsWith('project:')&&!Object.keys(page).length&&initial?.loading&&initial.value?.projectId===key.slice(8)){
      await primary.ensure();const cached=entries.get(key)?.getSnapshot();
      if(cached?.value&&!cached.stale)return cached.value;
    }
    const value=key==='agendas'?{agendas:await getAgendas()}:await getWorkOptions(key.startsWith('project:')?key.slice(8):undefined,undefined,{mode:key,...page});
    if(value.workspaceId&&String(value.workspaceId)!==workspaceId||value.userId&&String(value.userId)!==userId)throw new DOMException('Selection identity changed','AbortError');
    return value;
  };
  const store=createSessionReadCache({field:'value',read});
  store.observers=0;const subscribe=store.subscribe;
  store.subscribe=listener=>{store.observers++;const release=subscribe(listener);return()=>{store.observers--;release();};};
  const apply=store.apply;
  store.apply=value=>{
    const accepted=apply(value);
    if(accepted&&value.projectId&&!key.startsWith('project:'))workSelectionStore(scope,`project:${value.projectId}`).apply(value);
    return accepted;
  };
  let more=null;
  store.loadMore=()=>{
    if(more)return more;
    const old=store.getSnapshot().value,cursor=key.startsWith('project:')?old?.nextTaskCursor:old?.nextProjectCursor;
    if(!cursor||store.getSnapshot().stale||store.getSnapshot().loading)return Promise.resolve();
    const token=localStorage.getItem('token'),generation=old;
    more=read(key.startsWith('project:')?{taskCursor:cursor}:{cursor}).then(next=>{
      if(localStorage.getItem('token')!==token||store.getSnapshot().value!==generation)return;
      store.apply({...old,...next,projectId:old.projectId,tasks:key.startsWith('project:')?unique([...(old.tasks||[]),...(next.tasks||[])]):old.tasks,projects:unique([...(old.projects||[]),...(next.projects||[])])});
    }).finally(()=>{more=null;});return more;
  };
  entries.set(key,store);return store;
}
export function invalidateWorkSelections(scope,secure=false){
  for(const store of scopes.get(scope)?.values()||[]){if(secure)store.clear();store.invalidate();}
}
export function retainWorkSelectionPrefetch(scope,workspaceId,tracking){
  let timer,prepared=false;const active=()=>localStorage.getItem('workspaceId')===String(workspaceId)&&Boolean(localStorage.getItem('token'));
  const prefetch=()=>{if(!active())return;const state=tracking.getSnapshot().state;if(!state?.policy?.enabled||!state.canTrack)return;workSelectionStore(scope).ensure();workSelectionStore(scope,'agendas').ensure();};
  const changed=event=>{
    const {type='',payload={}}=event.detail||{};
    if(payload.workspaceId&&String(payload.workspaceId)!==String(workspaceId))return;
    const secure=/role|permission|department|membership|access|workspace.*updated/.test(type);
    if(!secure&&!/^(card-|task-|board-|project[-:]|tracking:policy|tracking:agenda)/.test(type))return;
    invalidateWorkSelections(scope,secure);clearTimeout(timer);timer=setTimeout(()=>{
      prefetch();const first=workSelectionStore(scope).getSnapshot().value?.projectId;
      for(const [key,store]of scopes.get(scope)||[])if(store.observers&&(key==='CREATE'||key.startsWith('project:')&&key!==`project:${first}`))store.ensure();
    },150);
  };
  const unsubscribe=tracking.subscribe(()=>{
    const state=tracking.getSnapshot().state;
    if(!state||!state.policy?.enabled||!state.canTrack){prepared=false;invalidateWorkSelections(scope,true);}else if(!prepared){prepared=true;prefetch();}
  });
  window.addEventListener('flowtask:realtime',changed);window.addEventListener('socket-connected',prefetch);window.addEventListener('online',prefetch);prefetch();
  return()=>{clearTimeout(timer);unsubscribe();window.removeEventListener('flowtask:realtime',changed);window.removeEventListener('socket-connected',prefetch);window.removeEventListener('online',prefetch);};
}
registerResettable(()=>{for(const scope of scopes.keys())invalidateWorkSelections(scope,true);});

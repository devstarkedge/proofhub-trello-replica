const id = value => String(value?._id || value || '');
const placement = new Set(['_id','list','position','status','__v','movementRevision']);
const localFields = new Set([...placement,'title','description','priority','dueDate','startDate','subtaskStats','coverImage']);

// Event-scoped invalidation: a move must not refresh every open card's comments,
// attachments, destinations and history. Unknown/gap events still reauthorize.
export function createRealtimeInvalidation({workspaceId,workflow,projects,client,notify,schedule=setTimeout,cancel=clearTimeout}) {
  let timer, projectTimer, disposed=false, workflowDirty=false, recovery=false;
  const boards=new Set(),cards=new Set(),types=new Set(),fields=new Set(),seen=new Map();
  function refreshProjects() {
    cancel(projectTimer);projectTimer=schedule(()=>{if(!disposed)void projects().fetchDepartments(true);},750);
  }
  function changed(event) {
    const {type,payload={}}=event.detail||{};
    if(payload.workspaceId && id(payload.workspaceId)!==id(workspaceId))return;
    const eventType=type==='notification'?payload.type:type;
    if(!/card|list|comment|subtask|attachment|task|board|project|department|assigned|access|authz|role|permission|recovery|data-changed/.test(eventType||''))return;
    const operation=payload.operationId && `${type}:${payload.operationId}`;
    if(operation && seen.has(operation))return;
    if(operation){seen.set(operation,Date.now());if(seen.size>256)seen.delete(seen.keys().next().value);}
    const state=workflow(),boardId=id(payload.boardId||payload.board),cardId=id(payload.cardId||payload.taskId||payload.card?._id);
    if(boardId)boards.add(boardId);if(cardId)cards.add(cardId);types.add(eventType);
    for(const field of Object.keys(payload.updates||{}))fields.add(field);
    const current=!boardId||boardId===id(state.currentProjectId);
    if(type==='board-updated'&&boardId&&payload.updates)projects().projectUpdated({_id:boardId,...payload.updates});
    if(type==='access-changed'&&current)state.reset();
    let applied=false;
    if(current&&type==='card-updated'&&state.cardsById[cardId]&&payload.updates){
      state.updateCardLocal(cardId,payload.updates);
      applied=Object.keys(payload.updates).every(field=>localFields.has(field));
    } else if(current&&type==='card-moved'&&state.cardsById[cardId]&&state.lists.some(list=>id(list._id)===id(payload.destinationListId))){
      const patch={list:id(payload.destinationListId),position:payload.newPosition};
      if(payload.status!==undefined)patch.status=payload.status;
      if(payload.revision!==undefined)patch.__v=payload.revision;
      state.updateCardLocal(cardId,patch);applied=true;
    } else if(current&&type==='card-deleted'&&cardId){state.removeCardFromSocket(cardId);applied=true;}
    if(/card|list|comment|subtask|attachment|task|board|data-changed/.test(eventType||'')){
      state.invalidateProjectCache(boardId||undefined);
      if(current&&!applied&&!/comment/.test(eventType))workflowDirty=true;
    }
    if(/card|task|subtask|board|project|department|assigned|access|authz|role|permission|data-changed/.test(eventType||''))refreshProjects();
    cancel(timer);timer=schedule(()=>{
      if(disposed)return;
      client.invalidateQueries({predicate:query=>['projects','project','cards','card','tasks','dashboard','workflow'].includes(query.queryKey[0])});
      notify({workspaceId,boardIds:[...boards],cardIds:[...cards],types:[...types],fields:[...fields],recovery});
      boards.clear();cards.clear();types.clear();fields.clear();recovery=false;
      const current=workflow();
      if(workflowDirty&&current.currentProjectId){workflowDirty=false;void current.initializeWorkflow(current.currentProjectId);}
    },150);
  }
  return {changed,recover(){recovery=true;workflowDirty=true;refreshProjects();changed({detail:{type:'recovery'}});},dispose(){disposed=true;cancel(timer);cancel(projectTimer);}};
}

export function cardRefreshPlan(detail, {workspaceId,boardId,cardId}) {
  if(detail?.workspaceId && id(detail.workspaceId)!==id(workspaceId))return null;
  if(!detail?.types || detail.recovery)return {card:true,comments:true,activities:true,lists:true,project:true};
  if(detail.boardIds?.length&&!detail.boardIds.includes(id(boardId)))return null;
  const broad=detail.types.some(type=>/board|list|assigned|access|authz|role|permission|department/.test(type));
  if(!broad&&detail.cardIds?.length&&!detail.cardIds.includes(id(cardId)))return null;
  if(!broad&&!detail.cardIds?.length)return null;
  const moving=detail.types.every(type=>['card-moved','card-updated'].includes(type)) && (detail.fields||[]).every(field=>placement.has(field));
  const comments=detail.types.some(type=>/comment/.test(type));
  return {card:!moving&&!detail.types.every(type=>/comment|list/.test(type)),comments,activities:!detail.types.every(type=>/list/.test(type)),lists:detail.types.some(type=>/list/.test(type)),project:detail.types.some(type=>/board-updated/.test(type))};
}

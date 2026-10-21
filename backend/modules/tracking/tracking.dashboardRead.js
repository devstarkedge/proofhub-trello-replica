import mongoose from 'mongoose';
import {WorkSession,ActivityInterval} from './tracking.models.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import {can} from './tracking.authorization.js';
const id=v=>String(v?._id||v||'');
const oid=v=>new mongoose.Types.ObjectId(id(v));
const literal=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function dashboardSegmentExpression(query){
  const tests=[];
  if(query.type)tests.push({$eq:['$$s.kind',query.type]});
  for(const [key,fields]of [['projectId',['project','attributedProject']],['taskId',['task','attributedTask','linkedTask']],['agendaId',['agenda']]])if(query[key])tests.push({$or:fields.map(field=>({$eq:[`$$s.${field}`,oid(query[key])]}))});
  if(query.linked==='true')tests.push({$eq:['$$s.attributionIncluded',true]});
  if(query.linked==='false')tests.push({$ne:[{$ifNull:['$$s.attributionIncluded',false]},true]});
  if(query.description)tests.push({$regexMatch:{input:{$ifNull:['$$s.description','']},regex:literal(query.description),options:'i'}});
  return tests.length?{$and:tests}:true;
}

export function dashboardReadPipeline({workspaceId,ctx,scope,owners,bounds,query,dates,now,policy}){
  const tenant=oid(workspaceId),viewer=oid(ctx.userId),otherOwners=owners.filter(owner=>id(owner)!==id(viewer));
  const projects=[...scope.projectMap.values()].filter(project=>can(ctx,'project.view',project)).map(project=>project._id);
  const projectGuard={segments:{$not:{$elemMatch:{$or:['project','attributedProject'].map(field=>({[field]:{$exists:true,$ne:null,$nin:projects}}))}}}};
  const branches=[];
  if(owners.some(owner=>id(owner)===id(viewer)))branches.push({user:viewer});
  const historyGroups=new Map();
  for(const owner of otherOwners){const history=scope.history(owner);if(history!==null&&!history.length)continue;const key=history===null?'all':[...history].sort().join(',');if(!historyGroups.has(key))historyGroups.set(key,{history,owners:[]});historyGroups.get(key).owners.push(oid(owner));}
  for(const group of historyGroups.values())branches.push({user:{$in:group.owners},...projectGuard,...(group.history===null?{}:{departmentIdsAtStart:{$in:group.history.map(oid)}})});
  const pipeline=[{$match:{...bounds,workspaceId:tenant,user:{$in:owners.map(oid)},$and:[{$or:branches.length?branches:[{_id:null}]}]}}];
  // A manager must never receive a session containing capture history from an
  // unauthorized department, including legacy captures without a snapshot.
  if(scope.viewerRole==='manager'&&otherOwners.length){
    const histories=otherOwners.map(owner=>({case:{$eq:['$user',oid(owner)]},then:scope.history(owner)?.map(oid)||[]}));
    pipeline.push({$set:{_history:{$switch:{branches:histories,default:[]}}}},{$lookup:{from:ActivityInterval.collection.name,let:{session:'$_id',history:'$_history'},pipeline:[
      {$match:{workspaceId:tenant,$expr:{$eq:['$session','$$session']}}},
      {$match:{$expr:{$eq:[{$size:{$setIntersection:[{$ifNull:['$departmentIdsAtCapture',[]]},'$$history']}},0]}}},{$limit:1},{$project:{_id:1}}
    ],as:'_foreignHistory'}},{$match:{$or:[{user:viewer},{'_foreignHistory.0':{$exists:false}}]}});
  }
  const end=new Date(Math.min(+now,+dates.end));
  pipeline.push({$lookup:{from:AttendanceSession.collection.name,let:{attendance:'$attendanceSession',owner:'$user'},pipeline:[{$match:{workspaceId:tenant,$expr:{$and:[{$eq:['$_id','$$attendance']},{$eq:['$user','$$owner']}]}}},{$project:{status:1,checkOutAt:1,missedCheckoutCutoffAt:1,reconciledAt:1}}],as:'_attendance'}},
    {$set:{_attendance:{$first:'$_attendance'}}},
    {$set:{_cutoff:{$min:[{$ifNull:['$endedAt',now]},{$ifNull:['$_attendance.checkOutAt',{$ifNull:['$_attendance.missedCheckoutCutoffAt',{$ifNull:['$_attendance.reconciledAt',now]}]}]},...(policy.enabled?[]:[{$literal:policy.disabledAt||now}])]}}},
    {$set:{_rangeEnd:{$min:['$_cutoff',end]},_viewStatus:{$cond:[{$and:[{$eq:[{$ifNull:['$endedAt',null]},null]},{$eq:['$_attendance.status','ACTIVE']},{$eq:[{$ifNull:['$_attendance.checkOutAt',null]},null]},{$gte:['$_cutoff',now]}]},'$status','CLOSED']}}},
    {$set:{_selected:{$filter:{input:{$ifNull:['$segments',[]]},as:'s',cond:{$and:[dashboardSegmentExpression(query),{$lt:['$$s.startedAt','$_rangeEnd']},{$gt:[{$ifNull:['$$s.endedAt','$_rangeEnd']},dates.start]}]}}}}},
    {$set:{_workSeconds:{$sum:{$map:{input:'$_selected',as:'s',in:{$max:[0,{$divide:[{$subtract:[{$min:[{$ifNull:['$$s.endedAt','$_rangeEnd']},'$_rangeEnd']},{$max:['$$s.startedAt',dates.start]}]},1000]}]}}}},_latest:{$arrayElemAt:['$_selected',-1]}}});
  return pipeline;
}

export async function readDashboardGroups(options){
  const pipeline=dashboardReadPipeline(options);
  if(options.filtered)pipeline.push({$match:{'_selected.0':{$exists:true}}});
  pipeline.push({$sort:{startedAt:-1,_id:-1}},{$group:{_id:'$user',workSeconds:{$sum:'$_workSeconds'},...(options.includeSessionIds?{sessionIds:{$push:'$_id'}}:{}),latest:{$first:{_id:'$_id',startedAt:'$startedAt',revision:'$revision',status:'$_viewStatus',personalPaused:{$anyElementTrue:{$map:{input:{$ifNull:['$pauses',[]]},as:'pause',in:{$eq:[{$ifNull:['$$pause.endedAt',null]},null]}}}},segment:'$_latest'}}}});
  return WorkSession.aggregate(pipeline).option({maxTimeMS:10000,allowDiskUse:true});
}

export async function readOfficeGroups(workspaceId,owners,dates,now){
  const resolved={$and:[{$ne:[{$ifNull:['$regularizationResolution.appliedAt',null]},null]},{$ne:[{$ifNull:['$regularizationResolution.checkInAt',null]},null]},{$ne:[{$ifNull:['$regularizationResolution.checkOutAt',null]},null]}]};
  return AttendanceSession.aggregate([
    {$match:{workspaceId:oid(workspaceId),user:{$in:owners.map(oid)},workDateKey:{$gte:dates.fromDate,$lte:dates.toDate}}},
    {$set:{_start:{$cond:[resolved,'$regularizationResolution.checkInAt','$checkInAt']},_end:{$cond:[resolved,'$regularizationResolution.checkOutAt',{$ifNull:['$checkOutAt',{$min:[now,{$ifNull:['$missedCheckoutCutoffAt',now]}]}]}]},_active:{$and:[{$eq:['$status','ACTIVE']},{$not:[resolved]},{$gt:[{$ifNull:['$missedCheckoutCutoffAt',new Date(8640000000000000)]},now]}]}}},
    {$group:{_id:'$user',officeSeconds:{$sum:{$max:[0,{$divide:[{$subtract:['$_end','$_start']},1000]}]}},checkedIn:{$max:{$cond:['$_active',1,0]}},sessions:{$sum:1}}}
  ]).option({maxTimeMS:10000});
}

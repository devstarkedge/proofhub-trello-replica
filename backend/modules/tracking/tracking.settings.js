import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import {TrackingPolicy,TrackingDevice,WorkSession,TrackingAgenda,TrackingCaptureLease} from './tracking.models.js';
import {trackingRole} from './tracking.visibility.js';
import {contextFor,fail,policyFor,emitChanged} from './tracking.service.js';
import {can} from './tracking.authorization.js';
import {emitToUser} from '../../realtime/emitters.js';
export async function roleFor(workspaceId,userId){return trackingRole(await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean(),workspaceId);}
export async function requireTrackingAdmin(workspaceId,userId){const ctx=await contextFor(workspaceId,userId);if(await roleFor(workspaceId,userId)!=='admin'||!can(ctx,'tracking.manage_policy',{workspaceId}))fail('The current workspace Admin role and Time Tracking settings permission are required',403);}
export function validateConfiguration(body){
  const {intervalSeconds,retentionDays,idleThresholdSeconds,monitors,blur,monitoringEnabled,personalPauseEnabled,remindersEnabled,reminderDelayMinutes,reminderCooldownMinutes}=body;
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>3600||intervalSeconds%60)fail('Screenshot frequency must be a whole number of minutes from 1 to 60');
  if(![7,30,365,null].includes(retentionDays))fail('Choose 7, 30, 365 days or No Flush');
  if(retentionDays===null&&body.noFlushConfirmed!==true)fail('Confirm the No Flush storage usage warning');
  if(!Number.isInteger(idleThresholdSeconds)||idleThresholdSeconds<15||idleThresholdSeconds>900||!['primary','all'].includes(monitors)||[blur,monitoringEnabled,personalPauseEnabled,remindersEnabled].some(v=>typeof v!=='boolean'))fail('Complete the monitoring configuration');
  if(!Number.isInteger(reminderDelayMinutes)||reminderDelayMinutes<1||reminderDelayMinutes>240||!Number.isInteger(reminderCooldownMinutes)||reminderCooldownMinutes<15||reminderCooldownMinutes>1440)fail('Reminder delay must be 1–240 and cooldown 15–1440 minutes');
  const exclusions={};
  for(const key of ['excludedDisplayIds','excludeWindowTitles']){
    const values=body[key]||[];
    if(!Array.isArray(values)||values.length>20||values.some(v=>typeof v!=='string'||!v.trim()||v.length>100))fail('Privacy exclusions must contain at most 20 values of 1–100 characters');
    exclusions[key]=[...new Set(values.map(v=>v.trim()))];
  }
  return {intervalSeconds,retentionDays,idleThresholdSeconds,monitors,blur,monitoringEnabled,personalPauseEnabled,remindersEnabled,reminderDelayMinutes,reminderCooldownMinutes,...exclusions};
}
export async function updateSettings(workspaceId,userId,body,health){
  await requireTrackingAdmin(workspaceId,userId);const previous=await policyFor(workspaceId);
  if(body.revision!==previous.revision)fail('Configuration changed; refresh and retry',409);
  const action=body.action;
  if(!['save','enable','disable'].includes(action))fail('Choose save, enable, or disable');
  if(action!=='disable'&&previous.enabled)fail('Disable Time Tracking before editing configuration',409);
  if(action!=='disable'&&previous.disableRecoveryPending)fail('Stopping active work; retry when disable recovery completes',409);
  if(action==='disable'&&body.confirmed!==true)fail('Confirm stopping active work and monitoring');
  let values={};if(action!=='disable')values=validateConfiguration(body);
  if(action==='enable'&&body.confirmed!==true)fail('Explicitly confirm Enable');
  if(action==='enable'&&values.monitoringEnabled&&!(await health()).available)fail('R2 screenshot storage is unavailable. Verify backend storage access before enabling.',503);
  const at=new Date(),revision=previous.revision+1;
  // The existing workspace plugin supplies the tenant predicate. Repeating it
  // in an upsert's filter makes Mongo reject first-time inserts as ambiguous.
  const filter=previous._id?{_id:previous._id,revision:previous.revision}:{};
  let data;
  try{data=await TrackingPolicy.findOneAndUpdate(filter,{$set:{...values,enabled:action==='enable',...(action!=='disable'?{configuredAt:at}:{}),effectiveAt:at,...(action==='disable'?{disabledAt:at,disableRecoveryPending:true}:{}),updatedBy:userId,revision},$setOnInsert:{workspaceId},$push:{versions:{revision,effectiveAt:at,configuration:{...values,enabled:action==='enable'}}}},{new:true,upsert:!previous._id,runValidators:true}).lean();}
  catch(error){if(error.code===11000)fail('Configuration changed concurrently; refresh and retry',409);throw error;}
  if(!data)fail('Configuration changed concurrently',409);
  for await(const member of WorkspaceMembership.find({workspace:workspaceId,status:'active'}).select('user').cursor())try{emitToUser(member.user,'tracking:policy-updated',{revision,enabled:data.enabled,disabledAt:data.disabledAt},workspaceId);}catch{/* polling recovers */}
  if(action==='disable')await finishDisable(workspaceId,data);
  return data;
}
export async function finishDisable(workspaceId,policy){
  if(!policy.disabledAt)return;const at=new Date(policy.disabledAt);
  await TrackingDevice.updateMany({workspaceId},{$set:{activeSession:null,leaseUntil:at}});
  await TrackingCaptureLease.updateMany({workspaceId,endedAt:{$gt:at}},{$set:{endedAt:at}});
  for await(const session of WorkSession.find({workspaceId,endedAt:null,status:'RUNNING'}).lean().cursor()){
    const segments=session.segments.map(s=>!s.endedAt?{...s,endedAt:new Date(Math.max(+new Date(s.startedAt),+at))}:s);
    const saved=await WorkSession.findOneAndUpdate({_id:session._id,revision:session.revision},{$set:{segments,status:'PAUSED'},$inc:{revision:1},$push:{audit:{id:`disable-${policy.revision}`,type:'WORKSPACE_DISABLED',at,actor:policy.updatedBy}}},{new:true}).lean();
    if(saved)emitChanged(saved);
  }
  if(!await WorkSession.exists({workspaceId,endedAt:null,status:'RUNNING'}))await TrackingPolicy.updateOne({workspaceId,revision:policy.revision},{$set:{disableRecoveryPending:false}});
}
export async function listAgendas(workspaceId,userId){
  const ctx=await contextFor(workspaceId,userId,{includeProjects:false});if(!can(ctx,'tracking.log',{workspaceId,user:userId}))fail('Tracking permission required',403);
  try{await TrackingAgenda.findOneAndUpdate({normalizedTitle:'learning'},{$setOnInsert:{workspaceId,title:'Learning',normalizedTitle:'learning'}},{upsert:true});}catch(e){if(e.code!==11000)throw e;}
  return TrackingAgenda.find({workspaceId,archivedAt:null}).sort({title:1}).select('_id title').lean();
}
export async function createAgenda(workspaceId,userId,title){
  await listAgendas(workspaceId,userId);if(!(await policyFor(workspaceId)).enabled)fail('Time Tracking is disabled',403);
  if(typeof title!=='string'||!title.trim()||title.trim().length>80)fail('Agenda title must contain 1–80 characters');
  const clean=title.normalize('NFKC').trim().replace(/\s+/g,' '),normalizedTitle=clean.toLocaleLowerCase('en-US');
  if(clean.length>80)fail('Normalized agenda title must contain at most 80 characters');
  try{return await TrackingAgenda.findOneAndUpdate({normalizedTitle},{$setOnInsert:{workspaceId,title:clean,normalizedTitle,createdBy:userId}},{upsert:true,new:true}).lean();}catch(e){if(e.code!==11000)throw e;return TrackingAgenda.findOne({workspaceId,normalizedTitle}).lean();}
}

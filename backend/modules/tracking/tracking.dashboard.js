import {DateTime} from 'luxon';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import {WorkSession,TrackingDevice,ActivityInterval,TrackingScreenshot} from './tracking.models.js';
import {contextFor,authorizeRecord,fail,objectId,reconcileSession} from './tracking.service.js';
import {trackingVisibility,departmentsOf} from './tracking.visibility.js';
import {roleFor} from './tracking.settings.js';
import {summarize,overlapSeconds} from './tracking.timeline.js';
import {summarizeEvidence} from './tracking.evidence.js';
import {can} from './tracking.authorization.js';
const id=v=>String(v?._id||v||'');
export function reportDates(query,timezone){
  const now=DateTime.now().setZone(timezone);let start,end=now.endOf('day');
  if(query.period==='yesterday'){start=now.minus({days:1}).startOf('day');end=start.endOf('day');}
  else if(query.period==='week')start=now.startOf('week');else if(query.period==='month')start=now.startOf('month');else start=now.startOf('day');
  if(query.period==='custom'){start=DateTime.fromISO(query.fromDate||'',{zone:timezone}).startOf('day');end=DateTime.fromISO(query.toDate||'',{zone:timezone}).endOf('day');}
  if(!start.isValid||!end.isValid||end<start||end.diff(start,'days').days>366)fail('Choose a valid date range up to 366 days');
  return {fromDate:start.toISODate(),toDate:end.toISODate(),start:start.toJSDate(),end:end.toJSDate()};
}
export function segmentFilter(query){
  const filter={};
  if(query.type && !['TASK','INDIVIDUAL'].includes(query.type))fail('Invalid tracking type');
  if(query.type)filter.kind=query.type;
  for(const [key,fields]of [['projectId',['project','attributedProject']],['taskId',['task','attributedTask','linkedTask']],['agendaId',['agenda']]])if(query[key]){objectId(query[key]);(filter.$and||=[]).push({$or:fields.map(field=>({[field]:query[key]}))});}
  if(query.linked==='true')filter.attributionIncluded=true;if(query.linked==='false')filter.attributionIncluded={$ne:true};
  if(query.description){if(String(query.description).length>100)fail('Description search is too long');filter.description={$regex:String(query.description).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};}
  return filter;
}
export function matchesSegment(segment,query){
  if(query.type&&segment.kind!==query.type)return false;
  for(const [key,fields]of [['projectId',['project','attributedProject']],['taskId',['task','attributedTask','linkedTask']],['agendaId',['agenda']]])if(query[key]&&!fields.some(f=>id(segment[f])===id(query[key])))return false;
  if(query.linked==='true'&&!segment.attributionIncluded)return false;
  if(query.linked==='false'&&segment.attributionIncluded)return false;
  return !query.description||String(segment.description||'').toLocaleLowerCase().includes(String(query.description).toLocaleLowerCase());
}
export function selectedSegments(session,query,start=new Date(0),end=new Date()){
  return session.segments.filter(s=>matchesSegment(s,query)).map(s=>({...s,startedAt:new Date(Math.max(+new Date(s.startedAt),+start)),endedAt:new Date(Math.min(+(s.endedAt||end),+end))})).filter(s=>+s.endedAt>+s.startedAt);
}
export async function dashboard(workspaceId,userId,query){
  const ctx=await contextFor(workspaceId,userId),role=await roleFor(workspaceId,userId),workspace=await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone=workspace?.timezone||'UTC',dates=reportDates(query,timezone),filter={workspace:workspaceId,status:'active',kind:{$ne:'guest'}};
  if(role==='manager'){
    const departments=await Department.find({workspaceId,managers:userId,isActive:{$ne:false}}).select('_id').lean();
    filter.$or=[{user:userId},{$or:[{department:{$in:departments.map(d=>d._id)}},{departments:{$in:departments.map(d=>d._id)}}],role:{$nin:['manager','admin']}}];
  }else if(role!=='admin')filter.user=userId;
  if(query.userId){objectId(query.userId);filter.user=query.userId;if(!await trackingVisibility(workspaceId,userId,query.userId,null,false))fail('User not found',404);}
  if(query.departmentId){objectId(query.departmentId);filter.$and=[{$or:[{department:query.departmentId},{departments:query.departmentId}]}];}
  if(query.role)filter.role=String(query.role).slice(0,80);
  if(query.search){const search=String(query.search).trim().slice(0,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const users=await User.find({name:{$regex:search,$options:'i'}}).select('_id').lean();filter.$and=[...(filter.$and||[]),{user:{$in:users.map(u=>u._id)}}];}
  const members=await WorkspaceMembership.find(filter).sort({_id:1}).lean();
  const rows=[];const sf=segmentFilter(query);
  const allSessions=await WorkSession.find({workspaceId,user:{$in:members.map(m=>m.user)},startedAt:{$lte:dates.end},$or:[{endedAt:null},{endedAt:{$gte:dates.start}}],...(Object.keys(sf).length?{segments:{$elemMatch:sf}}:{})}).sort({startedAt:-1}).lean();
  const page=Math.max(1,Math.min(100000,Number(query.page)||1)),limit=25;
  // Authorize before counting or pagination. Requests cannot enumerate peers
  // through total counts or filters that happen to produce empty work results.
  for(const member of members){
    if(!await trackingVisibility(workspaceId,userId,member.user,null,false))continue;
    if(id(member.user)!==id(userId)&&!can(ctx,'tracking.view_reports',{workspaceId,user:member.user,departments:departmentsOf(member)}))continue;
    const sessions=[];for(let s of allSessions.filter(s=>id(s.user)===id(member.user))){
      try{await authorizeRecord(ctx,s);}catch(e){if(e.statusCode===404)continue;throw e;}s=await reconcileSession(s._id);sessions.push(s);
    }
    if(Object.keys(sf).length&&!sessions.length)continue;
    const current=sessions.find(s=>!s.endedAt),last=current||sessions[0],trackingStatus=current?.status==='RUNNING'?'RUNNING':current?.status==='PAUSED'&&current.pauses?.some(p=>!p.endedAt)?'PAUSED':'NOT_TRACKING';
    if(query.status&&query.status!==trackingStatus)continue;
    rows.push({member,sessions,last,trackingStatus});
  }
  const selected=rows.slice((page-1)*limit,page*limit),users=await User.find({_id:{$in:selected.map(r=>r.member.user)}}).select('name avatar').lean();
  const departmentIds=selected.flatMap(r=>departmentsOf(r.member)),departmentDocs=await Department.find({_id:{$in:departmentIds},workspaceId}).select('name').lean();
  const data=[];for(const row of selected){
    const owner=users.find(u=>id(u)===id(row.member.user)),devices=await TrackingDevice.find({workspaceId,user:row.member.user,revokedAt:null}).select('state lastSeenAt activeSession').lean();
    const attendance=await AttendanceSession.find({workspaceId,user:row.member.user,workDateKey:{$gte:dates.fromDate,$lte:dates.toDate}}).select('status checkInAt checkOutAt missedCheckoutCutoffAt').lean();
    const ids=row.sessions.map(s=>s._id),segments=row.sessions.flatMap(s=>selectedSegments(s,query,dates.start,new Date(Math.min(Date.now(),+dates.end)))),intervals=(await ActivityInterval.find({workspaceId,session:{$in:ids},startedAt:{$gte:dates.start},endedAt:{$lte:dates.end},$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}).lean()).filter(i=>overlapSeconds(i.startedAt,i.endedAt,segments)>=(+i.endedAt-+i.startedAt)/1000-0.001),images=await TrackingScreenshot.find({workspaceId,interval:{$in:intervals.map(i=>i._id)},status:{$ne:'DELETED'},$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}).select('interval status').lean();
    const evidence=summarizeEvidence(intervals,images),workSeconds=summarize({segments,endedAt:new Date()}).workSeconds;
    const officeSeconds=attendance.reduce((n,a)=>n+Math.max(0,(+(a.checkOutAt||new Date(Math.min(Date.now(),a.missedCheckoutCutoffAt?+a.missedCheckoutCutoffAt:Infinity)))-+a.checkInAt)/1000),0);
    const latest=row.last?.segments.at(-1);
    data.push({userId:row.member.user,name:owner?.name||'Member',avatar:owner?.avatar,role:row.member.role,departments:departmentsOf(row.member).map(d=>({_id:d,name:departmentDocs.find(v=>id(v)===d)?.name||'Department'})),trackingStatus:row.trackingStatus,attendanceStatus:attendance.some(a=>a.status==='ACTIVE')?'Checked in':attendance.length?'Checked out':'No attendance',title:latest?.agenda?`${latest.agendaTitle} — ${latest.description}`:latest?`${latest.projectName} / ${latest.taskTitle||'Individual'}`:'No work selected',workSeconds,officeSeconds,evidence,session:row.last,devices:devices.map(d=>({...d,connected:Date.now()-+new Date(d.lastSeenAt||0)<45000}))});
  }
  return {workspaceId,users:data,total:rows.length,page,pageSize:limit,timezone,dates,serverNow:new Date()};
}

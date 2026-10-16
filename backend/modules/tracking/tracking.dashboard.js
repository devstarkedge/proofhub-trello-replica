import {DateTime} from 'luxon';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import {WorkSession,TrackingDevice} from './tracking.models.js';
import {contextFor,fail,objectId,reconcileReadSessions} from './tracking.service.js';
import {readVisibilityScope,departmentsOf} from './tracking.visibility.js';
import {summarize} from './tracking.timeline.js';
import {evidenceByUser} from './tracking.evidenceRead.js';
import {summarizeEvidence} from './tracking.evidence.js';
const id=v=>String(v?._id||v||'');
const literal=value=>Array.from(value).map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
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
  if(query.description){if(String(query.description).length>100)fail('Description search is too long');filter.description={$regex:literal(String(query.description)),$options:'i'};}
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
  const ctx=await contextFor(workspaceId,userId),scope=await readVisibilityScope(ctx),workspace=await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone=workspace?.timezone||'UTC',dates=reportDates(query,timezone),sf=segmentFilter(query),now=new Date();
  if(query.userId){objectId(query.userId);if(!scope.canOwner(query.userId))fail('User not found',404);}
  if(query.departmentId)objectId(query.departmentId);
  let members=scope.members.filter(m=>scope.canOwner(m.user)&&(!query.userId||id(m.user)===id(query.userId))&&(!query.departmentId||departmentsOf(m).includes(id(query.departmentId)))&&(!query.role||m.role===query.role));
  if(query.search){const search=literal(String(query.search).trim().slice(0,80));const matches=await User.find({_id:{$in:members.map(m=>m.user)},name:{$regex:search,$options:'i'}}).select('_id').lean();const names=new Set(matches.map(id));members=members.filter(m=>names.has(id(m.user)));}
  const bounds={workspaceId,startedAt:{$lte:dates.end},$or:[{endedAt:null},{endedAt:{$gte:dates.start}}]};
  if(Object.keys(sf).length||query.status){
    if(query.status&&!['RUNNING','PAUSED','NOT_TRACKING'].includes(query.status))fail('Invalid tracking status');
    const candidates=await WorkSession.find({...bounds,user:{$in:members.map(m=>m.user)},...(Object.keys(sf).length?{segments:{$elemMatch:sf}}:{})}).select('-operations -audit').lean();
    await scope.markMixed(candidates);const visible=candidates.filter(s=>scope.canRecord(s));
    if(Object.keys(sf).length){const owners=new Set(visible.filter(s=>selectedSegments(s,query,dates.start,new Date(Math.min(+now,+dates.end))).length).map(s=>id(s.user)));members=members.filter(m=>owners.has(id(m.user)));}
    if(query.status){const statuses=new Map(visible.filter(s=>!s.endedAt).map(s=>[id(s.user),s.status==='RUNNING'?'RUNNING':s.status==='PAUSED'&&s.pauses?.some(p=>!p.endedAt)?'PAUSED':'NOT_TRACKING']));members=members.filter(m=>(statuses.get(id(m.user))||'NOT_TRACKING')===query.status);}
  }
  members.sort((a,b)=>id(a).localeCompare(id(b)));
  const total=members.length,limit=20;
  if(query.cursor){objectId(query.cursor);members=members.filter(m=>id(m)>id(query.cursor));}
  const selected=members.slice(0,limit),owners=selected.map(m=>m.user);
  const [rawSessions,attendance,devices,users,departmentDocs]=await Promise.all([
    WorkSession.find({...bounds,user:{$in:owners}}).select('-operations').sort({startedAt:-1}).lean(),
    AttendanceSession.find({workspaceId,user:{$in:owners},workDateKey:{$gte:dates.fromDate,$lte:dates.toDate}}).lean(),
    TrackingDevice.find({workspaceId,user:{$in:owners},revokedAt:null}).select('user state lastSeenAt activeSession screenshotIssue lastUploadError').lean(),
    User.find({_id:{$in:owners}}).select('name avatar').lean(),
    Department.find({workspaceId,_id:{$in:selected.flatMap(departmentsOf)}}).select('name').lean()
  ]);
  await scope.markMixed(rawSessions);
  const sessions=await reconcileReadSessions(rawSessions.filter(s=>scope.canRecord(s)),ctx,scope,attendance);
  const evidenceSegments=sessions.flatMap(s=>selectedSegments(s,query,dates.start,new Date(Math.min(+now,+dates.end))).map(segment=>({session:s._id,startedAt:segment.startedAt,endedAt:segment.endedAt})));
  const evidenceMap=await evidenceByUser(workspaceId,sessions,evidenceSegments,dates.start,dates.end);
  const data=selected.map(member=>{
    const own=sessions.filter(s=>id(s.user)===id(member.user)),last=own.find(s=>!s.endedAt)||own[0],status=last&&!last.endedAt&&last.status==='RUNNING'?'RUNNING':last&&!last.endedAt&&last.status==='PAUSED'&&last.pauses?.some(p=>!p.endedAt)?'PAUSED':'NOT_TRACKING';
    const segments=own.flatMap(s=>selectedSegments(s,query,dates.start,new Date(Math.min(+now,+dates.end))));
    const evidence=evidenceMap.get(id(member.user))||summarizeEvidence([]);
    const office=attendance.filter(a=>id(a.user)===id(member.user)),latest=last?.segments.filter(s=>matchesSegment(s,query)).at(-1),owner=users.find(u=>id(u)===id(member.user));
    return {userId:member.user,name:owner?.name||'Member',avatar:owner?.avatar,role:member.role,departments:departmentsOf(member).map(d=>({_id:d,name:departmentDocs.find(v=>id(v)===d)?.name||'Department'})),trackingStatus:status,
      attendanceStatus:office.some(a=>a.status==='ACTIVE')?'Checked in':office.length?'Checked out':'No attendance',title:latest?.agenda?latest.agendaTitle+' — '+latest.description:latest?(latest.projectName||'Project')+' / '+(latest.taskTitle||'Individual'):'No work selected',
      workSeconds:summarize({segments,endedAt:now}).workSeconds,officeSeconds:office.reduce((n,a)=>n+Math.max(0,(+(a.checkOutAt||new Date(Math.min(+now,a.missedCheckoutCutoffAt?+a.missedCheckoutCutoffAt:Infinity)))-+a.checkInAt)/1000),0),evidence,
      session:last?{_id:last._id,status:last.status,startedAt:last.startedAt,revision:last.revision}:null,devices:devices.filter(d=>id(d.user)===id(member.user)).map(d=>({...d,connected:+now-+new Date(d.lastSeenAt||0)<45000}))};
  });
  return {workspaceId,users:data,total,pageSize:limit,nextCursor:members.length>limit?id(selected.at(-1)):null,timezone,dates,serverNow:now};
}

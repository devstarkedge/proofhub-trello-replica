import {DateTime} from 'luxon';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import {TrackingDevice} from './tracking.models.js';
import {contextFor,fail,objectId,policyFor} from './tracking.service.js';
import {readVisibilityScope,departmentsOf} from './tracking.visibility.js';
import {evidenceByUser} from './tracking.evidenceRead.js';
import {summarizeEvidence} from './tracking.evidence.js';
import {readDashboardGroups,readOfficeGroups} from './tracking.dashboardRead.js';
const id=v=>String(v?._id||v||'');
const literal=value=>Array.from(value).map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
export function reportDates(query,timezone){
  const now=DateTime.now().setZone(timezone);let start,end=now.endOf('day');
  if(query.period==='yesterday'){start=now.minus({days:1}).startOf('day');end=start.endOf('day');}
  else if(query.period==='7days'||query.period==='last7days'){start=now.minus({days:6}).startOf('day');end=now.endOf('day');}
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
const trackingStatus=group=>group?.latest.status==='RUNNING'?'RUNNING':group?.latest.status==='PAUSED'&&group.latest.personalPaused?'PAUSED':'NOT_TRACKING';
export async function dashboard(workspaceId,userId,query){
  const [ctx,policy]=await Promise.all([contextFor(workspaceId,userId,{readOnly:true}),policyFor(workspaceId)]);
  const workspace=ctx.resolvedRecords?.workspace||await Workspace.findById(workspaceId).select('timezone').lean();
  const scope=await readVisibilityScope(ctx),timezone=workspace?.timezone||'UTC',dates=reportDates(query,timezone),sf=segmentFilter(query),now=new Date();
  if(query.status&&!['RUNNING','PAUSED','NOT_TRACKING'].includes(query.status))fail('Invalid tracking status');
  if(query.userId){objectId(query.userId);if(!scope.canOwner(query.userId))fail('User not found',404);}
  if(query.departmentId)objectId(query.departmentId);
  let members=scope.members.filter(m=>scope.roleMap.get(id(m.user))!=='admin'&&scope.canOwner(m.user)&&(!query.userId||id(m.user)===id(query.userId))&&(!query.departmentId||departmentsOf(m).includes(id(query.departmentId)))&&(!query.role||m.role===query.role));
  if(query.search){const search=literal(String(query.search).trim().slice(0,80));const matches=await User.find({_id:{$in:members.map(m=>m.user)},name:{$regex:search,$options:'i'}}).select('_id').lean();const names=new Set(matches.map(id));members=members.filter(m=>names.has(id(m.user)));}
  const bounds={workspaceId,startedAt:{$lte:dates.end},$or:[{endedAt:null},{endedAt:{$gte:dates.start}}]},filtered=Object.keys(sf).length>0;
  const options={workspaceId,ctx,scope,bounds,query,dates,now,policy,filtered};
  let matchingGroups=null;
  if(filtered||query.status){
    matchingGroups=await readDashboardGroups({...options,owners:members.map(m=>m.user)});
    const byUser=new Map(matchingGroups.map(group=>[id(group),group]));
    members=members.filter(m=>(!filtered||byUser.has(id(m.user)))&&(!query.status||trackingStatus(byUser.get(id(m.user)))===query.status));
  }
  members.sort((a,b)=>id(a).localeCompare(id(b)));
  const total=members.length,limit=20,totalsOnly=query.totalsOnly==='true',evidenceOnly=query.evidenceOnly==='true';
  const allOwners=members.map(m=>m.user);
  const metadata={workspaceId,total,pageSize:limit,timezone,viewerRole:scope.viewerRole,dates,serverNow:now};
  const computeTotals=async()=>{
    const [groups,office]=await Promise.all([matchingGroups||readDashboardGroups({...options,owners:allOwners}),readOfficeGroups(workspaceId,allOwners,dates,now)]);
    const allowed=new Set(allOwners.map(id)),visible=groups.filter(group=>allowed.has(id(group)));
    return {workSeconds:visible.reduce((n,g)=>n+g.workSeconds,0),officeSeconds:office.reduce((n,g)=>n+g.officeSeconds,0),activeUsers:visible.filter(g=>trackingStatus(g)==='RUNNING').length,checkedInUsers:office.filter(g=>g.checkedIn).length,totalUsers:total,viewerRole:scope.viewerRole};
  };
  if(totalsOnly)return {...metadata,users:[],nextCursor:null,totals:await computeTotals()};
  if(query.cursor){objectId(query.cursor);members=members.filter(m=>id(m)>id(query.cursor));}
  const selected=members.slice(0,limit),owners=selected.map(m=>m.user),groups=await readDashboardGroups({...options,owners,includeSessionIds:evidenceOnly||query.summaryOnly!=='true'}),byUser=new Map(groups.map(group=>[id(group),group]));
  let activityUnavailable=false;
  const evidenceRead=query.summaryOnly==='true'?Promise.resolve(new Map()):evidenceByUser(workspaceId,groups.flatMap(group=>(group.sessionIds||[]).map(_id=>({_id}))),[],dates.start,dates.end,{fromWorkSessions:true,query}).catch(error=>{
    if(evidenceOnly)throw error;
    activityUnavailable=true;console.warn('[tracking-dashboard] Activity read failed',error.code||error.name);return new Map();
  });
  if(evidenceOnly){const evidenceMap=await evidenceRead;return {...metadata,users:selected.map(m=>({userId:m.user,evidence:evidenceMap.get(id(m.user))||summarizeEvidence([])})),nextCursor:members.length>limit?id(selected.at(-1)):null,totals:null};}
  const [office,devices,users,departmentDocs,evidenceMap]=await Promise.all([
    readOfficeGroups(workspaceId,owners,dates,now),
    TrackingDevice.find({workspaceId,user:{$in:owners},revokedAt:null}).select('user state lastSeenAt activeSession screenshotIssue lastUploadError').lean(),
    User.find({_id:{$in:owners}}).select('name avatar').lean(),
    Department.find({workspaceId,_id:{$in:selected.flatMap(departmentsOf)}}).select('name').lean(),evidenceRead
  ]);
  const attendanceByUser=new Map(office.map(row=>[id(row),row])),userMap=new Map(users.map(row=>[id(row),row])),departmentMap=new Map(departmentDocs.map(row=>[id(row),row]));
  const data=selected.map(member=>{
    const group=byUser.get(id(member.user)),latest=group?.latest.segment,owner=userMap.get(id(member.user)),attendance=attendanceByUser.get(id(member.user));
    return {userId:member.user,name:owner?.name||'Member',avatar:owner?.avatar,role:member.role,departments:departmentsOf(member).map(d=>({_id:d,name:departmentMap.get(d)?.name||'Department'})),trackingStatus:trackingStatus(group),
      attendanceStatus:attendance?.checkedIn?'Checked in':attendance?.sessions?'Checked out':'No attendance',title:latest?.agenda?latest.agendaTitle+' - '+latest.description:latest?(latest.projectName||'Project')+' / '+(latest.taskTitle||'Individual'):'No work selected',
      workSeconds:group?.workSeconds||0,officeSeconds:attendance?.officeSeconds||0,evidence:(query.summaryOnly==='true'||activityUnavailable)&&group?null:evidenceMap.get(id(member.user))||summarizeEvidence([]),
      session:group?{_id:group.latest._id,status:group.latest.status,startedAt:group.latest.startedAt,revision:group.latest.revision}:null,devices:devices.filter(d=>id(d.user)===id(member.user)).map(d=>({...d,connected:+now-+new Date(d.lastSeenAt||0)<45000}))};
  });
  // Older clients still receive overview totals; current clients load them
  // independently so a workspace aggregate cannot block the first 20 rows.
  const totals=!query.cursor&&query.deferTotals!=='true'?await computeTotals():null;
  return {...metadata,users:data,totals,activityUnavailable,nextCursor:members.length>limit?id(selected.at(-1)):null};
}

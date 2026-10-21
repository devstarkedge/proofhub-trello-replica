import {summarizeEvidence} from './tracking.evidence.js';
import {evidenceByUser} from './tracking.evidenceRead.js';
import mongoose from 'mongoose';
import {DateTime} from 'luxon';
import User from '../../models/User.js';
import AttendanceDay from '../attendance/attendanceDay.model.js';
import {effectiveAttendanceSession} from '../attendance/attendanceRegularizationOverlay.js';
import {WorkSession,TrackingScreenshot,ActivityInterval} from './tracking.models.js';
import {contextFor,policyFor,fail,objectId,authorizeRecord} from './tracking.service.js';
import {can} from './tracking.authorization.js';
import {readVisibilityScope} from './tracking.visibility.js';
import {dashboardReadPipeline} from './tracking.dashboardRead.js';
import {segmentFilter,matchesSegment} from './tracking.dashboard.js';
import {summarize,coverageGaps} from './tracking.timeline.js';
import {resolveScreenshotIdentity,SCREENSHOT_IDENTITY_SELECT,timelineScreenshot} from './tracking.screenshotIdentity.js';
const id=v=>String(v?._id||v||'');
const oid=v=>new mongoose.Types.ObjectId(id(v));

// Reports are projections. Durable lifecycle repair belongs to maintenance,
// never to a list GET. No audit, operations, capture policy or image bytes.
export async function readTrackingReports(workspaceId,viewerId,query){
  const {fromDate,toDate,userId,team,cursor}=query;
  for(const date of [fromDate,toDate])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!DateTime.fromISO(date).isValid))fail('Invalid report dates');
  if(fromDate&&toDate&&(toDate<fromDate||DateTime.fromISO(toDate).diff(DateTime.fromISO(fromDate),'days').days>366))fail('Choose a valid date range up to 366 days');
  if(userId)objectId(userId);if(cursor)objectId(cursor);
  const sf=segmentFilter(query),[ctx,policy]=await Promise.all([contextFor(workspaceId,viewerId,{readOnly:true}),policyFor(workspaceId)]);
  if(team==='true'&&!can(ctx,'tracking.view_reports'))fail('Team report permission required',403);
  const scope=await readVisibilityScope(ctx);
  if((userId||team!=='true')&&!scope.canOwner(userId||viewerId))fail('Record not found',404);
  const owners=team==='true'&&!userId?scope.members.filter(m=>scope.canOwner(m.user)).map(m=>m.user):[userId||viewerId];
  const now=new Date(),bounds={workspaceId:oid(workspaceId),...(fromDate||toDate?{workDateKey:{...(fromDate?{$gte:fromDate}:{}),...(toDate?{$lte:toDate}:{})}}:{}),...(cursor?{_id:{$lt:oid(cursor)}}:{})};
  const pipeline=dashboardReadPipeline({workspaceId,ctx,scope,owners,bounds,query,dates:{start:new Date(0),end:now},now,policy,attendanceDetails:true});
  if(Object.keys(sf).length)pipeline.push({$match:{'_selected.0':{$exists:true}}});
  pipeline.push({$sort:{_id:-1}},{$limit:21},{$project:{workspaceId:1,user:1,workDateKey:1,attendanceSession:1,startedAt:1,revision:1,includePreAssignment:1,departmentIdsAtStart:1,_attendance:1,
    status:'$_viewStatus',endedAt:{$cond:[{$eq:['$_viewStatus','CLOSED']},'$_cutoff','$endedAt']},
    segments:{$map:{input:'$_selected',as:'s',in:{$mergeObjects:['$$s',{endedAt:{$cond:[{$and:[{$eq:[{$ifNull:['$$s.endedAt',null]},null]},{$gte:['$_cutoff',now]}]},null,{$min:[{$ifNull:['$$s.endedAt','$_cutoff']},'$_cutoff']}]}}]}}},
    pauses:{$map:{input:{$ifNull:['$pauses',[]]},as:'p',in:{startedAt:'$$p.startedAt',endedAt:{$cond:[{$and:[{$eq:[{$ifNull:['$$p.endedAt',null]},null]},{$gte:['$_cutoff',now]}]},null,{$min:[{$ifNull:['$$p.endedAt','$_cutoff']},'$_cutoff']}]}}}}
  }});
  pipeline.push(
    {$lookup:{from:User.collection.name,localField:'user',foreignField:'_id',pipeline:[{$project:{name:1}}],as:'_subject'}},
    {$lookup:{from:AttendanceDay.collection.name,let:{day:'$_attendance.attendanceDay'},pipeline:[{$match:{workspaceId:oid(workspaceId),$expr:{$eq:['$_id','$$day']}}},{$project:{presenceState:1,attendanceStatus:1,workedMinutes:1}}],as:'_day'}}
  );
  const candidates=await WorkSession.aggregate(pipeline).option({maxTimeMS:10000,allowDiskUse:true}),sessions=candidates.slice(0,20);
  const previews=query.summaryOnly==='true'?new Map():await readReportPreviews(workspaceId,sessions,ctx,scope,query,now);
  return {workspaceId,timezone:ctx.resolvedRecords.workspace?.timezone||'UTC',serverNow:now,nextCursor:candidates.length>20?id(sessions.at(-1)):null,sessions:sessions.map(record=>{
    const {_attendance,_subject,_day,...session}=record,attendance=_attendance?effectiveAttendanceSession(_attendance):null,officeEnd=attendance?.checkOutAt||(attendance?.status==='ACTIVE'?new Date(Math.min(+now,attendance.missedCheckoutCutoffAt?+attendance.missedCheckoutCutoffAt:Infinity)):null);
    const preview=previews.get(id(session))||{records:[],totalCount:0},previewsLoaded=query.summaryOnly!=='true';
    return {...session,userName:_subject?.[0]?.name||'Former member',totals:summarize(session,now),attendance:{status:attendance?.status,day:_day?.[0],checkInAt:attendance?.checkInAt,checkOutAt:attendance?.checkOutAt,measuredOfficeSeconds:officeEnd?Math.max(0,(+officeEnd-+attendance.checkInAt)/1000):null},previewsLoaded,latestScreenshots:preview.records,totalScreenshots:previewsLoaded?preview.totalCount:null};
  })};
}

// Separate enrichment: work-day rows never wait for screenshot counts/previews.
export async function readTrackingReportPreviews(workspaceId,viewerId,query){
  const ids=String(query.sessionIds||'').split(',').filter(Boolean);
  if(!ids.length||ids.length>20)fail('Choose between 1 and 20 work sessions');
  ids.forEach(objectId);segmentFilter(query);
  const [ctx,sessions]=await Promise.all([contextFor(workspaceId,viewerId,{readOnly:true}),WorkSession.find({workspaceId,_id:{$in:ids}}).select('_id workspaceId user segments departmentIdsAtStart').lean()]);
  const scope=await readVisibilityScope(ctx);await scope.markMixed(sessions);
  if(sessions.length!==new Set(ids).size||sessions.some(session=>!scope.canRecord(session)))fail('Record not found',404);
  const selected=sessions.map(session=>({...session,segments:session.segments.filter(segment=>matchesSegment(segment,query))}));
  const previews=await readReportPreviews(workspaceId,selected,ctx,scope,query,new Date());
  return {workspaceId,sessions:selected.map(session=>({_id:session._id,previewsLoaded:true,latestScreenshots:previews.get(id(session))?.records||[],totalScreenshots:previews.get(id(session))?.totalCount||0}))};
}

async function readReportPreviews(workspaceId,sessions,ctx,scope,query,now){
  const visible=sessions.filter(session=>scope.canRecord(session,'tracking.view_screenshots'));
  if(!visible.length)return new Map();
  const tenant=oid(workspaceId),filtered=Object.keys(segmentFilter(query)).length>0;
  const records=await WorkSession.aggregate([
    {$match:{workspaceId:tenant,_id:{$in:visible.map(s=>s._id)}}},
    {$set:{_history:{$switch:{branches:visible.map(s=>({case:{$eq:['$_id',s._id]},then:scope.history(s.user)?.map(oid)||null})),default:[]}},segments:{$switch:{branches:visible.map(s=>({case:{$eq:['$_id',s._id]},then:{$literal:s.segments}})),default:[]}}}},
    {$lookup:{from:TrackingScreenshot.collection.name,let:{session:'$_id',history:'$_history',segments:'$segments'},pipeline:[
      {$match:{workspaceId:tenant,status:{$ne:'DELETED'},$or:[{expiresAt:null},{expiresAt:{$gt:now}}],$expr:{$and:[{$eq:['$session','$$session']},{$or:[{$eq:['$$history',null]},{$gt:[{$size:{$setIntersection:[{$ifNull:['$departmentIdsAtCapture',[]]},{$ifNull:['$$history',[]]}]}},0]}]}]}}},
      ...(filtered?[{$lookup:{from:ActivityInterval.collection.name,let:{interval:'$interval'},pipeline:[{$match:{workspaceId:tenant,$expr:{$eq:['$_id','$$interval']}}},{$project:{startedAt:1,endedAt:1}}],as:'_interval'}},{$set:{_interval:{$first:'$_interval'}}},{$match:{$expr:{$anyElementTrue:{$map:{input:'$$segments',as:'s',in:{$and:[{$lt:['$_interval.startedAt',{$ifNull:['$$s.endedAt',now]}]},{$gt:['$_interval.endedAt','$$s.startedAt']}]}}}}}}]:[]),
      {$facet:{records:[{$sort:{capturedAt:-1,_id:-1}},{$limit:4},{$project:Object.fromEntries(`_id session user interval capturedAt displayId status uploadStatus blurred checksum expiresAt compressionException ${SCREENSHOT_IDENTITY_SELECT}`.split(/\s+/).map(key=>[key,1]))}],count:[{$count:'total'}]}}
    ],as:'_preview'}},{$project:{preview:{$first:'$_preview'}}}
  ]).option({maxTimeMS:10000,allowDiskUse:true});
  const intervalIds=records.flatMap(r=>r.preview?.records||[]).map(r=>r.interval).filter(Boolean),intervals=intervalIds.length?await ActivityInterval.find({workspaceId,_id:{$in:intervalIds}}).select('coverage activityBasis inputEligibleSeconds inputActiveSeconds keyboardCount mouseCount').lean():[];
  const intervalMap=new Map(intervals.map(i=>[id(i),i]));
  return new Map(records.map(row=>[id(row),{totalCount:row.preview?.count?.[0]?.total||0,records:(row.preview?.records||[]).map(s=>{
    const interval=intervalMap.get(id(s.interval)),eligible=interval&&!['excluded','locked','sleep'].includes(interval.coverage)&&interval.activityBasis==='distinct-input-seconds-v1'&&interval.inputEligibleSeconds>0&&Number.isFinite(interval.inputActiveSeconds);
    return {_id:s._id,screenshotIdentity:resolveScreenshotIdentity(s),session:s.session,user:s.user,imageVersion:s.checksum,thumbnailVersion:s.checksum,expiresAt:s.expiresAt,interval:s.interval,displayId:s.displayId,capturedAt:s.capturedAt,status:s.status,uploadStatus:s.uploadStatus,blurred:s.blurred,activityPercent:eligible?Math.min(100,Math.max(0,interval.inputActiveSeconds/interval.inputEligibleSeconds*100)):null,keyboardCount:interval?.keyboardCount??null,mouseCount:interval?.mouseCount??null,compressionException:s.compressionException};
  })}]));
}

export async function readTrackingTimeline(workspaceId,viewerId,sessionId,query){
  const [ctx,session] = await Promise.all([contextFor(workspaceId, viewerId,{readOnly:true}),WorkSession.findById(objectId(sessionId)).select('-operations -audit').lean()]);
  const visibility=await readVisibilityScope(ctx);await visibility.markMixed(session?[session]:[]);
  await authorizeRecord(ctx, session);
  segmentFilter(query);
  const segments=session.segments.filter(s=>matchesSegment(s,query));
  const overlap=segments.map(s=>({startedAt:{$lt:s.endedAt||new Date()},endedAt:{$gt:s.startedAt}}));
  const segmentBounds=overlap.length?{$or:overlap}:{_id:{$in:[]}};
  const scope=visibility.history(session.user);
  const history=scope===null?{}:{departmentIdsAtCapture:{$in:scope}};
  const before = query.before ? new Date(query.before) : null;
  if (before && !Number.isFinite(+before)) fail('Invalid timeline cursor');
  const validExpiry={$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]};
  const cutoff=new Date(0);
  const [intervals,allCoverage,evidenceMap] = await Promise.all([
    ActivityInterval.find({ ...history,...segmentBounds,$and:[validExpiry],session: session._id, endedAt: { $gte:cutoff,...(before?{$lt:before}:{}) } }).sort({ endedAt: -1 }).limit(20).select('-digest -capturePolicy').lean(),
    ActivityInterval.find({...history,...segmentBounds,$and:[validExpiry],session:session._id,endedAt:{$gte:cutoff}}).select('_id startedAt endedAt').lean(),
    evidenceByUser(workspaceId,[session],segments.map(s=>({session:session._id,startedAt:s.startedAt,endedAt:s.endedAt||new Date()})),cutoff,new Date())
  ]);
  let screenshots = []; 
  try { await authorizeRecord(ctx, session, 'tracking.view_screenshots');
    if(query.summaryOnly!=='true'){
      const records=await TrackingScreenshot.find({ ...history,...validExpiry,session: session._id, interval: { $in: intervals.map(i => i._id) }, status: {$ne:'DELETED'} }).select(`_id interval displayId capturedAt width height blurred uploadStatus status ${SCREENSHOT_IDENTITY_SELECT}`).lean();
      screenshots=records.map(timelineScreenshot);
    }
  } catch (e) { if (e.statusCode !== 404) throw e; }
  const contexts=intervals.map(interval=>({...interval,contexts:session.segments.filter(s=>+new Date(s.startedAt)<+new Date(interval.endedAt)&&(!s.endedAt||+new Date(s.endedAt)>+new Date(interval.startedAt))).map(s=>({segmentId:s._id,title:s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle}`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName} / ${s.taskTitle||'Individual'}`,origin:s.agenda?`${s.agendaTitle} — ${s.description}`:null,task:s.attributedTask||s.task,attributedAt:s.attributedAt}))}));
  const evidence=evidenceMap.get(id(session.user))||summarizeEvidence([]);
  return { intervals:contexts, screenshots, evidence, coverageGaps:coverageGaps(segments,allCoverage), nextBefore: intervals.length === 20 ? intervals.at(-1).endedAt : null };
}

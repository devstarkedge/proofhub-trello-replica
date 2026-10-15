import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { id } from '../../authz/engine.js';
import { can } from './tracking.authorization.js';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import AttendanceDay from '../attendance/attendanceDay.model.js';
import { emitToUser } from '../../realtime/emitters.js';
import { WorkSession, ActivityInterval, TrackingScreenshot, TrackingPolicy, TrackingDevice } from './tracking.models.js';
import { currentState, changeWork, workOptions, contextFor, fail, objectId, createWorkTask, authorizeRecord, policyFor, reconcileSession } from './tracking.service.js';
import { registerDevice, acceptMonitoringNotice, releaseDevice, heartbeat, recordInterval, prepareScreenshot, completeScreenshot, retryScreenshot } from './tracking.device.js';
import { readPrivateScreenshot, storageHealth } from './tracking.storage.js';
import { trackingVisibility, historicalDepartmentScope } from './tracking.visibility.js';
import { migrateLegacyScreenshot } from './tracking.legacyStorage.js';
import { summarize, coverageGaps,overlapSeconds } from './tracking.timeline.js';
import { summarizeEvidence } from './tracking.evidence.js';
import {updateSettings,requireTrackingAdmin,listAgendas,createAgenda} from './tracking.settings.js';
import {dashboard,segmentFilter,matchesSegment} from './tracking.dashboard.js';

const router = express.Router();
router.use(protect);
router.use(rateLimiter({ windowMs: 60000, maxRequests: 180, keyFn: req => `${req.workspaceId}:${req.user.id}`, message: 'Too many tracking requests; retry shortly.' }));
const actor = req => ({ workspaceId: req.workspaceId, userId: req.user.id });
const send = (res, data) => res.json({ success: true, data });
const audit = (req, action, targetType, targetId, after = null) => recordAuditLog({
  actor: req.user, action, targetType, targetId, resourceLabel: 'Work tracking', summary: action.replaceAll('_', ' '),
  before: null, after, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
});
router.get('/me', asyncHandler(async (req,res) => send(res, await currentState(req.workspaceId, req.user.id))));
router.get('/options', asyncHandler(async (req,res) => send(res, await workOptions(req.workspaceId, req.user.id, req.query.projectId))));
router.get('/agendas',asyncHandler(async(req,res)=>send(res,await listAgendas(req.workspaceId,req.user.id))));
router.get('/dashboard',asyncHandler(async(req,res)=>send(res,await dashboard(req.workspaceId,req.user.id,req.query))));
router.post('/agendas',asyncHandler(async(req,res)=>send(res,await createAgenda(req.workspaceId,req.user.id,req.body?.title))));
router.get('/policy/impact',asyncHandler(async(req,res)=>{await requireTrackingAdmin(req.workspaceId,req.user.id);send(res,{activeSessions:await WorkSession.countDocuments({workspaceId:req.workspaceId,endedAt:null,status:'RUNNING'})});}));
router.get('/agent-release', asyncHandler(async (req,res) => {
  await contextFor(req.workspaceId,req.user.id);
  const version=process.env.FLOWTASK_DESKTOP_LATEST_VERSION,downloadUrl=process.env.FLOWTASK_DESKTOP_RELEASE_URL;
  if(!version||!downloadUrl)return send(res,{configured:false});
  let url;try{url=new URL(downloadUrl);}catch{fail('Desktop release configuration is invalid',503);}
  if(url.protocol!=='https:'||!/^\d+\.\d+\.\d+$/.test(version))fail('Desktop release configuration is invalid',503);
  send(res,{configured:true,version,downloadUrl:url.href});
}));
router.get('/report-members',asyncHandler(async(req,res)=>{
  const ctx=await contextFor(req.workspaceId,req.user.id);
  const members=await WorkspaceMembership.find({workspace:req.workspaceId,status:'active'}).lean();
  const permitted=[];for(const member of members)if(await trackingVisibility(req.workspaceId,req.user.id,member.user,null,false) && (id(member.user)===id(req.user.id)||can(ctx,'tracking.view_reports',{workspaceId:req.workspaceId,user:member.user,departments:member.departments||member.department||[]})))permitted.push(member);
  send(res,await User.find({_id:{$in:permitted.map(m=>m.user)}}).select('_id name').sort({name:1}).lean());
}));
router.post('/tasks', asyncHandler(async (req,res) => {
  const { projectId, listId, title, description, operationId } = req.body || {};
  const data = await createWorkTask({ ...actor(req), user: req.user, projectId, listId, title, description, operationId });
  send(res, data);
}));
router.get('/tasks/:taskId/totals',asyncHandler(async(req,res)=>{
  const ctx=await contextFor(req.workspaceId,req.user.id);
  const task=await Card.findById(objectId(req.params.taskId)).lean(),project=task?await Board.findById(task.board).lean():null;
  if(!task||!project||!can(ctx,'task.view',{...task,project,taskResource:task}))fail('Task not found',404);
  let trackedSeconds=0,assignedSeconds=0,preAssignmentSeconds=0,preAssignmentIncludedSeconds=0;
  const now=Date.now();
  for await(const session of WorkSession.find({$or:[{'segments.task':task._id},{'segments.linkedTask':task._id},{'segments.attributedTask':task._id}]}).cursor()){
    try{await authorizeRecord(ctx,session);}catch(e){if(e.statusCode===404)continue;throw e;}
    for(const segment of session.segments){
      const seconds=Math.max(0,(Math.min(segment.endedAt?+segment.endedAt:now,now)-+segment.startedAt)/1000);
      if(id(segment.task)===id(task._id)){assignedSeconds+=seconds;trackedSeconds+=seconds;}
      if(id(segment.attributedTask)===id(task._id)){preAssignmentSeconds+=seconds;preAssignmentIncludedSeconds+=seconds;trackedSeconds+=seconds;}
      if(id(segment.linkedTask)===id(task._id)){preAssignmentSeconds+=seconds;if(session.includePreAssignment){preAssignmentIncludedSeconds+=seconds;trackedSeconds+=seconds;}}
    }
  }
  send(res,{workspaceId:req.workspaceId,taskId:task._id,trackedSeconds,assignedSeconds,preAssignmentSeconds,preAssignmentIncludedSeconds,serverNow:new Date()});
}));
router.post('/work/:action', asyncHandler(async (req,res) => {
  const { selection, operationId, expectedRevision } = req.body || {};
  send(res, await changeWork({ ...actor(req), action: req.params.action, selection, operationId, expectedRevision }));
}));
router.get('/policy', asyncHandler(async (req,res) => { await contextFor(req.workspaceId, req.user.id); send(res, await policyFor(req.workspaceId)); }));
router.put('/policy', asyncHandler(async (req,res) => {
  const data=await updateSettings(req.workspaceId,req.user.id,req.body||{},storageHealth);
  await audit(req, 'TRACKING_POLICY_UPDATED', 'TrackingPolicy', data._id, { revision: data.revision });
  send(res, data);
}));
router.post('/devices/register', asyncHandler(async (req,res) => send(res, await registerDevice({ ...req.body, ...actor(req) }))));
router.put('/devices/:deviceId/preferences', asyncHandler(async (req,res) => {
  fail('Desktop capture settings are controlled by workspace Admin. Update the desktop app to review its monitoring notice.',410,'WORKSPACE_CONTROLLED');
}));
router.post('/devices/:deviceId/notice',asyncHandler(async(req,res)=>{
  const data=await acceptMonitoringNotice({...actor(req),deviceId:req.params.deviceId,noticeVersion:req.body?.noticeVersion,policyRevision:req.body?.policyRevision});
  await audit(req,'TRACKING_NOTICE_ACCEPTED','TrackingDevice',data._id,{noticeVersion:data.noticeVersion,policyRevision:data.consentRevision});
  send(res, data);
}));
router.post('/devices/:deviceId/release',asyncHandler(async(req,res)=>send(res,await releaseDevice({...actor(req),deviceId:req.params.deviceId}))));
router.post('/devices/:deviceId/revoke', asyncHandler(async (req,res) => {
  await releaseDevice({...actor(req),deviceId:req.params.deviceId,revoke:true});
  await audit(req, 'TRACKING_DEVICE_REVOKED', 'TrackingDevice', req.params.deviceId); send(res, { revoked: true });
}));
router.post('/devices/:deviceId/heartbeat', asyncHandler(async (req,res) => send(res, await heartbeat({ ...actor(req), deviceId: req.params.deviceId, sessionId: req.body?.sessionId, state: req.body?.state }))));
router.post('/devices/:deviceId/intervals', asyncHandler(async (req,res) => send(res, await recordInterval({ ...actor(req), deviceId: req.params.deviceId, payload: req.body }))));
router.post('/devices/:deviceId/screenshots/prepare', asyncHandler(async (req,res) => send(res, await prepareScreenshot({ ...actor(req), deviceId: req.params.deviceId, intervalId: req.body?.intervalId, image: req.body?.image }))));
router.post('/devices/:deviceId/screenshots/:screenshotId/complete', asyncHandler(async (req,res) => send(res, { _id: (await completeScreenshot({ ...actor(req), ...req.params }))._id })));
router.post('/devices/:deviceId/screenshots/:screenshotId/retry',asyncHandler(async(req,res)=>send(res,await retryScreenshot({...actor(req),...req.params}))));

router.get('/reports', asyncHandler(async (req,res) => {
  const ctx = await contextFor(req.workspaceId, req.user.id);
  const { fromDate, toDate, userId, team, cursor } = req.query;
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) fail('Invalid report dates');
  if (userId) objectId(userId);
  if (team === 'true' && !can(ctx, 'tracking.view_reports')) fail('Team report permission required', 403);
  const filter = { workspaceId: req.workspaceId, ...(team === 'true' && !userId ? {} : { user: userId || req.user.id }),
    ...(fromDate || toDate ? { workDateKey: { ...(fromDate ? { $gte: fromDate } : {}), ...(toDate ? { $lte: toDate } : {}) } } : {}),
    ...(cursor ? { _id: { $lt: objectId(cursor) } } : {}) };
  const sf=segmentFilter(req.query);if(Object.keys(sf).length)filter.segments={$elemMatch:sf};
  const candidates = await WorkSession.find(filter).sort({ _id: -1 }).limit(50).lean();
  const data = [];
  for (let session of candidates) {
    try { await authorizeRecord(ctx, session); } catch (e) { if (e.statusCode === 404 && !userId) continue; throw e; }
    session = await reconcileSession(session._id);
    const attendance = await AttendanceSession.findById(session.attendanceSession).lean();
    const day = attendance ? await AttendanceDay.findById(attendance.attendanceDay).select('presenceState attendanceStatus workedMinutes').lean() : null;
    const officeEnd = attendance?.checkOutAt || (attendance?.status === 'ACTIVE' ? new Date(Math.min(Date.now(), attendance.missedCheckoutCutoffAt ? +new Date(attendance.missedCheckoutCutoffAt) : Infinity)) : null);
    const subject=await User.findById(session.user).select('name').lean();
    const filtered={...session,segments:session.segments.filter(s=>matchesSegment(s,req.query))};
    data.push({ ...filtered, userName:subject?.name || 'Former member', totals: summarize(filtered), attendance: { status: attendance?.status, day,
      checkInAt: attendance?.checkInAt, checkOutAt: attendance?.checkOutAt,
      measuredOfficeSeconds: officeEnd ? Math.max(0,(+new Date(officeEnd) - +new Date(attendance.checkInAt))/1000) : null } });
  }
  const workspace = await Workspace.findById(req.workspaceId).select('timezone').lean();
  send(res, { workspaceId:req.workspaceId,sessions: data, timezone: workspace?.timezone || 'UTC', nextCursor: candidates.length === 50 ? id(candidates.at(-1)._id) : null });
}));
router.get('/sessions/:sessionId/timeline', asyncHandler(async (req,res) => {
  const ctx = await contextFor(req.workspaceId, req.user.id), session = await WorkSession.findById(objectId(req.params.sessionId)).lean();
  await authorizeRecord(ctx, session);
  segmentFilter(req.query);
  const segments=session.segments.filter(s=>matchesSegment(s,req.query));
  const overlap=segments.map(s=>({startedAt:{$lt:s.endedAt||new Date()},endedAt:{$gt:s.startedAt}}));
  const segmentBounds=overlap.length?{$or:overlap}:{_id:{$in:[]}};
  const scope=await historicalDepartmentScope(req.workspaceId,req.user.id,session.user);
  const history=scope===null?{}:{departmentIdsAtCapture:{$in:scope}};
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && !Number.isFinite(+before)) fail('Invalid timeline cursor');
  const validExpiry={$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]};
  const cutoff=new Date(0);
  const intervals = await ActivityInterval.find({ ...history,...segmentBounds,$and:[validExpiry],session: session._id, endedAt: { $gte:cutoff,...(before?{$lt:before}:{}) } }).sort({ endedAt: -1 }).limit(100).select('-digest').lean();
  let screenshots = [];
  try { await authorizeRecord(ctx, session, 'tracking.view_screenshots');
    screenshots = await TrackingScreenshot.find({ ...history,...validExpiry,session: session._id, interval: { $in: intervals.map(i => i._id) }, status: {$ne:'DELETED'} }).select('_id interval displayId capturedAt width height blurred uploadStatus status').lean();
  } catch (e) { if (e.statusCode !== 404) throw e; }
  const allCoverage=await ActivityInterval.find({...history,...segmentBounds,$and:[validExpiry],session:session._id,endedAt:{$gte:cutoff}}).lean();
  const imageStates=await TrackingScreenshot.find({...history,...validExpiry,session:session._id,interval:{$in:allCoverage.map(i=>i._id)},status:{$ne:'DELETED'}}).select('interval status displayId').lean();
  const contexts=intervals.map(interval=>({...interval,contexts:session.segments.filter(s=>+new Date(s.startedAt)<+new Date(interval.endedAt)&&(!s.endedAt||+new Date(s.endedAt)>+new Date(interval.startedAt))).map(s=>({segmentId:s._id,title:s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle}`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName} / ${s.taskTitle||'Individual'}`,origin:s.agenda?`${s.agendaTitle} — ${s.description}`:null,task:s.attributedTask||s.task,attributedAt:s.attributedAt}))}));
  const fullyCovered=allCoverage.filter(i=>overlapSeconds(i.startedAt,i.endedAt,segments)>=(+i.endedAt-+i.startedAt)/1000-0.001);
  send(res, { intervals:contexts, screenshots, evidence:summarizeEvidence(fullyCovered,imageStates), coverageGaps:coverageGaps(segments,allCoverage), nextBefore: intervals.length === 100 ? intervals.at(-1).endedAt : null });
}));
router.get('/storage-health',asyncHandler(async(req,res)=>{
  await requireTrackingAdmin(req.workspaceId,req.user.id);
  send(res,await storageHealth());
}));
router.get('/screenshots/:screenshotId/content', asyncHandler(async (req,res) => {
  const ctx = await contextFor(req.workspaceId, req.user.id);
  let screenshot = await TrackingScreenshot.findOne({ _id: objectId(req.params.screenshotId), status: 'READY', $or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}] }).lean();
  if (!screenshot) fail('Screenshot not found', 404);
  const session=await WorkSession.findById(screenshot.session).lean();
  await authorizeRecord(ctx, session?{...session,departmentIdsAtStart:screenshot.departmentIdsAtCapture}:null, 'tracking.view_screenshots');
  await audit(req, 'TRACKING_SCREENSHOT_VIEWED', 'TrackingScreenshot', screenshot._id);
  if(screenshot.storageProvider!=='cloudflare-r2')screenshot=await migrateLegacyScreenshot(screenshot);
  const bytes=await readPrivateScreenshot(screenshot);
  // Recheck after storage IO in case departments/role changed during fetch.
  const fresh=await contextFor(req.workspaceId,req.user.id);
  await authorizeRecord(fresh,session?{...session,departmentIdsAtStart:screenshot.departmentIdsAtCapture}:null,'tracking.view_screenshots');
  res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Content-Type':screenshot.mimeType||'image/webp','Content-Length':String(bytes.length)});res.send(bytes);
}));
export default router;

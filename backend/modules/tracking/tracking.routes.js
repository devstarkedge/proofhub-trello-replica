import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { id } from '../../authz/engine.js';
import { can } from './tracking.authorization.js';
import User from '../../models/User.js';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import '../../realtime/emitters.js';
import { WorkSession } from './tracking.models.js';
import { currentState, changeWork, workOptions, contextFor, fail, objectId, createWorkTask, authorizeRecord, policyFor, publicWorkSession } from './tracking.service.js';
import { registerDevice, acceptMonitoringNotice, releaseDevice, heartbeat, recordInterval, prepareScreenshot, completeScreenshot, retryScreenshot } from './tracking.device.js';
import { storageHealth } from './tracking.storage.js';
import {gallery,screenshotDetails,screenshotContent} from './tracking.gallery.js';
import {readVisibilityScope} from './tracking.visibility.js';
import {updateSettings,requireTrackingAdmin,listAgendas,createAgenda} from './tracking.settings.js';
import {dashboard} from './tracking.dashboard.js';
import {readTrackingReports,readTrackingTimeline,readTrackingReportPreviews} from './tracking.reportRead.js';

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
router.get('/options', asyncHandler(async (req,res) => {res.set('Cache-Control','private, no-store');send(res, await workOptions(req.workspaceId, req.user.id, req.query.projectId,req.query));}));
router.get('/agendas',asyncHandler(async(req,res)=>send(res,await listAgendas(req.workspaceId,req.user.id))));
router.get('/dashboard',asyncHandler(async(req,res)=>{
  const started=performance.now();
  try{const result=await dashboard(req.workspaceId,req.user.id,req.query);res.set({'Cache-Control':'private, no-store','Server-Timing':`tracking-dashboard;dur=${Math.round(performance.now()-started)}`});send(res,result);}
  catch(error){if(error.code===50||error.codeName==='MaxTimeMSExpired')fail('Tracking data is taking longer than expected. Narrow the date range or retry.',503,'TRACKING_READ_TIMEOUT');throw error;}
}));
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
  const scope=await readVisibilityScope(ctx),permitted=scope.members.filter(m=>scope.canOwner(m.user));
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
  const work=await changeWork({ ...actor(req), action: req.params.action, selection, operationId, expectedRevision });
  const session=publicWorkSession(work);
  send(res,{...session,session,workspaceId:req.workspaceId,userId:String(req.user.id),operationId,serverNow:new Date()});
}));
router.get('/work/operations/:operationId',asyncHandler(async(req,res)=>{
  await contextFor(req.workspaceId,req.user.id,{includeProjects:false});
  if(!/^[\w-]{8,128}$/.test(req.params.operationId))fail('Invalid operation ID');
  const work=await WorkSession.findOne({workspaceId:req.workspaceId,user:req.user.id,...(req.query.sessionId?{_id:objectId(req.query.sessionId)}:{}),'operations.id':req.params.operationId}).select('-operations -audit').lean();
  res.set('Cache-Control','no-store');send(res,{workspaceId:req.workspaceId,userId:String(req.user.id),committed:Boolean(work),session:publicWorkSession(work),serverNow:new Date()});
}));
router.get('/policy', asyncHandler(async (req,res) => { await contextFor(req.workspaceId, req.user.id); send(res, await policyFor(req.workspaceId)); }));
router.put('/policy', asyncHandler(async (req,res) => {
  const data=await updateSettings(req.workspaceId,req.user.id,req.body||{},storageHealth);
  await audit(req, 'TRACKING_POLICY_UPDATED', 'TrackingPolicy', data._id, { revision: data.revision });
  send(res, data);
}));
router.post('/devices/register', asyncHandler(async (req,res) => {
  if(req.get('origin'))fail('Register devices in the FlowTask desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
  send(res,await registerDevice({...req.body,...actor(req)}));
}));
router.put('/devices/:deviceId/preferences', asyncHandler(async (req,res) => {
  fail('Desktop capture settings are controlled by workspace Admin. Update the desktop app to review its monitoring notice.',410,'WORKSPACE_CONTROLLED');
}));
router.post('/devices/:deviceId/notice',asyncHandler(async(req,res)=>{
  if(req.get('origin'))fail('Approve device access in the FlowTask desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
  const data=await acceptMonitoringNotice({...actor(req),deviceId:req.params.deviceId,noticeVersion:req.body?.noticeVersion,policyRevision:req.body?.policyRevision,noticeAuthorization:req.get('x-desktop-notice-authorization')});
  await audit(req,'TRACKING_NOTICE_ACCEPTED','TrackingDevice',data._id,{noticeVersion:data.noticeVersion,policyRevision:data.consentRevision});
  send(res, data);
}));
router.post('/devices/:deviceId/release',asyncHandler(async(req,res)=>send(res,await releaseDevice({...actor(req),deviceId:req.params.deviceId}))));
router.post('/devices/:deviceId/revoke', asyncHandler(async (req,res) => {
  await requireTrackingAdmin(req.workspaceId, req.user.id);
  await releaseDevice({...actor(req),deviceId:req.params.deviceId,revoke:true});
  await audit(req, 'TRACKING_DEVICE_REVOKED', 'TrackingDevice', req.params.deviceId); send(res, { revoked: true });
}));
router.post('/devices/:deviceId/heartbeat', asyncHandler(async (req,res) => send(res, await heartbeat({ ...actor(req), deviceId: req.params.deviceId, sessionId: req.body?.sessionId, state: req.body?.state }))));
router.post('/devices/:deviceId/claim',asyncHandler(async(req,res)=>{
  if(req.get('origin'))fail('Switch monitoring in the FlowTask desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
  const result=await heartbeat({...actor(req),deviceId:req.params.deviceId,sessionId:req.body?.sessionId,state:'connected',takeover:true,noticeAuthorization:req.get('x-desktop-notice-authorization')});
  await audit(req,'TRACKING_MONITORING_DEVICE_CLAIMED','TrackingDevice',req.params.deviceId,{sessionId:String(result.session._id),previousDeviceId:result.transferredFrom});
  send(res,result);
}));
router.post('/devices/:deviceId/intervals', asyncHandler(async (req,res) => send(res, await recordInterval({ ...actor(req), deviceId: req.params.deviceId, payload: req.body }))));
router.post('/devices/:deviceId/screenshots/prepare', asyncHandler(async (req,res) => send(res, await prepareScreenshot({ ...actor(req), deviceId: req.params.deviceId, intervalId: req.body?.intervalId, image: req.body?.image }))));
router.post('/devices/:deviceId/screenshots/:screenshotId/complete', asyncHandler(async (req,res) => {
  const screenshot=await completeScreenshot({ ...actor(req), ...req.params });
  // The durable desktop queue only releases bytes after this explicit receipt.
  // Keep _id for older clients; never expose storage credentials or object keys.
  send(res,{_id:screenshot._id,status:screenshot.status,uploadStatus:screenshot.uploadStatus,checksum:screenshot.checksum,uploadedAt:screenshot.uploadedAt});
}));
router.post('/devices/:deviceId/screenshots/:screenshotId/retry',asyncHandler(async(req,res)=>send(res,await retryScreenshot({...actor(req),...req.params}))));

router.get('/reports', asyncHandler(async (req,res) => {
  res.setHeader('Cache-Control','private, no-store');
  const started=performance.now();
  const result=await readTrackingReports(req.workspaceId,req.user.id,req.query);
  res.setHeader('Server-Timing',`tracking-report;dur=${(performance.now()-started).toFixed(1)}`);
  send(res,result);
}));
router.get('/reports/previews',asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  send(res,await readTrackingReportPreviews(req.workspaceId,req.user.id,req.query));
}));
router.get('/sessions/:sessionId/history',asyncHandler(async(req,res)=>{
  const ctx=await contextFor(req.workspaceId,req.user.id),session=await WorkSession.findById(objectId(req.params.sessionId)).select('-operations -audit').lean();
  await authorizeRecord(ctx,session);const offset=Number(req.query.offset||0);
  if(!Number.isInteger(offset)||offset<0||!Number.isSafeInteger(offset))fail('Invalid history offset');
  const row=await WorkSession.findById(session._id).select({audit:{$slice:[offset,51]}}).lean();
  send(res,{events:row.audit.slice(0,50),nextOffset:row.audit.length>50?offset+50:null});
}));
router.get('/sessions/:sessionId/timeline', asyncHandler(async (req,res) => {
  res.setHeader('Cache-Control','private, no-store');
  send(res,await readTrackingTimeline(req.workspaceId,req.user.id,req.params.sessionId,req.query));
}));
router.get('/storage-health',asyncHandler(async(req,res)=>{
  await requireTrackingAdmin(req.workspaceId,req.user.id);
  send(res,await storageHealth());
}));
router.get('/screenshots',asyncHandler(async(req,res)=>send(res,await gallery(req.workspaceId,req.user.id,req.query))));
router.get('/screenshots/:screenshotId/details',asyncHandler(async(req,res)=>{
  const result=await screenshotDetails(req.workspaceId,req.user.id,req.params.screenshotId);
  await audit(req,'TRACKING_SCREENSHOT_VIEWED','TrackingScreenshot',req.params.screenshotId,{kind:'details'});
  res.set('Cache-Control','private, no-store');send(res,result);
}));
for(const kind of ['content','thumbnail'])router.get(`/screenshots/:screenshotId/${kind}`,asyncHandler(async(req,res)=>{
  // The thumbnail endpoint is a compatibility alias; both deliver one object.
  const {bytes,mimeType,width,height,etag,authorizedUntil,notModified}=await screenshotContent(req.workspaceId,req.user.id,req.params.screenshotId,{ifNoneMatch:req.get('If-None-Match'),credentialExpiresAt:req.authExpiresAt});
  await audit(req,'TRACKING_SCREENSHOT_VIEWED','TrackingScreenshot',req.params.screenshotId,{kind});
  if(width&&height)res.set({'X-Image-Width':String(width),'X-Image-Height':String(height)});
  res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','ETag':etag,'X-Screenshot-Authorized-Until':String(authorizedUntil)});
  res.vary('Authorization').vary('x-workspace-id');
  if(notModified){res.status(304).end();return;}
  res.set({'Content-Type':mimeType,'Content-Length':String(bytes.length)});res.send(bytes);
}));
export default router;

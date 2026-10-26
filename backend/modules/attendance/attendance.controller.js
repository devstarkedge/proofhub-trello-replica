import { getCheckoutPreview } from './attendanceCheckout.service.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { getTodayStatus, checkIn, checkOut } from './attendance.service.js';
import { updateModuleSettings } from '../hubspot/workspaceModules.js';
import {policyFor,changeWork} from '../tracking/tracking.service.js';
import {WorkSession} from '../tracking/tracking.models.js';

/**
 * `req.user` already carries the active-workspace membership's role/
 * department flattened onto it (see authMiddleware.js) — protect() would
 * have already rejected the request if that membership weren't active, so
 * reconstructing this shape here needs no extra query.
 */
function membershipFromReq(req) {
  return { role: req.user.role, roleId: req.user.roleId, department: req.user.department, status: 'active' };
}

/** attendance.service.js needs the real Workspace doc (attendanceModuleEnabled + timezone), not just the bare id protect() attaches. */
async function loadWorkspace(req) {
  return Workspace.findById(req.workspaceId).select('attendanceModuleEnabled timezone').lean();
}

export const setup = asyncHandler(async (req, res) => {
  await updateModuleSettings(req.workspaceId, req.user.id, { attendance: true });
  const result = { attendanceModuleEnabled: true };
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_MODULE_SETUP', targetType: 'Workspace', targetId: req.workspaceId,
    resourceLabel: 'Attendance Module Setup', summary: `${req.user.name} enabled the Attendance module for this workspace`,
    before: null, after: result, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

export const getMyTodayStatus = asyncHandler(async (req, res) => {
  const workspace = await loadWorkspace(req);
  const status = await getTodayStatus({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req), workspace
  });
  res.set('Cache-Control','private, no-store');
  res.json({ success: true, data: { ...status,workspaceId:req.workspaceId,userId:String(req.user.id),serverNow:new Date() } });
});

export const postCheckIn = asyncHandler(async (req, res) => {
  const { coordinates, reportedAccuracyMeters, capturedAt, requestedWorkMode } = req.body || {};
  const gps = coordinates ? { coordinates, reportedAccuracyMeters, capturedAt: capturedAt ? new Date(capturedAt) : new Date() } : null;
  const idempotencyKey = req.body?.idempotencyKey || req.get('Idempotency-Key') || null;
  const workspace = await loadWorkspace(req);

  const result = await checkIn({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req),
    workspace, gps, idempotencyKey, ipAddress: req.ip, requestedWorkMode: requestedWorkMode || null, actorName: req.user.name, workSelection: null
  });

  if (!result.replay) {
    await recordAuditLog({
      actor: req.user, action: 'ATTENDANCE_CHECKED_IN', targetType: 'AttendanceSession', targetId: result.session._id,
      resourceLabel: `Attendance check-in: ${req.user.name}`, summary: `${req.user.name} checked in`,
      before: null, after: { workMode: result.session.checkIn.workMode, workDateKey: result.session.workDateKey },
      category: 'attendance_management', meta: { workspaceId: req.workspaceId }
    });
  }
  let trackingStartup=null;
  if(req.body?.workSelection&&req.body.workSelection.mode!=='ATTENDANCE_ONLY'&&(await policyFor(req.workspaceId)).enabled){
    try{const work=await WorkSession.findOne({workspaceId:req.workspaceId,attendanceSession:result.session._id}).select('_id status').lean();if(!work)await changeWork({workspaceId:req.workspaceId,userId:req.user.id,action:'start',selection:req.body.workSelection,operationId:`checkin-${result.session._id}`,expectedRevision:null});trackingStartup={state:work?.status||'RUNNING'};}
    catch(error){trackingStartup={state:'FAILED',message:error.message,retryable:true};}
  }
  res.status(result.replay ? 200 : 201).json({ success: true, data: result.session, replay: result.replay,trackingStartup,serverNow:new Date() });
});

export const previewCheckOut = asyncHandler(async (req,res) => {
  const workspace=await loadWorkspace(req);
  const data=await getCheckoutPreview({workspaceId:req.workspaceId,userId:req.user.id,membership:membershipFromReq(req),workspace});
  res.set('Cache-Control','no-store');res.json({success:true,data});
});

export const postCheckOut = asyncHandler(async (req, res) => {
  const { coordinates, reportedAccuracyMeters, capturedAt } = req.body || {};
  const gps = coordinates ? { coordinates, reportedAccuracyMeters, capturedAt: capturedAt ? new Date(capturedAt) : new Date() } : null;
  const workspace = await loadWorkspace(req);

  const result = await checkOut({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req),
    workspace, gps, ipAddress: req.ip, actorName: req.user.name, attendanceSessionId:req.body?.attendanceSessionId, operationId:req.body?.operationId, previewToken:req.body?.previewToken
  });

  res.json({ success: true, data: result.session, replay: result.replay, summary:result.summary,serverNow:new Date() });
});

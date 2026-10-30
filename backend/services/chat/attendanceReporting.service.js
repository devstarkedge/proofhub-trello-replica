import crypto from 'node:crypto';
import axios from 'axios';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import AttendanceEvent from '../../modules/attendance/attendanceEvent.model.js';
import { WorkSession, TrackingScreenshot } from '../../modules/tracking/tracking.models.js';
import AttendanceSession from '../../modules/attendance/attendanceSession.model.js';
import AttendanceDay from '../../modules/attendance/attendanceDay.model.js';
import { transitionSnapshot, dailyWorkSummary } from './attendanceReporting.payload.js';
import { resolveFlowTaskAccessSnapshot } from './flowTaskAccessService.js';
import { resolveWorkspaceChatSettings } from './webhookDispatcher.js';
import logger from '../../utils/logger.js';
import ReportingDirectoryState from './ReportingDirectoryState.js';
import Role from '../../models/Role.js';
import PermissionOverride from '../../models/PermissionOverride.js';
import AccessOverride from '../../models/AccessOverride.js';
import { resolveResourceAccess } from '../../modules/permissions/permissionEngine.js';
import { buildContext, contextFromRecords } from '../../authz/context.js';
import { can } from '../../authz/engine.js';
import { getWorkspaceTimezone } from '../../modules/leave/leaveTimezone.util.js';
import Card from '../../models/Card.js';
import { TaskAssignmentEvent } from '../../modules/tracking/tracking.models.js';
import { run } from '../../modules/workspaces/workspaceContext.js';
import { processLeaveReporting } from './leaveReporting.service.js';
import { resolveLeaveAccessScope } from '../../modules/leave/leaveAuthorization.service.js';
import { reportingRetry, isWorkspaceMappingUnavailable } from './reportingRetry.js';

async function reportingWorkSessions(workspaceId, userId, workDateKey, dbSession = null) {
  const sessions = await WorkSession.find({ workspaceId, user: userId, workDateKey }).session(dbSession).lean();
  const ids = [...new Set(sessions.filter(s => s.includePreAssignment).flatMap(s => s.segments.map(v => v.linkedTask)).filter(Boolean).map(String))];
  if (!ids.length) return sessions;
  const tasks = await Card.find({ workspaceId, _id: { $in: ids } }).select('_id title').session(dbSession).lean();
  const names = new Map(tasks.map(t => [String(t._id), t.title]));
  const missing = ids.filter(id => !names.has(id));
  if (missing.length) for (const event of await TaskAssignmentEvent.find({ workspaceId, task: { $in: missing } }).select('task taskTitle').sort({ at: -1 }).session(dbSession).lean()) {
    if (!names.has(String(event.task))) names.set(String(event.task), event.taskTitle);
  }
  for (const session of sessions) for (const segment of session.segments) if (segment.linkedTask) segment.linkedTaskTitle = names.get(String(segment.linkedTask)) || '';
  return sessions;
}

export async function enqueueAttendanceReport({ action, attendance, work = null, before = null, at, day = null, dbSession }) {
  // Historical attribution alone is not a new running-work transition.
  if (action === 'link' && (work?.status !== 'RUNNING' || +new Date(work.segments.at(-1)?.startedAt) !== +new Date(at))) return;
  const workspaceId = attendance.workspaceId, userId = attendance.user;
  const member = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active' }).session(dbSession).lean();
  if (!member) return;
  const departments = await Department.find({ workspaceId, _id: { $in: member.departments ?? member.department ?? [] }, isActive: true }).select('_id name').session(dbSession).lean();
  const user = await User.findById(userId).select('name').session(dbSession).lean();
  const workspace = await Workspace.findById(workspaceId).select('timezone').session(dbSession).lean();
  const key = action === 'checkout' || action === 'checkin' ? `report-${action}-${attendance._id}` : `report-work-${work._id}-${work.revision}`;
  const sessions = action === 'checkout' ? await reportingWorkSessions(workspaceId, userId, attendance.workDateKey, dbSession) : [];
  const attendanceRows = action === 'checkout' ? await AttendanceSession.find({ workspaceId, user: userId, workDateKey: attendance.workDateKey }).session(dbSession).lean() : [];
  const initial = action === 'checkin' ? null : await AttendanceEvent.findOne({ key: `report-checkin-${attendance._id}` }).session(dbSession).select('reportPayload').lean();
  const payload = { ...transitionSnapshot({ action, attendance, work, before, at, day, sessions, attendanceRows }),
    presentationVersion: 2, eventSequence: action === 'checkin' ? 0 : action === 'checkout' ? 1e9 : work.revision + 1,
    ...(initial ? { initialCheckIn: initial.reportPayload } : {}),
    eventId: key, workspaceId: String(workspaceId), timezone: getWorkspaceTimezone(workspace),
    employee: { flowTaskUserId: String(userId), name: user?.name || 'Employee' },
    departments: departments.map(d => ({ id: String(d._id), name: d.name })) };
  // workspaceScopePlugin supplies the tenant predicate. Repeating it in an
  // upsert filter makes MongoDB's insert inference reject the operation.
  await AttendanceEvent.findOneAndUpdate({ key }, { $setOnInsert: {
    workspaceId, key, kind: 'CHAT_REPORT', user: userId, attendanceSession: attendance._id,
    workDateKey: attendance.workDateKey, reportOrder: action === 'checkin' ? 0 : action === 'checkout' ? 1e9 : work.revision + 1, reportPayload: payload,
  } }, { upsert: true, new: true, session: dbSession, runValidators: true });
}

// The existing signed webhook endpoint is an authenticated server-to-server
// messaging API. A fresh signature is generated for every retry, preserving
// the original business event ID through timeouts and backend restarts.
export async function deliverReportingPayload(payload, settings) {
  if (!process.env.FLOWTASK_WEBHOOK_SECRET) throw new Error('FlowTask reporting signing secret is missing');
  const body = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', process.env.FLOWTASK_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  const response = await axios.post(settings.webhookUrl, body, { timeout: 10000, transformRequest: [data => data], headers: {
    'Content-Type': 'application/json', 'X-FlowTask-Timestamp': timestamp, 'X-FlowTask-Signature': signature,
    'X-FlowTask-Delivery-Id': payload.eventId, 'X-FlowTask-Event': payload.eventType, 'X-FlowTask-Workspace': payload.workspaceId,
  } });
  if (!response.data?.success || !['processed', 'duplicate'].includes(response.data.status)) throw new Error('ChatApp has not confirmed durable reporting delivery');
}

// Directory data travels on the same verified API as business reports. Runs
// once per maintenance cycle, never once per report. Every cycle also repairs
// missed hooks; the durable fingerprint survives restarts and worker changes.
export async function syncReportingDirectory(workspaceId, settings, state) {
  const departments = await Department.find({ workspaceId }).select('_id name isActive managers members').sort('_id').lean();
  const members = await WorkspaceMembership.find({ workspace: workspaceId }).select('user status role roleId department departments kind').sort('_id').lean();
  const users = await User.find({ _id: { $in: members.map(m => m.user) } }).select('_id name isActive').lean();
  const roles = await Role.find({ $or: [{ workspaceId }, { isSystem: true }] }).select('_id workspaceId slug isSystem grants denies permissions isActive').sort('_id').lean();
  const workspace = await Workspace.findById(workspaceId).select('isActive status authzVersion').lean();
  const overrides = await PermissionOverride.find({ workspace: workspaceId }).select('user permission effect scope scopeIds expiresAt status').sort('_id').lean();
  const legacyOverrides = await AccessOverride.find({ workspace: workspaceId, resource: { $in: ['attendance', 'tracking', 'leave'] } }).select('user resource effect actions scope scopedResourceIds expiresAt isActive').sort('_id').lean();
  const hash = crypto.createHash('sha256').update(JSON.stringify([3, workspace, departments, members, users, roles, overrides, legacyOverrides,
    [...overrides, ...legacyOverrides].filter(o => o.expiresAt && +new Date(o.expiresAt) <= Date.now()).map(o => String(o._id))])).digest('hex');
  if (!state.dirty && state.fingerprint === hash && Date.now() - +new Date(state.syncedAt || 0) < 300000) return;
  const reconcile = !state.syncedAt || Date.now() - +new Date(state.syncedAt) >= 300000;
  state = await ReportingDirectoryState.findOneAndUpdate({ workspaceId, leaseToken: state.leaseToken }, { $inc: { revision: 1 } }, { new: true }).lean();
  if (!state) throw new Error('Reporting directory lease expired');
  const send = async data => {
    const renewed = await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: state.leaseToken }, { $set: { leaseUntil: new Date(Date.now() + 120000) } });
    if (!renewed.matchedCount) throw new Error('Reporting directory lease was lost');
    return deliverReportingPayload({ ...data, directoryVersion: state.revision, reconcile }, settings);
  };
  // Member-specific snapshots avoid a huge request and reuse verified user IDs.
  // The persisted directory version fences stale/reordered updates.
  for (const department of departments) await send({ eventType: 'reporting.department_synced',
    eventId: `report-department-${department._id}-${hash}`, workspaceId: String(workspaceId),
    department: { id: String(department._id), name: department.name, active: department.isActive !== false },
  });
  const ids = departments.map(d => String(d._id));
  await send({ eventType: 'reporting.departments_reconciled', eventId: `report-departments-${hash}`,
    workspaceId: String(workspaceId), departmentIds: ids });
  for (const member of members) {
    const user = users.find(u => String(u._id) === String(member.user));
    const access = await resolveFlowTaskAccessSnapshot(member.user, workspaceId);
    const active = member.status === 'active' && user?.isActive !== false;
    let ctx = active ? await buildContext(member.user, workspaceId, { allowLegacy: process.env.AUTHZ_V2 !== 'enforce', includeRecords: true }) : null;
    const role = ctx?.resolvedRecords?.role || (active && !member.roleId ? await Role.findResolvable(member.role, workspaceId).lean() : null);
    if (ctx && role && !ctx.resolvedRecords.role) ctx = contextFromRecords({ ...ctx.resolvedRecords, role, userId: member.user,
      overrides: overrides.filter(o => String(o.user) === String(member.user)), allowLegacy: process.env.AUTHZ_V2 !== 'enforce' });
    const validRole = role?.isActive !== false && (!role?.workspaceId || String(role.workspaceId) === String(workspaceId));
    const systemRole = validRole && role?.isSystem ? role.slug : null;
    const allDepartments = active && ctx?.status === 'active' && ctx?.kind !== 'guest' && ['admin', 'hr'].includes(systemRole);
    const assigned = new Set((member.departments ?? member.department ?? []).map(String));
    if (systemRole === 'manager') for (const d of departments) if ((d.managers || []).some(u => String(u) === String(member.user))) assigned.add(String(d._id));
    let legacyReportGrant = false, legacyReportDenied = false;
    if (active && !systemRole && process.env.AUTHZ_V2 !== 'enforce') {
      const principal = { ...member, _id: member.user, workspaceId };
      const access = await Promise.all(['attendance', 'tracking'].map(resource => resolveResourceAccess(principal, resource, workspaceId)));
      legacyReportDenied = access.some(resource => resource.source === 'deny-override');
      legacyReportGrant = access.some(resource => resource.source === 'override' && resource.scope === 'full' && (resource.actions.view_workspace || resource.actions.view_reports));
    }
    const allowed = departments.filter(d => ctx?.status === 'active' && ctx?.kind !== 'guest' && d.isActive !== false && (allDepartments || assigned.has(String(d._id)) ||
      !systemRole && !legacyReportDenied && (legacyReportGrant || ctx && ['attendance.view_reports', 'attendance.view_workspace', 'tracking.view_reports'].some(p => can(ctx, p, { workspaceId, departments: [String(d._id)] }))))).map(d => String(d._id));
    const leaveScope = active ? await resolveLeaveAccessScope({ viewer: { _id: member.user }, workspaceId, includeEmployees: true }) : null;
    await send({ eventType: 'reporting.member_synced', eventId: `report-member-${member.user}-${hash}`,
      workspaceId: String(workspaceId), employee: { flowTaskUserId: String(member.user), name: user?.name || 'Employee' },
      active, access, reportingAccess: { active, departmentIds: allowed, allDepartments: !!allDepartments,
        leaveScope: { role: access?.role, memberDepartments: access?.departmentIds || [],
          allUsers: systemRole !== 'employee' && (['admin', 'hr'].includes(systemRole) || leaveScope?.scope === 'workspace'),
          employeeIds: systemRole === 'employee' ? [] : (leaveScope?.employeeIds || []).map(String) },
        historyAdmin: active && ctx?.status === 'active' && ctx?.kind !== 'guest' && systemRole === 'admin' },
    });
  }
  await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: state.leaseToken }, { $set: { fingerprint: hash, syncedAt: new Date(), dirty: false } });
}

export async function processAttendanceReports(workspaceId, options = {}) {
  if (!workspaceId) throw new Error('Reporting requires an explicit workspace');
  return run({ workspaceId }, () => processScopedAttendanceReports(workspaceId, options));
}
async function processScopedAttendanceReports(workspaceId, { limit = 20 } = {}) {
  const settings = await resolveWorkspaceChatSettings(workspaceId, { requireLinkedWorkspace: true });
  if (!settings.enabled || !settings.webhookUrl || !process.env.FLOWTASK_WEBHOOK_SECRET) return;
  try { await ReportingDirectoryState.updateOne({}, { $setOnInsert: { workspaceId } }, { upsert: true, runValidators: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const token = crypto.randomUUID();
  const now = new Date();
  const state = await ReportingDirectoryState.findOneAndUpdate({ workspaceId, leaseUntil: { $lte: now },
    $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }] },
    { $set: { leaseToken: token, leaseUntil: new Date(Date.now() + 120000) } }, { new: true }).lean();
  if (!state) return;
  try {
  await syncReportingDirectory(workspaceId, settings, state);
  try { await processLeaveReporting(workspaceId, settings, deliverReportingPayload, new Date(), async () => {
    const renewed = await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: { leaseUntil: new Date(Date.now() + 120000) } });
    if (!renewed.matchedCount) throw new Error('Leave reporting lease was lost');
  }); } catch (error) {
    if (isWorkspaceMappingUnavailable(error)) throw error;
    logger.warn('Leave reporting will retry independently', { workspaceId: String(workspaceId), error: error.message });
  }
  await reconcileReportingHistoryReports(workspaceId);
  await reconcileCheckoutReports(workspaceId);
  const blocked = [];
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const event = await AttendanceEvent.findOneAndUpdate({ workspaceId, kind: 'CHAT_REPORT', processedAt: null,
      attendanceSession: { $nin: blocked }, availableAt: { $lte: now }, claimedUntil: { $lte: now } },
    { $set: { claimedUntil: new Date(+now + 60000) }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1, reportOrder: 1 } }).lean();
    if (!event) break;
    const lease = { _id: event._id, workspaceId, attempts: event.attempts };
    const renewed = await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: { leaseUntil: new Date(Date.now() + 120000) } });
    if (!renewed.matchedCount) throw new Error('Reporting delivery lease was lost');
    const prior = await AttendanceEvent.exists({ workspaceId, kind: 'CHAT_REPORT', attendanceSession: event.attendanceSession,
      processedAt: null, reportOrder: { $lt: event.reportOrder } });
    if (prior) { blocked.push(event.attendanceSession); await AttendanceEvent.updateOne(lease, { $set: { claimedUntil: new Date(0) } }); continue; }
    try {
      await deliverReportingPayload(event.reportPayload, settings);
      await AttendanceEvent.updateOne(lease, { $set: { processedAt: new Date(), claimedUntil: new Date(0), lastError: '' } });
    } catch (error) {
      blocked.push(event.attendanceSession);
      if (error.response?.status === 403) await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: { dirty: true } });
      await AttendanceEvent.updateOne(lease, { $set: { claimedUntil: new Date(0), lastError: `ChatApp reporting delivery failed (${error.response?.status || error.code || 'network'})`,
        availableAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** Math.min(event.attempts, 9))) } });
      logger.warn('Attendance report retained for retry', { eventId: event.key, attempts: event.attempts, status: error.response?.status });
      if (isWorkspaceMappingUnavailable(error)) throw error;
    }
  }
  await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: {
    failureCount: 0, nextAttemptAt: new Date(0), lastFailureCode: '', lastFailureStatus: null,
  } });
  } catch (error) {
    const retry = reportingRetry(error, state);
    await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: retry });
    logger.warn('Attendance reporting worker will retry', { workspaceId: String(workspaceId), error: error.message,
      status: retry.lastFailureStatus, code: retry.lastFailureCode, nextAttemptAt: retry.nextAttemptAt.toISOString() });
  }
  finally { await ReportingDirectoryState.updateOne({ workspaceId, leaseToken: token }, { $set: { leaseUntil: new Date(0) }, $unset: { leaseToken: 1 } }); }
}

// Replay existing durable events once with explicit session associations. This
// changes only the ChatApp projection; source timestamps and event IDs survive.
export async function reconcileReportingHistoryReports(workspaceId) {
  const events = await AttendanceEvent.find({ workspaceId, kind: 'CHAT_REPORT',
    'reportPayload.presentationVersion': { $ne: 2 } }).sort({ _id: 1 }).limit(100).lean();
  for (const event of events) {
    const initial = event.reportPayload.eventType === 'attendance.checked_in' ? null : await AttendanceEvent.findOne({
      workspaceId, key: `report-checkin-${event.attendanceSession}`,
    }).select('reportPayload').lean();
    const payload = { ...event.reportPayload, presentationVersion: 2, eventSequence: event.reportOrder,
      ...(initial ? { initialCheckIn: initial.reportPayload } : {}) };
    await AttendanceEvent.updateOne({ _id: event._id, workspaceId, 'reportPayload.presentationVersion': { $ne: 2 } }, { $set: {
      reportPayload: payload, processedAt: null, availableAt: new Date(), claimedUntil: new Date(0),
    } });
  }
}

// Reconcile the original checkout message rather than emit a second daily
// event when approved leave, attribution, or pending evidence is finalized.
// Original employee and department snapshots remain fixed.
export async function reconcileCheckoutReports(workspaceId) {
  const state = await ReportingDirectoryState.findOne({ workspaceId }).select('checkoutCursor').lean();
  const events = await AttendanceEvent.find({ workspaceId, kind: 'CHAT_REPORT', 'reportPayload.eventType': 'attendance.checked_out',
    ...(state?.checkoutCursor ? { _id: { $gt: state.checkoutCursor } } : {}),
    processedAt: { $ne: null }, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }).sort({ _id: 1 }).limit(100).lean();
  for (const event of events) {
    const original = event.reportPayload;
    const work = await reportingWorkSessions(workspaceId, event.user, event.workDateKey);
    const attendance = await AttendanceSession.find({ workspaceId, user: event.user, workDateKey: event.workDateKey }).lean();
    const day = await AttendanceDay.findOne({ workspaceId, user: event.user, workDateKey: event.workDateKey }).lean();
    if (!day) continue;
    const pending = await TrackingScreenshot.countDocuments({ workspaceId, user: event.user, session: { $in: work.map(w => w._id) }, status: 'PENDING' });
    const outcome = { ...original.outcome, presenceState: day.presenceState, leaveState: day.leaveState,
      provisional: (day.exceptionFlags || []).includes('LEAVE_COVERAGE_UNRESOLVED') };
    if (outcome.presenceState !== original.outcome?.presenceState || outcome.leaveState !== original.outcome?.leaveState) {
      outcome.label = `${day.presenceState.replaceAll('_', ' ')}${day.leaveState !== 'NONE' ? ` · ${day.leaveState.replaceAll('_', ' ')}` : ''}`;
    }
    const next = { ...original, summary: dailyWorkSummary(work, attendance, original.checkOutAt),
      outcome, pendingEvidenceUploads: pending };
    if (JSON.stringify(next) === JSON.stringify(original)) continue;
    next.reportRevision = (original.reportRevision || 1) + 1;
    await AttendanceEvent.updateOne({ _id: event._id, workspaceId, processedAt: event.processedAt }, { $set: {
      reportPayload: next, processedAt: null, availableAt: new Date(), claimedUntil: new Date(0),
    } });
  }
  await ReportingDirectoryState.updateOne({ workspaceId }, { $set: { checkoutCursor: events.length === 100 ? events.at(-1)._id : null } });
}

// Hooks only persist invalidation and request an early drain. The persisted
// source/outbox and the periodic maintenance remain authoritative after crashes.
let requested = new Set();
export async function requestReportingReconciliation(workspaceId, dbSession = null) {
  if (!workspaceId) return;
  return run({ workspaceId }, async () => {
  const settings = await resolveWorkspaceChatSettings(workspaceId, { requireLinkedWorkspace: true });
  if (!settings.enabled || !settings.webhookUrl) return;
  await ReportingDirectoryState.updateOne({}, { $set: { dirty: true }, $setOnInsert: { workspaceId } }, { upsert: true, runValidators: true, session: dbSession });
  if (dbSession?.inTransaction() || process.env.ATTENDANCE_REPORTING_AUTODRAIN === 'false') return;
  const key = String(workspaceId);
  if (requested.has(key)) return;
  requested.add(key);
  setImmediate(async () => {
    try { await processAttendanceReports(workspaceId); }
    catch (error) { logger.warn('Reporting reconciliation scheduled for retry', { workspaceId: key, error: error.message }); }
    finally { requested.delete(key); }
  });
  });
}

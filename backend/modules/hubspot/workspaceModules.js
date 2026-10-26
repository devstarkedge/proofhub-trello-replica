import Workspace from '../../models/Workspace.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import { TrackingPolicy } from '../tracking/tracking.models.js';
import { setupLeaveModule } from '../leave/leaveSetup.service.js';
import { setupAttendanceModule } from '../attendance/attendanceSetup.service.js';
import { requireConfigAdmin } from './configService.js';
import { HubSpotAudit } from './models.js';
import { SyncError } from './domain.js';
import { withHubSpotLock } from './locks.js';

export async function getModuleSettings(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('leaveModuleEnabled attendanceModuleEnabled settings.modules').lean();
  return { leave: workspace?.leaveModuleEnabled === true, attendance: workspace?.attendanceModuleEnabled === true,
    sales: workspace?.settings?.modules?.salesEnabled !== false, finance: workspace?.settings?.modules?.financeEnabled !== false };
}
export async function updateModuleSettings(workspaceId, actorId, change) {
  await requireConfigAdmin(workspaceId, actorId);
  return withHubSpotLock(`modules:${workspaceId}`, () => applyModuleSettings(workspaceId, actorId, change));
}
async function applyModuleSettings(workspaceId, actorId, change) {
  const keys = Object.keys(change);
  if (keys.length !== 1 || !['leave', 'attendance', 'sales', 'finance'].includes(keys[0]) || typeof change[keys[0]] !== 'boolean') throw new SyncError('INVALID_REQUEST', 'Change one supported module at a time.', { status: 400 });
  const key = keys[0], enabled = change[key];
  const current = await getModuleSettings(workspaceId);
  if (current[key] === enabled) return current;
  if (key === 'attendance' && enabled && !current.leave) throw new SyncError('MODULE_DEPENDENCY', 'Enable Leave first to configure the Work Calendar used by Attendance.', { status: 409 });
  if (key === 'leave' && !enabled && current.attendance) throw new SyncError('MODULE_DEPENDENCY', 'Disable Attendance before disabling its Work Calendar dependency.', { status: 409 });
  if (key === 'attendance' && !enabled) {
    const [active, tracking] = await Promise.all([
      AttendanceSession.exists({ workspaceId, status: 'ACTIVE' }),
      TrackingPolicy.exists({ workspaceId, enabled: true }),
    ]);
    if (active || tracking) throw new SyncError('MODULE_IN_USE', 'Close active attendance sessions and disable Time Tracking in its settings before disabling Attendance.', { status: 409 });
  }
  if (['sales', 'finance'].includes(key)) await Workspace.updateOne({ _id: workspaceId }, { $set: { [`settings.modules.${key}Enabled`]: enabled } });
  else if (enabled && key === 'leave') await setupLeaveModule({ workspaceId, actorId });
  else if (enabled) await setupAttendanceModule({ workspaceId });
  else await Workspace.updateOne({ _id: workspaceId }, { $set: { [`${key}ModuleEnabled`]: false } });
  await HubSpotAudit.create({ workspaceId, actorId, action: `module_${key}_${enabled ? 'enabled' : 'disabled'}` });
  return getModuleSettings(workspaceId);
}
export const requireModule = key => async (req, res, next) => {
  try {
    if (!(await getModuleSettings(req.workspaceId))[key]) return res.status(403).json({ success: false, code: 'MODULE_DISABLED', message: `${key[0].toUpperCase() + key.slice(1)} is disabled for this workspace.` });
    next();
  } catch { res.status(503).json({ success: false, message: 'Module availability could not be checked.' }); }
};

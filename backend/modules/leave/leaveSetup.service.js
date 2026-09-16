import Workspace from '../../models/Workspace.js';
import LeaveType from './leaveType.model.js';
import WorkCalendar from './workCalendar.model.js';
import { getOrCreateActiveWorkflow } from './leaveApprovalWorkflow.service.js';

const DEFAULT_LEAVE_TYPES = [
  { key: 'full_day', name: 'Full Day Leave', category: 'STANDARD', supportsHalfDay: true, color: '#3b82f6' },
  { key: 'short_leave', name: 'Short Leave', category: 'SHORT_LEAVE', supportsHalfDay: false, color: '#f59e0b' }
];

/**
 * Idempotent, HR/Admin-triggered "turn on Leave for this workspace" action —
 * deliberately not a global migration/backfill. Every new collection starts
 * empty, so there is nothing to migrate; this just seeds sane, fully-
 * editable defaults (a workspace-wide Mon-Fri WorkCalendar, the standard
 * Full Day + Short Leave types, a default approval workflow) so HR has
 * something to configure from rather than a blank slate. Safe to call
 * repeatedly — every step checks for an existing row before creating one.
 */
export async function setupLeaveModule({ workspaceId, actorId }) {
  const createdLeaveTypes = [];
  for (const definition of DEFAULT_LEAVE_TYPES) {
    const existing = await LeaveType.findOne({ workspaceId, key: definition.key });
    if (existing) continue;
    const created = await LeaveType.create({ ...definition, workspaceId, createdBy: actorId });
    createdLeaveTypes.push(created);
  }

  let workCalendarCreated = false;
  const existingCalendar = await WorkCalendar.findOne({ workspaceId, scope: 'workspace' });
  if (!existingCalendar) {
    await WorkCalendar.create({ workspaceId, scope: 'workspace', effectiveFrom: new Date(0), createdBy: actorId });
    workCalendarCreated = true;
  }

  const workflow = await getOrCreateActiveWorkflow(workspaceId);

  await Workspace.updateOne({ _id: workspaceId }, { $set: { leaveModuleEnabled: true } });

  return {
    leaveModuleEnabled: true,
    createdLeaveTypes: createdLeaveTypes.map((lt) => lt.toObject()),
    workCalendarCreated,
    workflowId: workflow._id
  };
}

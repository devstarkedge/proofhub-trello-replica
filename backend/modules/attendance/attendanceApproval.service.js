import mongoose from 'mongoose';
import AttendanceApproval from './attendanceApproval.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { resolveDepartmentManagers, resolveActiveMembersByRole } from '../leave/leaveApprovalAudience.service.js';

/**
 * The shared, polymorphic approval engine for WFH and Regularization
 * requests (spec §52) — no generic cross-module approval engine exists in
 * FlowTask (confirmed: MilestoneApproval is finance-specific single-
 * decision, LeaveApproval is Leave-specific). Structurally mirrors
 * leaveApproval.service.js exactly: one row per configured level, an
 * OR-gate within a level via a frozen eligibleApproverUserIds snapshot, an
 * AND-gate across every level actually created, and a conditional
 * findOneAndUpdate({status:'PENDING'}) decision write as the sole
 * concurrency guard. Reuses Leave's own generic manager/HR audience
 * resolvers directly rather than re-deriving "who is a department manager"
 * or "who holds the HR role" a second time.
 *
 * This file has ZERO knowledge of WFH or Regularization specifics — each
 * entity-type module registers its own handler via
 * registerApprovalEntityHandler at load time (see wfhRequest.service.js
 * and attendanceRegularization.service.js), so adding a third approvable
 * entity type later never means editing this file's decideApproval body.
 */
const ENTITY_HANDLERS = new Map();

/** `handler` = { load(entityId, dbSession) -> Document, onFinalOutcome(entity, finalOutcome, dbSession) }. */
export function registerApprovalEntityHandler(entityType, handler) {
  ENTITY_HANDLERS.set(entityType, handler);
}

/** Creates one AttendanceApproval row per configured level that actually resolves to at least one real approver — a level nobody can decide is never created (mirrors Leave's own rule), never silently auto-approved either. */
export async function generateApprovalLevels({ workspaceId, entityType, entityId, requesterId, requesterMembership, approverLevels, session }) {
  const levels = [];

  if ((approverLevels || []).includes('MANAGER')) {
    const managerIds = await resolveDepartmentManagers({ workspaceId, departmentIds: requesterMembership.department, excludeUserId: requesterId });
    if (managerIds.length > 0) levels.push({ level: 'MANAGER', eligibleApproverUserIds: managerIds });
  }
  if ((approverLevels || []).includes('HR')) {
    const hrIds = await resolveActiveMembersByRole({ workspaceId, role: 'hr', excludeUserId: requesterId });
    if (hrIds.length > 0) levels.push({ level: 'HR', eligibleApproverUserIds: hrIds });
  }

  if (!levels.length) return [];
  return AttendanceApproval.insertMany(
    levels.map((entry) => ({ workspaceId, entityType, entityId, ...entry })),
    { session }
  );
}

export async function decideApproval({ workspaceId, approvalId, actor, decision, comment = '' }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new ErrorResponse('Decision must be APPROVED or REJECTED', 400);
  }
  const actorId = actor._id || actor.id;

  const dbSession = await mongoose.startSession();
  let result;
  try {
    await dbSession.withTransaction(async () => {
      const approval = await AttendanceApproval.findOne({ _id: approvalId, workspaceId }).session(dbSession);
      if (!approval) throw new ErrorResponse('Approval task not found', 404);

      const handler = ENTITY_HANDLERS.get(approval.entityType);
      if (!handler) throw new ErrorResponse(`Unsupported approval entity type: ${approval.entityType}`, 500);

      const entity = await handler.load(approval.entityId, dbSession);
      if (!entity) throw new ErrorResponse('The underlying request was not found', 404);

      const requesterField = entity.requester || entity.requestedBy;
      if (String(requesterField) === String(actorId)) {
        throw new ErrorResponse('You cannot approve or reject your own request', 403);
      }
      const isEligible = (approval.eligibleApproverUserIds || []).some((id) => String(id) === String(actorId));
      if (!isEligible) {
        throw new ErrorResponse('You are not an eligible approver for this request', 403);
      }

      const updatedApproval = await AttendanceApproval.findOneAndUpdate(
        { _id: approvalId, workspaceId, status: 'PENDING' },
        { $set: { status: decision, decidedBy: actorId, decidedAt: new Date(), comment } },
        { new: true, session: dbSession }
      );
      if (!updatedApproval) {
        throw new ErrorResponse('This approval has already been decided', 409);
      }

      const allLevels = await AttendanceApproval.find({ workspaceId, entityType: approval.entityType, entityId: approval.entityId }).session(dbSession);
      const anyRejected = allLevels.some((level) => level.status === 'REJECTED');
      const allApproved = allLevels.every((level) => level.status === 'APPROVED');

      let finalOutcome = null;
      if (anyRejected) {
        await AttendanceApproval.updateMany(
          { workspaceId, entityType: approval.entityType, entityId: approval.entityId, status: 'PENDING' },
          { $set: { status: 'VOIDED' } }, { session: dbSession }
        );
        finalOutcome = 'REJECTED';
      } else if (allApproved) {
        finalOutcome = 'APPROVED';
      }

      if (finalOutcome) {
        await handler.onFinalOutcome(entity, finalOutcome, dbSession);
      }

      result = { approval: updatedApproval.toObject(), entity: entity.toObject(), allLevels: allLevels.map((l) => l.toObject()), finalOutcome, entityType: approval.entityType };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await dbSession.endSession();
  }

  // Runs AFTER the decision has committed, on EVERY decision (not just a
  // final one) — a handler decides for itself what an intermediate vs.
  // final outcome means (e.g. notify the requester either way, but only
  // recompute AttendanceDay once finalOutcome is actually set). Needs its
  // own eligibility/calendar/leave resolution that isn't worth threading
  // the approval transaction's dbSession through, and a failure here must
  // never make the already-committed decision look like it failed.
  const handler = ENTITY_HANDLERS.get(result.entityType);
  if (handler?.afterCommit) {
    try {
      await handler.afterCommit(result, actor);
    } catch (error) {
      console.error('[Attendance] approval afterCommit hook error:', error.message);
    }
  }
  return result;
}

/**
 * Batch-attaches a display-friendly `entity` (requester name + the fields
 * relevant to that entityType) onto each row — a bare `entityId` is
 * useless in a UI. Uses each entity type's own registered `loadSummaries`
 * hook (NOT `load`, which is single-entity and used by decideApproval) —
 * `AttendanceApproval.entityId` has no `refPath` (it spans two
 * differently-shaped collections keyed by an application enum, not a
 * Mongoose model name), so this batches one query per entityType rather
 * than one populate per row, while still keeping this file ignorant of
 * WFH/Regularization specifics.
 */
async function attachEntitySummaries(approvals) {
  const idsByType = new Map();
  for (const approval of approvals) {
    if (!idsByType.has(approval.entityType)) idsByType.set(approval.entityType, []);
    idsByType.get(approval.entityType).push(approval.entityId);
  }

  const byId = new Map();
  for (const [entityType, ids] of idsByType) {
    const handler = ENTITY_HANDLERS.get(entityType);
    if (!handler?.loadSummaries) continue;
    const rows = await handler.loadSummaries(ids).catch(() => []);
    for (const row of rows) byId.set(String(row._id), row);
  }

  return approvals.map((approval) => ({ ...approval, entity: byId.get(String(approval.entityId)) || null }));
}

export async function getApprovalQueue({ workspaceId, userId, entityType = null }) {
  const filter = { workspaceId, status: 'PENDING', eligibleApproverUserIds: userId };
  if (entityType) filter.entityType = entityType;
  const approvals = await AttendanceApproval.find(filter).sort({ createdAt: 1 }).lean();
  return attachEntitySummaries(approvals);
}

export async function getApprovalTimeline({ workspaceId, entityType, entityId }) {
  return AttendanceApproval.find({ workspaceId, entityType, entityId })
    .sort({ level: 1 })
    .populate('decidedBy', 'name email avatar')
    .populate('eligibleApproverUserIds', 'name email avatar')
    .lean();
}

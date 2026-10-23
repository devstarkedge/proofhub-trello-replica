import mongoose from 'mongoose';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import LeaveLedger from './leaveLedger.model.js';
import LeaveAccrualBucket from './leaveAccrualBucket.model.js';
import LeaveRequest from './leaveRequest.model.js';
import LeaveType from './leaveType.model.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, dateOnlyToInstant } from './leaveTimezone.util.js';
import { validateDateRange } from '../../utils/calendarDateRange.js';

export const LEAVE_ACTIVITY_TYPES = {
  allocation: ['MONTHLY_CREDIT'], manual_credit: ['MANUAL_CREDIT'], manual_debit: ['MANUAL_DEBIT'],
  used: ['LEAVE_CONSUMED'], expired: ['LEAVE_EXPIRED'], reserved: ['LEAVE_RESERVED'], released: ['RESERVATION_RELEASED'],
  restored: ['LEAVE_RESTORED', 'CANCELLATION_RESTORE'], reconciliation: ['POLICY_MIGRATION_ADJUSTMENT'], carry_forward: ['CARRY_FORWARD']
};
const categories = Object.fromEntries(Object.entries(LEAVE_ACTIVITY_TYPES).flatMap(([category, types]) => types.map((type) => [type, category])));
const labels = { allocation: 'Policy Allocation', manual_credit: 'Manual Credit', manual_debit: 'Manual Debit', used: 'Used Leave', expired: 'Leave Expired', reserved: 'Leave Reserved', released: 'Reservation Released', restored: 'Leave Restored', reconciliation: 'Policy Reconciliation', carry_forward: 'Carry-Forward' };
const oid = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ErrorResponse('Invalid activity identifier', 400);
  return new mongoose.Types.ObjectId(value);
};

// A debit/consumption may allocate across several buckets. Group only by a
// persisted operation identity; equal amounts/dates are never a deduplication key.
const operationIdentity = () => ({ $switch: { branches: [
  { case: { $and: [{ $in: ['$type', ['MANUAL_CREDIT', 'MANUAL_DEBIT']] }, { $eq: [{ $type: '$clientAdjustmentId' }, 'string'] }, { $ne: ['$clientAdjustmentId', ''] }] }, then: { $concat: ['adjustment:', { $toString: { $ifNull: ['$actor', 'unknown'] } }, ':', '$clientAdjustmentId', ':', '$type', ':', { $toString: '$leaveType' }] } },
  { case: { $and: [{ $in: ['$type', ['LEAVE_RESERVED', 'RESERVATION_RELEASED', 'LEAVE_CONSUMED', 'LEAVE_RESTORED', 'CANCELLATION_RESTORE']] }, { $ne: [{ $ifNull: ['$request', null] }, null] }] }, then: { $concat: ['request:', { $toString: '$request' }, ':', { $cond: [{ $in: ['$type', ['LEAVE_RESTORED', 'CANCELLATION_RESTORE']] }, 'RESTORED', '$type'] }, ':', { $toString: '$leaveType' }] } }
], default: { $toString: '$_id' } } });

async function personalScope({ workspaceId, viewer }) {
  const userId = viewer._id || viewer.id;
  const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active' }).select('role').lean();
  if (!membership) throw new ErrorResponse('Active workspace membership is required', 403);
  assertMyLeaveSelfServiceAllowed({ role: membership.role });
  return { workspaceId: new mongoose.Types.ObjectId(workspaceId), user: new mongoose.Types.ObjectId(userId) };
}

function direction(entry) {
  if (entry.type === 'POLICY_MIGRATION_ADJUSTMENT') {
    if (Number.isFinite(entry.balanceDelta)) return Math.sign(entry.balanceDelta);
    // These are exact persisted reasons written by the older policy service.
    if (/^Policy transition reduction adjustment \(/.test(entry.reason)) return -1;
    if (/^Policy transition (credit adjustment|initial allocation) \(/.test(entry.reason)) return 1;
    return null; // Unknown historical direction must not be invented.
  }
  if (['MONTHLY_CREDIT', 'MANUAL_CREDIT', 'RESERVATION_RELEASED', 'LEAVE_RESTORED', 'CANCELLATION_RESTORE'].includes(entry.type)) return 1;
  if (['MANUAL_DEBIT', 'LEAVE_CONSUMED', 'LEAVE_EXPIRED', 'LEAVE_RESERVED'].includes(entry.type)) return -1;
  return 0;
}

async function normalizeGroups({ groups, scope, detail = false }) {
  if (!groups.length) return [];
  const ledgerIds = groups.flatMap((group) => group.ledgerIds);
  const query = LeaveLedger.find({ ...scope, _id: { $in: ledgerIds } })
    .select('type amount balanceDelta actor actorRole leaveType bucket request policyVersion policySource relatedEntryId clientAdjustmentId reason')
    .populate({ path: 'actor', select: 'name avatar', transform: (doc, id) => doc || (id ? { _id: id } : null) }).populate('leaveType', 'name key color category');
  if (detail) query.populate({ path: 'policyVersion', select: 'versionNumber policy', populate: { path: 'policy', select: 'name' } });
  else query.populate('policyVersion', 'versionNumber');
  const entries = await query.lean();
  const [buckets, requests] = await Promise.all([
    LeaveAccrualBucket.find({ ...scope, _id: { $in: entries.map((entry) => entry.bucket).filter(Boolean) } }).select('period sourceType creditedAt expiresAt expiredAt policyVersion').lean(),
    LeaveRequest.find({ workspaceId: scope.workspaceId, requester: scope.user, _id: { $in: entries.map((entry) => entry.request).filter(Boolean) } }).select('startDate endDate status').lean()
  ]);
  const byId = new Map(entries.map((entry) => [String(entry._id), entry]));
  const bucketById = new Map(buckets.map((bucket) => [String(bucket._id), bucket]));
  const requestById = new Map(requests.map((request) => [String(request._id), request]));
  return groups.map((group) => {
    const rows = group.ledgerIds.map((id) => byId.get(String(id))).filter(Boolean);
    const first = rows.find((row) => String(row._id) === String(group.id)) || rows[0];
    const category = categories[first.type] || 'historical';
    const allocation = category === 'allocation';
    const source = allocation ? 'System · Policy Allocation' : first.actor?.name ? `${first.actor.name}${first.actorRole ? ` (${first.actorRole})` : ''}` : !first.actor && ['expired', 'reconciliation', 'carry_forward'].includes(category) ? 'System' : 'Historical Record';
    const normalized = rows.map((row) => {
      const bucket = bucketById.get(String(row.bucket));
      // Current assignments cannot establish which historical override won.
      const policySource = row.policySource?.scope || null;
      return { ledgerId: row._id, quantity: row.amount, direction: direction(row), period: bucket?.period || null,
        expiryDate: bucket?.expiresAt || null, expiredAt: bucket?.expiredAt || null, bucketId: bucket?._id || null,
        relatedEntryId: row.relatedEntryId || null, policy: row.policyVersion?.policy || null,
        policyVersion: row.policyVersion?.versionNumber ?? null, policySource };
    });
    const signs = new Set(normalized.map((row) => row.direction));
    const signedQuantity = signs.has(null) || signs.size > 1 ? null : group.quantity * normalized[0].direction;
    return { id: String(group.id), category, label: labels[category] || 'Historical Record', occurredAt: group.occurredAt,
      quantity: group.quantity, signedQuantity, leaveType: first.leaveType || null,
      actor: first.actor || null, actorRole: first.actorRole || null, source, reason: first.reason || '',
      request: requestById.get(String(first.request)) || null, transactionReference: first.clientAdjustmentId || String(group.id),
      ledgerIds: group.ledgerIds.map(String), allocations: normalized,
      note: category === 'reserved' ? 'Held for a pending request; this is not used leave.' : category === 'used' ? 'Recorded consumption under the existing approval rules; any earlier reservation is replaced, not charged again.' : category === 'carry_forward' ? 'Transfer of existing entitlement; not newly earned leave.' : signedQuantity === null ? 'Historical adjustment direction was not recorded.' : null };
  });
}

export async function getPersonalLeaveHistory({ workspaceId, viewer, page = 1, limit = 20, leaveTypeId, activityType = 'all', startDate, endDate, includeBalances = true }) {
  const scope = await personalScope({ workspaceId, viewer });
  page = Number(page); limit = Number(limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || (activityType !== 'all' && !Object.hasOwn(LEAVE_ACTIVITY_TYPES, activityType))) throw new ErrorResponse('Invalid history filter or pagination', 400);
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const filter = { ...scope };
  if (leaveTypeId) filter.leaveType = oid(leaveTypeId);
  if (activityType !== 'all') filter.type = { $in: LEAVE_ACTIVITY_TYPES[activityType] };
  const pipeline = [{ $match: filter }, { $group: { _id: operationIdentity(), id: { $min: '$_id' }, ledgerIds: { $push: '$_id' }, quantity: { $sum: '$amount' }, occurredAt: { $min: '$occurredAt' } } }];
  if (startDate || endDate) {
    if (!startDate || !endDate) throw new ErrorResponse('Both history date boundaries are required', 400);
    validateDateRange(startDate, endDate, 36600);
    const nextDateKey = new Date(Date.parse(`${endDate}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);
    pipeline.push({ $match: { occurredAt: { $gte: dateOnlyToInstant(startDate, timezone), $lt: dateOnlyToInstant(nextDateKey, timezone) } } });
  }
  pipeline.push({ $facet: { count: [{ $count: 'total' }], rows: [{ $sort: { occurredAt: -1, id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }] } });
  const [result] = await LeaveLedger.aggregate(pipeline);
  const [activities, balances, historicalTypes] = await Promise.all([
    normalizeGroups({ groups: result.rows, scope }), includeBalances === false || includeBalances === 'false' ? null : getFullBalanceBreakdown({ workspaceId, user: scope.user }),
    LeaveLedger.distinct('leaveType', scope)
  ]);
  const leaveTypes = await LeaveType.find({ workspaceId, _id: { $in: historicalTypes } }).select('name category color').sort({ name: 1 }).lean();
  return { activities, ...(balances ? { balances } : {}), leaveTypes, timezone, page, limit, total: result.count[0]?.total || 0,
    carryForwardMode: 'retained_buckets', carryForwardNote: 'Unexpired entitlement remains in its original bucket. This system does not currently create separate carry-forward transfer transactions.' };
}

export async function getPersonalLeaveActivity({ workspaceId, viewer, activityId }) {
  const scope = await personalScope({ workspaceId, viewer });
  const [anchor] = await LeaveLedger.aggregate([{ $match: { ...scope, _id: oid(activityId) } }, { $project: { key: operationIdentity(), type: 1, request: 1, actor: 1, clientAdjustmentId: 1, leaveType: 1 } }]);
  if (!anchor) throw new ErrorResponse('Leave activity not found', 404);
  const candidate = anchor.key.startsWith('adjustment:') ? { actor: anchor.actor || null, clientAdjustmentId: anchor.clientAdjustmentId, type: anchor.type, leaveType: anchor.leaveType }
    : anchor.key.startsWith('request:') ? { request: anchor.request, type: { $in: ['LEAVE_RESTORED', 'CANCELLATION_RESTORE'].includes(anchor.type) ? ['LEAVE_RESTORED', 'CANCELLATION_RESTORE'] : [anchor.type] }, leaveType: anchor.leaveType }
      : { _id: anchor._id };
  const [group] = await LeaveLedger.aggregate([{ $match: { ...scope, ...candidate } }, { $match: { $expr: { $eq: [operationIdentity(), anchor.key] } } }, { $group: { _id: operationIdentity(), id: { $min: '$_id' }, ledgerIds: { $push: '$_id' }, quantity: { $sum: '$amount' }, occurredAt: { $min: '$occurredAt' } } }]);
  const [activity] = await normalizeGroups({ groups: [group], scope, detail: true });
  return activity;
}

import LeaveAccrualBucket from './leaveAccrualBucket.model.js';
import LeaveLedger from './leaveLedger.model.js';
import LeaveType from './leaveType.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const EPSILON = 1e-9;

/**
 * FIFO order: earliest-expiring bucket first. MongoDB's default ascending
 * sort places `null` BEFORE any real Date (BSON type ordering), which would
 * wrongly consume never-expiring buckets first — sorted here in JS instead
 * so a null `expiresAt` (no-expiry) is treated as "expires last."
 */
function fifoComparator(a, b) {
  const aKey = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
  const bKey = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
  if (aKey !== bKey) return aKey - bKey;
  return new Date(a.creditedAt).getTime() - new Date(b.creditedAt).getTime();
}

function availableOf(bucket) {
  return bucket.creditedAmount - bucket.consumedAmount - bucket.reservedAmount - bucket.expiredAmount;
}

/**
 * Walk active buckets for (user, leaveType) in FIFO order, incrementing
 * `reservedAmount` on as many as needed to cover `amount`. Each allocation
 * is guarded by a conditional findOneAndUpdate ($expr checks the bucket
 * still has room as of the write, not just the read a moment earlier) and
 * recorded as its own LEAVE_RESERVED ledger entry. Must run inside the
 * caller's `session.withTransaction()` — a shortfall throws and the whole
 * transaction (including any allocations already applied in this attempt)
 * rolls back automatically; a genuine concurrent conflict on the guarded
 * update throws a 409 that the transaction retry (see milestoneService's
 * identical pattern) will re-attempt from a fresh read.
 */
export async function reserveFromBuckets({ workspaceId, user, leaveType, amount, request, actor, session }) {
  if (amount <= EPSILON) return [];

  const buckets = await LeaveAccrualBucket.find({ workspaceId, user, leaveType, status: 'active' }).session(session);
  buckets.sort(fifoComparator);

  let remaining = amount;
  const allocations = [];

  for (const bucket of buckets) {
    if (remaining <= EPSILON) break;
    const available = availableOf(bucket);
    if (available <= EPSILON) continue;
    const take = Math.min(available, remaining);

    const updated = await LeaveAccrualBucket.findOneAndUpdate(
      {
        _id: bucket._id,
        workspaceId,
        status: 'active',
        $expr: { $lte: [{ $add: ['$reservedAmount', '$consumedAmount', '$expiredAmount', take] }, '$creditedAmount'] }
      },
      { $inc: { reservedAmount: take } },
      { session, new: true }
    );
    if (!updated) {
      throw new ErrorResponse('Leave balance changed concurrently while reserving — please retry', 409);
    }

    const [ledgerEntry] = await LeaveLedger.create([{
      workspaceId, user, leaveType, bucket: bucket._id, request,
      type: 'LEAVE_RESERVED', amount: take, actor: actor || null,
      occurredAt: new Date(), policyVersion: bucket.policyVersion
    }], { session });

    allocations.push({ bucketId: bucket._id, amount: take, reserveLedgerId: ledgerEntry._id });
    remaining -= take;
  }

  if (remaining > EPSILON) {
    const grantedSoFar = amount - remaining;
    throw new ErrorResponse(
      `Insufficient leave balance: requested ${amount}, only ${grantedSoFar.toFixed(2)} available`,
      400
    );
  }
  return allocations;
}

/** Release every LEAVE_RESERVED entry for a request (reject / cancel-while-pending). */
export async function releaseReservationsForRequest({ workspaceId, request, reason, actor, session }) {
  const reserved = await LeaveLedger.find({ workspaceId, request, type: 'LEAVE_RESERVED' }).session(session);
  const released = [];
  for (const entry of reserved) {
    await LeaveAccrualBucket.updateOne(
      { _id: entry.bucket, workspaceId },
      { $inc: { reservedAmount: -entry.amount } },
      { session }
    );
    const [ledgerEntry] = await LeaveLedger.create([{
      workspaceId, user: entry.user, leaveType: entry.leaveType, bucket: entry.bucket, request,
      type: 'RESERVATION_RELEASED', amount: entry.amount, relatedEntryId: entry._id,
      reason, actor: actor || null, occurredAt: new Date(), policyVersion: entry.policyVersion
    }], { session });
    released.push(ledgerEntry);
  }
  return released;
}

/** Convert every LEAVE_RESERVED entry for a request into LEAVE_CONSUMED (final approval). */
export async function consumeReservationsForRequest({ workspaceId, request, reason, actor, session }) {
  const reserved = await LeaveLedger.find({ workspaceId, request, type: 'LEAVE_RESERVED' }).session(session);
  const consumed = [];
  for (const entry of reserved) {
    await LeaveAccrualBucket.updateOne(
      { _id: entry.bucket, workspaceId },
      { $inc: { reservedAmount: -entry.amount, consumedAmount: entry.amount } },
      { session }
    );
    const [ledgerEntry] = await LeaveLedger.create([{
      workspaceId, user: entry.user, leaveType: entry.leaveType, bucket: entry.bucket, request,
      type: 'LEAVE_CONSUMED', amount: entry.amount, relatedEntryId: entry._id,
      reason, actor: actor || null, occurredAt: new Date(), policyVersion: entry.policyVersion
    }], { session });
    consumed.push(ledgerEntry);
  }
  return consumed;
}

/**
 * Reverse every LEAVE_CONSUMED entry for an approved request being
 * cancelled (employee-requested-and-approved cancellation, or HR's same-day
 * override). If the original bucket is still active, restores directly; if
 * it has since expired, mints a fresh CANCELLATION_RESTORE bucket instead of
 * resurrecting a dead one or letting the balance lapse — a cancellation
 * initiated by someone other than the employee must never cost them
 * balance. `resolveFreshExpiry(leaveTypeId, policyVersionId)` is supplied by
 * the caller (leaveRequest.service.js) since computing "what expiry should
 * a freshly-minted bucket get" is a policy concern, not ledger mechanics.
 */
export async function restoreConsumptionForRequest({ workspaceId, request, reason, actor, session, resolveFreshExpiry }) {
  const consumedEntries = await LeaveLedger.find({ workspaceId, request, type: 'LEAVE_CONSUMED' }).session(session);
  const restored = [];
  const now = new Date();

  for (const entry of consumedEntries) {
    const bucket = await LeaveAccrualBucket.findOne({ _id: entry.bucket, workspaceId }).session(session);

    if (bucket && bucket.status === 'active') {
      await LeaveAccrualBucket.updateOne(
        { _id: bucket._id, workspaceId },
        { $inc: { consumedAmount: -entry.amount } },
        { session }
      );
      const [ledgerEntry] = await LeaveLedger.create([{
        workspaceId, user: entry.user, leaveType: entry.leaveType, bucket: bucket._id, request,
        type: 'LEAVE_RESTORED', amount: entry.amount, relatedEntryId: entry._id,
        reason, actor: actor || null, occurredAt: now, policyVersion: entry.policyVersion
      }], { session });
      restored.push(ledgerEntry);
      continue;
    }

    const expiresAt = await resolveFreshExpiry(entry.leaveType, entry.policyVersion);
    const [newBucket] = await LeaveAccrualBucket.create([{
      workspaceId, user: entry.user, leaveType: entry.leaveType, policyVersion: entry.policyVersion,
      period: null, sourceType: 'CANCELLATION_RESTORE', creditedAmount: entry.amount,
      creditedAt: now, expiresAt, status: 'active', reason, createdBy: actor || null, sourceRequestId: request
    }], { session });
    const [ledgerEntry] = await LeaveLedger.create([{
      workspaceId, user: entry.user, leaveType: entry.leaveType, bucket: newBucket._id, request,
      type: 'CANCELLATION_RESTORE', amount: entry.amount, relatedEntryId: entry._id,
      reason, actor: actor || null, occurredAt: now, policyVersion: entry.policyVersion
    }], { session });
    restored.push(ledgerEntry);
  }
  return restored;
}

/** Mint a new bucket + matching ledger credit — accrual, joining credit, or manual credit. */
export async function creditBucket({
  workspaceId, user, leaveType, policyVersion, period = null, sourceType,
  amount, creditedAt, expiresAt = null, reason = '', createdBy = null, session,
  ledgerType = 'MONTHLY_CREDIT'
}) {
  const [bucket] = await LeaveAccrualBucket.create([{
    workspaceId, user, leaveType, policyVersion, period, sourceType,
    creditedAmount: amount, creditedAt, expiresAt, status: 'active',
    reason, createdBy
  }], { session });
  const [ledgerEntry] = await LeaveLedger.create([{
    workspaceId, user, leaveType, bucket: bucket._id, type: ledgerType,
    amount, reason, actor: createdBy, occurredAt: creditedAt || new Date(), policyVersion
  }], { session });
  return { bucket, ledgerEntry };
}

/** Immediate FIFO debit (manual HR/Admin adjustment) — unlike a leave request, there is no reservation step. */
export async function debitViaFIFO({ workspaceId, user, leaveType, amount, reason, actor, session }) {
  if (amount <= EPSILON) return [];

  const buckets = await LeaveAccrualBucket.find({ workspaceId, user, leaveType, status: 'active' }).session(session);
  buckets.sort(fifoComparator);

  let remaining = amount;
  const entries = [];
  for (const bucket of buckets) {
    if (remaining <= EPSILON) break;
    const available = availableOf(bucket);
    if (available <= EPSILON) continue;
    const take = Math.min(available, remaining);

    const updated = await LeaveAccrualBucket.findOneAndUpdate(
      {
        _id: bucket._id, workspaceId, status: 'active',
        $expr: { $lte: [{ $add: ['$reservedAmount', '$consumedAmount', '$expiredAmount', take] }, '$creditedAmount'] }
      },
      { $inc: { consumedAmount: take } },
      { session, new: true }
    );
    if (!updated) throw new ErrorResponse('Leave balance changed concurrently — please retry', 409);

    const [ledgerEntry] = await LeaveLedger.create([{
      workspaceId, user, leaveType, bucket: bucket._id, type: 'MANUAL_DEBIT', amount: take,
      reason, actor: actor || null, occurredAt: new Date(), policyVersion: bucket.policyVersion
    }], { session });
    entries.push(ledgerEntry);
    remaining -= take;
  }

  if (remaining > EPSILON) {
    throw new ErrorResponse(
      `Insufficient leave balance for debit: requested ${amount}, only ${(amount - remaining).toFixed(2)} available`,
      400
    );
  }
  return entries;
}

/** Earned/Consumed/Reserved/Expired/Available summary for one (user, leaveType). */
export async function getBalanceSummary({ workspaceId, user, leaveType }) {
  const buckets = await LeaveAccrualBucket.find({
    workspaceId, user, leaveType, status: { $in: ['active', 'expired'] }
  }).lean();

  let earned = 0, consumed = 0, reserved = 0, expired = 0;
  for (const bucket of buckets) {
    earned += bucket.creditedAmount;
    consumed += bucket.consumedAmount;
    reserved += bucket.reservedAmount;
    expired += bucket.expiredAmount;
  }
  const available = Math.max(0, earned - consumed - reserved - expired);
  return { earned, consumed, reserved, expired, available };
}

/** Per-bucket breakdown for display (e.g. "2 Full Days expiring 31 Mar"). */
export async function listActiveBucketsForDisplay({ workspaceId, user, leaveType }) {
  const buckets = await LeaveAccrualBucket.find({ workspaceId, user, leaveType, status: 'active' }).lean();
  buckets.sort(fifoComparator);
  return buckets.map((bucket) => ({ ...bucket, availableAmount: Math.max(0, availableOf(bucket)) }));
}

/** Full per-leave-type breakdown (summary + active bucket detail) for balance cards / dashboards. */
export async function getFullBalanceBreakdown({ workspaceId, user }) {
  const leaveTypes = await LeaveType.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  const breakdown = [];
  for (const leaveType of leaveTypes) {
    const [summary, buckets] = await Promise.all([
      getBalanceSummary({ workspaceId, user, leaveType: leaveType._id }),
      listActiveBucketsForDisplay({ workspaceId, user, leaveType: leaveType._id })
    ]);
    breakdown.push({
      leaveType: { id: leaveType._id, name: leaveType.name, key: leaveType.key, category: leaveType.category, color: leaveType.color },
      ...summary,
      buckets: buckets.map((bucket) => ({
        id: bucket._id, creditedAmount: bucket.creditedAmount, availableAmount: bucket.availableAmount,
        expiresAt: bucket.expiresAt, period: bucket.period, sourceType: bucket.sourceType
      }))
    });
  }
  return breakdown;
}

export { fifoComparator, availableOf };

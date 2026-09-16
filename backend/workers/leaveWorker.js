/**
 * Leave Worker
 *
 * Processes all jobs from the 'flowtask.leave' queue:
 *   - leave-monthly-accrual   : idempotent monthly accrual sweep, every workspace
 *   - leave-expiry-sweep      : idempotent bucket-expiry sweep, every workspace
 *   - leave-approval-reminder : per-approval reminder — no-ops if the approval
 *                               was already decided by fire time
 *   - leave-approval-escalate : per-approval escalation — expands the level's
 *                               eligible approvers and notifies the escalation
 *                               target, but only if still pending at fire time
 *
 * Every handler that touches workspace-scoped models establishes its own
 * workspaceContext — this worker runs outside any Express request, so
 * there is no ambient context (see workspaceScopePlugin.js).
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import { QUEUES, CONCURRENCY } from '../queues/registry.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { runMonthlyAccrualForAllWorkspaces } from '../modules/leave/leaveAccrual.service.js';
import { runExpirySweepForAllWorkspaces } from '../modules/leave/leaveExpiry.service.js';
import { runScheduledDefaultPolicyActivations } from '../modules/leave/leavePolicy.service.js';
import LeaveApproval from '../modules/leave/leaveApproval.model.js';
import LeaveRequest from '../modules/leave/leaveRequest.model.js';
import { resolveAdminApprovers } from '../modules/leave/leaveApprovalAudience.service.js';
import { getOrCreateActiveWorkflow } from '../modules/leave/leaveApprovalWorkflow.service.js';
import * as leaveHooks from '../modules/leave/leaveHooks.js';
import config from '../config/index.js';

async function loadPendingApprovalContext(approvalId, workspaceId) {
  const approval = await LeaveApproval.findOne({ _id: approvalId, workspaceId }).lean();
  if (!approval || approval.status !== 'PENDING') return null; // already decided — safe no-op
  const request = await LeaveRequest.findOne({ _id: approval.request, workspaceId }).lean();
  if (!request) return null;
  return { approval, request };
}

const JOB_HANDLERS = {
  async 'leave-monthly-accrual'(_job) {
    const results = await runMonthlyAccrualForAllWorkspaces();
    return { workspacesProcessed: results.length };
  },

  async 'leave-expiry-sweep'(_job) {
    const results = await runExpirySweepForAllWorkspaces();
    return { workspacesProcessed: results.length };
  },

  async 'leave-policy-activation-sweep'(_job) {
    const results = await runScheduledDefaultPolicyActivations();
    return { activated: results.filter((r) => r.activated).length };
  },

  async 'leave-approval-reminder'(job) {
    const { approvalId, workspaceId } = job.data;
    return workspaceContext.run({ workspaceId }, async () => {
      const context = await loadPendingApprovalContext(approvalId, workspaceId);
      if (!context) return { skipped: true };
      await leaveHooks.onApprovalReminder(context.request, context.approval);
      return { sent: true };
    });
  },

  async 'leave-approval-escalate'(job) {
    const { approvalId, workspaceId } = job.data;
    return workspaceContext.run({ workspaceId }, async () => {
      const context = await loadPendingApprovalContext(approvalId, workspaceId);
      if (!context) return { skipped: true };

      const workflow = await getOrCreateActiveWorkflow(workspaceId);
      if ((workflow.reminders?.escalateTo || 'ADMIN') === 'NONE') return { skipped: true };

      const escalateToIds = await resolveAdminApprovers({
        workspaceId, excludeUserId: context.request.requester, workflow
      });
      if (!escalateToIds.length) return { skipped: true };

      await LeaveApproval.updateOne(
        { _id: approvalId, workspaceId, status: 'PENDING' },
        { $addToSet: { eligibleApproverUserIds: { $each: escalateToIds } } }
      );
      await leaveHooks.onApprovalEscalated(context.request, context.approval, escalateToIds);
      return { escalatedTo: escalateToIds.length };
    });
  }
};

let leaveWorker = null;

export function startLeaveWorker() {
  leaveWorker = new Worker(
    QUEUES.LEAVE,
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) throw new Error(`Unknown leave job type: ${job.name}`);
      return handler(job);
    },
    { connection: getWorkerConnection(), concurrency: CONCURRENCY[QUEUES.LEAVE] || 1 }
  );

  leaveWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[Worker:Leave] ${job.name}:${job.id} completed:`, result);
  });
  leaveWorker.on('failed', (job, err) => {
    console.error(`[Worker:Leave] ${job?.name}:${job?.id} failed:`, err.message);
  });

  console.log('[Worker:Leave] started');
  return leaveWorker;
}

export function getLeaveWorker() {
  return leaveWorker;
}

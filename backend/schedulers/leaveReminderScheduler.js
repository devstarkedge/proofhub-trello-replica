/**
 * Leave Approval Reminder Scheduler (event-driven, mirrors reminderScheduler.js)
 *
 * Exact-delayed BullMQ jobs scheduled once per LeaveApproval row at request-
 * submission time, keyed by deterministic jobIds so re-adding on recovery
 * is a safe no-op/replace. Durations come from the workspace's
 * LeaveApprovalWorkflow.reminders config — never hardcoded — defaulting to
 * 24h/48h/72h per the spec's own illustrative example.
 */
import { leaveQueue } from '../queues/index.js';
import { isQueueActive } from '../queues/queueManager.js';
import LeaveApproval from '../modules/leave/leaveApproval.model.js';
import { getOrCreateActiveWorkflow } from '../modules/leave/leaveApprovalWorkflow.service.js';
import logger from '../utils/logger.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

function jobId(stage, approvalId) {
  return `leave-approval-${stage}:${approvalId}`;
}

async function removeJob(jobIdToRemove) {
  try {
    const job = await leaveQueue.getJob(jobIdToRemove);
    if (job) {
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') await job.remove();
    }
  } catch {
    // Safe to ignore — job may already be gone.
  }
}

/**
 * Schedule the first/second reminder + escalation jobs for one approval
 * level, relative to when it was created. `workflow` is the workspace's
 * active LeaveApprovalWorkflow (caller already has it from generating the
 * chain, or looks it up via leaveApproval.service.js#getOrCreateActiveWorkflow).
 */
export async function scheduleApprovalReminders(approval, workflow) {
  if (!isQueueActive()) return;
  if (!approval.eligibleApproverUserIds?.length) return; // nothing to remind — e.g. NO_ELIGIBLE_APPROVER

  const id = String(approval._id);
  const createdAtMs = new Date(approval.createdAt || Date.now()).getTime();
  const reminders = workflow?.reminders || {};

  const stages = [
    { stage: 'reminder-1', jobName: 'leave-approval-reminder', afterHours: reminders.firstReminderAfterHours ?? 24 },
    { stage: 'reminder-2', jobName: 'leave-approval-reminder', afterHours: reminders.secondReminderAfterHours ?? 48 }
  ];
  if ((reminders.escalateTo || 'ADMIN') !== 'NONE') {
    stages.push({ stage: 'escalate', jobName: 'leave-approval-escalate', afterHours: reminders.escalateAfterHours ?? 72 });
  }

  for (const { stage, jobName, afterHours } of stages) {
    const thisJobId = jobId(stage, id);
    await removeJob(thisJobId);
    const delay = Math.max(0, createdAtMs + afterHours * 60 * 60 * 1000 - Date.now());
    await leaveQueue.add(
      jobName,
      { approvalId: id, workspaceId: String(approval.workspaceId) },
      { jobId: thisJobId, delay, removeOnComplete: true, removeOnFail: { count: 50 } }
    );
  }
}

/** Cancel all pending reminder/escalation jobs for an approval — called once it's decided. */
export async function cancelApprovalReminders(approvalId) {
  if (!isQueueActive()) return;
  const id = String(approvalId);
  await Promise.allSettled([
    removeJob(jobId('reminder-1', id)),
    removeJob(jobId('reminder-2', id)),
    removeJob(jobId('escalate', id))
  ]);
}

/** Boot-time recovery — re-derive pending reminder schedules from Mongo state across every workspace. */
export async function recoverLeaveApprovalReminderSchedules() {
  if (!isQueueActive()) return;

  let recovered = 0;
  const pendingApprovals = await workspaceContext.runUnscoped(async () =>
    LeaveApproval.find({ status: 'PENDING' }).select('_id workspaceId createdAt eligibleApproverUserIds').lean()
  );

  const workflowByWorkspace = new Map();
  for (const approval of pendingApprovals) {
    const workspaceKey = String(approval.workspaceId);
    let workflow = workflowByWorkspace.get(workspaceKey);
    if (!workflow) {
      // getOrCreateActiveWorkflow queries a workspaceScopePlugin'd model — needs its own scoped context per workspace.
      workflow = await workspaceContext.run(
        { workspaceId: approval.workspaceId },
        () => getOrCreateActiveWorkflow(approval.workspaceId)
      );
      workflowByWorkspace.set(workspaceKey, workflow);
    }
    await scheduleApprovalReminders(approval, workflow);
    recovered++;
  }

  if (recovered > 0) logger.info(`[Scheduler:LeaveReminder] recovered ${recovered} approval reminder schedules on startup`);
}

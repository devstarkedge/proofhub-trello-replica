import LeaveEvent from './leaveEvent.model.js';
import LeaveRequest, { PENDING_STATUSES } from './leaveRequest.model.js';
import LeaveApproval from './leaveApproval.model.js';
import Workspace from '../../models/Workspace.js';
import { run } from '../workspaces/workspaceContext.js';
import * as hooks from './leaveHooks.js';
import { scheduleApprovalReminders } from '../../schedulers/leaveReminderScheduler.js';

export async function enqueueLeaveEvent(event, session) {
  await LeaveEvent.create([event], { session });
}

export async function processLeaveEvents(workspaceId, { limit = 20 } = {}) {
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const event = await LeaveEvent.findOneAndUpdate({ workspaceId, processedAt: null,
      availableAt: { $lte: now }, claimedUntil: { $lte: now } },
    { $set: { claimedUntil: new Date(+now + 300000) }, $inc: { attempts: 1 } },
    { new: true, sort: { availableAt: 1 } }).lean();
    if (!event) break;
    const filter = { _id: event._id, attempts: event.attempts };
    const step = async (name, action) => {
      if (event.completedSteps.includes(name)) return;
      await action();
      await LeaveEvent.updateOne(filter, { $addToSet: { completedSteps: name } });
    };
    try {
      if (event.kind === 'SUBMITTED') {
        const { request, workflow } = event.payload;
        const current = await LeaveRequest.findOne({ workspaceId, _id: request._id }).select('status').lean();
        // A recovered event must not ask users to review an already-final
        // request or a stage another reviewer has since completed.
        if (current && PENDING_STATUSES.includes(current.status)) {
          const pendingStages = await LeaveApproval.find({ workspaceId, request: request._id, status: 'PENDING' }).lean();
          await step('submitted', () => hooks.onRequestSubmitted(request, request.requester));
          await step('assigned', () => hooks.onApprovalRequired(request, pendingStages, request.requester));
          await step('reminders', () => Promise.all(pendingStages.map((approval) => scheduleApprovalReminders(approval, workflow))));
        }
      } else {
        const { result, actor } = event.payload;
        await step('decision', () => hooks.onApprovalDecisionRecorded(result, actor));
        if (result.finalOutcome === 'APPROVED') await step('outcome', () => hooks.onRequestApproved(result.request));
        if (result.finalOutcome === 'REJECTED') await step('outcome', () => hooks.onRequestRejected(result.request));
      }
      await LeaveEvent.updateOne(filter, { $set: { processedAt: new Date(), claimedUntil: new Date(0) } });
    } catch (error) {
      await LeaveEvent.updateOne(filter, { $set: { claimedUntil: new Date(0),
        availableAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** Math.min(event.attempts, 6))) } });
      console.error('[Leave] background delivery will retry:', event.kind, error.message);
    }
  }
}

const scheduled = new Set();
export function deliverLeaveEventsSoon(workspaceId) {
  const key = String(workspaceId);
  if (scheduled.has(key)) return;
  scheduled.add(key);
  setImmediate(() => run({ workspaceId }, async () => {
    try { await processLeaveEvents(workspaceId); }
    catch (error) { console.error('[Leave] background delivery deferred:', error.message); }
    finally { scheduled.delete(key); }
  }));
}

export async function processAllLeaveEvents() {
  for await (const workspace of Workspace.find({}).select('_id').cursor()) {
    await run({ workspaceId: workspace._id }, () => processLeaveEvents(workspace._id));
  }
}

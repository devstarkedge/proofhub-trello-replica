import * as leaveApi from '../services/leaveApi';
import { runLeaveBackgroundAction } from './leaveBackgroundActions';

export const leaveRequestActionKey = (workspaceId, userId, requestId) =>
  `decision:${workspaceId}:${userId}:${requestId}`;

// Every decision for a request shares a lock, including cancellation reviews.
// The caller can close the dialog immediately; completion refreshes scoped data.
export function runLeaveRequestAction({ workspaceId, userId, requestId, kind, stageId, decision, comment }) {
  const options = { workspaceId, silentError: true };
  let action, pendingMessage, successMessage;
  switch (kind) {
    case 'approval':
      action = () => leaveApi.decideApproval(stageId, decision, comment, options);
      pendingMessage = decision === 'APPROVED' ? 'Saving leave approval…' : 'Saving leave rejection…';
      successMessage = decision === 'APPROVED' ? 'Leave approval recorded' : 'Leave request rejected';
      break;
    case 'reviewCancellation':
      action = () => leaveApi.decideCancellationRequest(requestId, decision, comment, options);
      pendingMessage = 'Saving cancellation decision…';
      successMessage = decision === 'approved' ? 'Leave cancellation approved' : 'Leave cancellation declined';
      break;
    case 'cancel':
      action = () => leaveApi.cancelPendingRequest(requestId, options);
      pendingMessage = 'Cancelling leave request…';
      successMessage = 'Leave request cancelled';
      break;
    case 'requestCancellation':
      action = () => leaveApi.requestCancellation(requestId, comment, options);
      pendingMessage = 'Sending cancellation request…';
      successMessage = 'Leave cancellation requested';
      break;
    case 'cancelApproved':
      action = () => leaveApi.hrCancelApprovedLeave(requestId, comment, options);
      pendingMessage = 'Cancelling approved leave…';
      successMessage = 'Approved leave cancelled';
      break;
    default:
      throw new Error('Unknown leave action.');
  }
  return runLeaveBackgroundAction({
    key: leaveRequestActionKey(workspaceId, userId, requestId), workspaceId,
    action, pendingMessage, successMessage
  });
}

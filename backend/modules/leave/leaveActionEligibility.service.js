import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { resolveLeaveAccessScope } from './leaveAuthorization.service.js';
import LeaveApprovalWorkflow from './leaveApprovalWorkflow.model.js';
import Workspace from '../../models/Workspace.js';
import { PENDING_STATUSES, APPROVED_STATUSES } from './leaveRequest.model.js';

export const STAGE_ORDER = { DEPARTMENT_MANAGER: 0, HR: 1, ADMIN: 2 };
export const stageOrder = (stage) => stage.sequence ?? STAGE_ORDER[stage.level] ?? 99;
export const orderStages = (stages) => [...stages].sort((a, b) => stageOrder(a) - stageOrder(b));

// Resolve current authority once per query/action. Historical candidates are
// retained, but a revoked membership, role or department cannot authorize a decision.
export async function getLeaveActionContext({ workspaceId, viewer, session = null }) {
  const userId = viewer._id || viewer.id;
  const getVisibility = () => resolveLeaveAccessScope({ viewer, workspaceId, includeEmployees: true, session });
  const getWorkflow = () => LeaveApprovalWorkflow.findOne({ workspaceId, isActive: true }).select('adminFallbackApproverUserId').session(session).lean();
  const getWorkspace = () => Workspace.findById(workspaceId).select('owner timezone').session(session).lean();
  // MongoDB transactions do not support parallel operations on one session.
  const [visibility, workflow, workspace] = session
    ? [await getVisibility(), await getWorkflow(), await getWorkspace()]
    : await Promise.all([getVisibility(), getWorkflow(), getWorkspace()]);
  // The previous resolver plus its unconditional fallback union is exactly
  // active admins OR active configured fallback/owner. Resolve that union once.
  const admins = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active', $or: [
    { role: 'admin' }, { user: { $in: [workflow?.adminFallbackApproverUserId, workspace?.owner].filter(Boolean) } }
  ] }).session(session).select('user').lean();
  return { user: visibility.viewer, userId: String(userId), access: visibility.access,
    managedIds: new Set(visibility.employeeIds.map(String)), adminIds: new Set(admins.map((member) => String(member.user))), visibility, workspace };
}

export function eligibleStage({ request, stage, stages, context, decision = 'APPROVED' }) {
  const requesterId = String(request.requester?._id || request.requester);
  if (!PENDING_STATUSES.includes(request.status) || stage.status !== 'PENDING' || requesterId === context.userId) return false;
  if (context.access.source === 'deny-override') return false;
  if (!(stage.eligibleApproverUserIds || []).some((id) => String(id._id || id) === context.userId)) return false;
  const action = decision === 'REJECTED' ? 'reject_assigned' : 'approve_assigned';
  const delegated = context.access.source === 'override' && context.access.actions[action] === true;
  const authority = delegated || (stage.level === 'DEPARTMENT_MANAGER' ? context.managedIds.has(requesterId)
    : stage.level === 'HR' ? context.user.role === 'hr' : context.adminIds.has(context.userId));
  if (!authority) return false;
  return stage.mode !== 'SEQUENTIAL' || stages.every((other) => stageOrder(other) >= stageOrder(stage) || other.status === 'APPROVED');
}

export function requestActions({ request, stages, context }) {
  const own = String(request.requester?._id || request.requester) === context.userId;
  const selfService = own && context.user.role !== 'admin';
  const cancellation = !own && context.access.actions.cancel_approved === true && context.access.scope === 'full';
  return {
    approvals: orderStages(stages).filter((stage) => eligibleStage({ request, stage, stages, context }) || eligibleStage({ request, stage, stages, context, decision: 'REJECTED' })).map((stage) => ({
      id: stage._id, level: stage.level,
      canApprove: eligibleStage({ request, stage, stages, context }),
      canReject: eligibleStage({ request, stage, stages, context, decision: 'REJECTED' })
    })),
    canCancel: selfService && ['PENDING_APPROVAL', 'PARTIALLY_APPROVED'].includes(request.status),
    canRequestCancellation: selfService && request.status === 'APPROVED',
    canReviewCancellation: cancellation && request.status === 'CANCELLATION_REQUESTED',
    canCancelApproved: cancellation && APPROVED_STATUSES.includes(request.status)
  };
}

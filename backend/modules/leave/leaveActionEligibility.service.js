import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { resolveLeaveAccessScope } from './leaveAuthorization.service.js';
import Workspace from '../../models/Workspace.js';
import { PENDING_STATUSES, APPROVED_STATUSES } from './leaveRequest.model.js';
import { stageIsReady } from './leaveApprovalRules.js';

export const STAGE_ORDER = { DEPARTMENT_MANAGER: 0, HR: 1, ADMIN: 2 };
export const stageOrder = (stage) => stage.sequence ?? STAGE_ORDER[stage.level] ?? 99;
export const orderStages = (stages) => [...stages].sort((a, b) => stageOrder(a) - stageOrder(b));

// Resolve current authority once per query/action. Historical candidates are
// retained, but a revoked membership, role or department cannot authorize a decision.
export async function getLeaveActionContext({ workspaceId, viewer, session = null }) {
  const userId = viewer._id || viewer.id;
  const getVisibility = () => resolveLeaveAccessScope({ viewer, workspaceId, includeEmployees: true, session });
  const getWorkspace = () => Workspace.findById(workspaceId).select('owner timezone').session(session).lean();
  // MongoDB transactions do not support parallel operations on one session.
  const [visibility, workspace] = session
    ? [await getVisibility(), await getWorkspace()]
    : await Promise.all([getVisibility(), getWorkspace()]);
  const admins = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active', role: 'admin' })
    .session(session).select('user').lean();
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
    : stage.level === 'HR' ? context.user.role === 'hr' : context.user.role === 'admin');
  if (stage.level === 'ADMIN' && context.user.role !== 'admin') return false;
  if (!authority) return false;
  return stageIsReady(stage, stages);
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

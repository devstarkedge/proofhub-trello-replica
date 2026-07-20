import Board from '../models/Board.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitFinanceDataRefresh } from '../realtime/index.js';
import {
  approveMilestone,
  getProjectMilestones
} from '../services/milestone/milestoneService.js';
import { fromCents } from '../utils/money.js';

const canAccessProject = (board, user) => {
  const userId = (user?._id || user?.id)?.toString();
  const role = String(user?.role || '').toLowerCase();
  return ['admin', 'manager'].includes(role)
    || board.owner?.toString() === userId
    || (board.members || []).some((member) => member?.toString() === userId)
    || board.visibility === 'public';
};

export const getMilestonesForProject = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.id)
    .select('name owner members visibility billingCycle totalProjectBudgetCents milestoneWorkflow isDeleted')
    .lean();
  if (!board || board.isDeleted) return next(new ErrorResponse('Project not found', 404));
  if (!canAccessProject(board, req.user)) {
    return next(new ErrorResponse('Not authorized to access this project', 403));
  }

  const milestones = await getProjectMilestones(board._id, { includeApprovals: true });
  const paidMilestones = milestones.filter((milestone) => milestone.status === 'paid');
  res.json({
    success: true,
    data: {
      projectId: board._id,
      projectName: board.name,
      billingCycle: board.billingCycle,
      totalProjectBudget: fromCents(board.totalProjectBudgetCents),
      milestoneWorkflow: board.milestoneWorkflow || 'sequential',
      milestones,
      billingComplete: milestones.length > 0 && paidMilestones.length === milestones.length,
      paidMilestoneCount: paidMilestones.length
    }
  });
});

export const createMilestoneApproval = asyncHandler(async (req, res) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!['admin', 'manager'].includes(role)) {
    throw new ErrorResponse('Only managers and administrators can approve milestone amounts', 403);
  }
  if (role === 'manager') {
    const board = await Board.findById(req.params.id).select('department isDeleted').lean();
    if (!board || board.isDeleted) throw new ErrorResponse('Project not found', 404);
    const managedDepartments = (req.user.department || []).map((department) => department?._id?.toString() || department?.toString());
    if (!managedDepartments.includes(board.department?.toString())) {
      throw new ErrorResponse('Managers can only approve milestones in their departments', 403);
    }
  }

  const result = await approveMilestone({
    boardId: req.params.id,
    milestoneId: req.params.milestoneId,
    amount: req.body.amount,
    sourceType: req.body.sourceType,
    sourceId: req.body.sourceId,
    note: req.body.note,
    idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key'),
    actorId: req.user._id || req.user.id,
    requestContext: {
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }
  });

  emitFinanceDataRefresh({
    changeType: result.paidTransition ? 'milestone_paid' : 'milestone_approval',
    boardId: req.params.id,
    milestoneId: req.params.milestoneId
  });

  res.status(result.idempotent ? 200 : 201).json({
    success: true,
    data: result,
    message: result.paidTransition
      ? 'Milestone paid and revenue recognized'
      : result.idempotent
        ? 'Approval already recorded'
        : 'Milestone approval recorded'
  });
});

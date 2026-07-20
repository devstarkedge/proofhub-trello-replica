import mongoose from 'mongoose';
import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import Milestone, { MILESTONE_STATUSES } from '../../models/Milestone.js';
import MilestoneApproval from '../../models/MilestoneApproval.js';
import MilestoneRevenueRecognition from '../../models/MilestoneRevenueRecognition.js';
import AuditLog from '../../modules/authorization/models/AuditLog.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { addCents, fromCents, toCents } from '../../utils/money.js';

export const MILESTONE_BILLING_TYPE = 'milestone';
export const MILESTONE_WORKFLOWS = Object.freeze(['sequential', 'parallel']);

const SOURCE_MODELS = {
  task: Card,
  subtask: Subtask,
  nanoSubtask: SubtaskNano
};

const parseMilestones = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new ErrorResponse('Milestones must be a valid JSON array', 400);
  }
};

const normalizeOptionalDate = (value, fieldName) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ErrorResponse(`${fieldName} must be a valid date when provided`, 400);
  }
  return date;
};

export const normalizeMilestoneSchedule = ({
  totalProjectBudget,
  milestoneWorkflow = 'sequential',
  milestones
}) => {
  const workflow = String(milestoneWorkflow || 'sequential').trim().toLowerCase();
  if (!MILESTONE_WORKFLOWS.includes(workflow)) {
    throw new ErrorResponse('Milestone workflow must be sequential or parallel', 400);
  }

  let budgetCents;
  try {
    budgetCents = toCents(totalProjectBudget, 'Total project budget');
  } catch (error) {
    throw new ErrorResponse(error.message, 400);
  }

  const parsedMilestones = parseMilestones(milestones);
  if (!Array.isArray(parsedMilestones) || parsedMilestones.length === 0) {
    throw new ErrorResponse('A Milestone project requires at least one milestone', 400);
  }

  const normalizedMilestones = parsedMilestones
    .map((milestone, index) => ({
      id: milestone?._id || milestone?.id || null,
      title: String(milestone?.title || '').trim(),
      amountCents: (() => {
        try {
          return toCents(milestone?.amount, `Milestone ${index + 1} amount`);
        } catch (error) {
          throw new ErrorResponse(error.message, 400);
        }
      })(),
      dueDate: normalizeOptionalDate(milestone?.dueDate, `Milestone ${index + 1} due date`),
      requestedOrder: Number.isInteger(Number(milestone?.order)) ? Number(milestone.order) : index
    }))
    .sort((a, b) => a.requestedOrder - b.requestedOrder)
    .map((milestone, order) => ({ ...milestone, order }));

  normalizedMilestones.forEach((milestone, index) => {
    if (!milestone.title) {
      throw new ErrorResponse(`Milestone ${index + 1} title is required`, 400);
    }
    if (milestone.title.length > 200) {
      throw new ErrorResponse(`Milestone ${index + 1} title cannot exceed 200 characters`, 400);
    }
  });

  const milestoneTotalCents = addCents(normalizedMilestones.map((milestone) => milestone.amountCents));
  if (milestoneTotalCents !== budgetCents) {
    throw new ErrorResponse(
      `Milestone amounts ($${fromCents(milestoneTotalCents).toFixed(2)}) must equal the total project budget ($${fromCents(budgetCents).toFixed(2)})`,
      400
    );
  }

  return { budgetCents, workflow, milestones: normalizedMilestones };
};

const statusForPosition = (workflow, order) => (
  workflow === 'parallel' || order === 0
    ? MILESTONE_STATUSES.ACTIVE
    : MILESTONE_STATUSES.PENDING
);

export const serializeApproval = (approval) => {
  const value = approval?.toObject ? approval.toObject() : approval;
  if (!value) return null;
  return {
    ...value,
    amount: fromCents(value.amountCents)
  };
};

export const serializeMilestone = (milestone, approvals = []) => {
  const value = milestone?.toObject ? milestone.toObject() : milestone;
  const amountCents = Number(value?.amountCents || 0);
  const approvedAmountCents = Number(value?.approvedAmountCents || 0);
  return {
    ...value,
    amount: fromCents(amountCents),
    approvedAmount: fromCents(approvedAmountCents),
    remainingAmount: fromCents(Math.max(0, amountCents - approvedAmountCents)),
    approvals: approvals.map(serializeApproval)
  };
};

const auditEntry = ({ actorId, action, targetId, before, after, requestContext = {} }) => ({
  actor: actorId,
  action,
  targetType: 'Milestone',
  targetId,
  changes: { before, after },
  ipAddress: requestContext.ipAddress,
  userAgent: requestContext.userAgent
});

export const createMilestonesForProject = async ({
  boardId,
  schedule,
  actorId,
  session,
  requestContext = {}
}) => {
  const documents = schedule.milestones.map((milestone) => ({
    board: boardId,
    title: milestone.title,
    amountCents: milestone.amountCents,
    approvedAmountCents: 0,
    dueDate: milestone.dueDate,
    order: milestone.order,
    status: statusForPosition(schedule.workflow, milestone.order),
    createdBy: actorId,
    updatedBy: actorId
  }));

  const created = await Milestone.insertMany(documents, { session });
  if (created.length > 0) {
    await AuditLog.insertMany(created.map((milestone) => auditEntry({
      actorId,
      action: 'MILESTONE_CREATED',
      targetId: milestone._id,
      before: null,
      after: milestone.toObject(),
      requestContext
    })), { session });
  }
  return created;
};

export const getProjectMilestones = async (boardId, { includeApprovals = true, session = null } = {}) => {
  let milestoneQuery = Milestone.find({ board: boardId }).sort({ order: 1 });
  if (session) milestoneQuery = milestoneQuery.session(session);
  const milestones = await milestoneQuery.lean();
  if (!includeApprovals || milestones.length === 0) {
    return milestones.map((milestone) => serializeMilestone(milestone));
  }

  let approvalQuery = MilestoneApproval.find({ milestone: { $in: milestones.map((item) => item._id) } })
    .populate('approvedBy', 'name email avatar')
    .sort({ approvedAt: 1 });
  if (session) approvalQuery = approvalQuery.session(session);
  const approvals = await approvalQuery.lean();
  const approvalsByMilestone = new Map();
  approvals.forEach((approval) => {
    const key = approval.milestone.toString();
    if (!approvalsByMilestone.has(key)) approvalsByMilestone.set(key, []);
    approvalsByMilestone.get(key).push(approval);
  });

  return milestones.map((milestone) => (
    serializeMilestone(milestone, approvalsByMilestone.get(milestone._id.toString()) || [])
  ));
};

export const syncMilestoneSchedule = async ({
  board,
  schedule,
  actorId,
  session,
  requestContext = {}
}) => {
  const existing = await Milestone.find({ board: board._id }).sort({ order: 1 }).session(session);
  const existingById = new Map(existing.map((milestone) => [milestone._id.toString(), milestone]));
  const incomingIds = new Set(schedule.milestones.map((milestone) => milestone.id).filter(Boolean).map(String));
  const hasFinancialHistory = existing.some((milestone) => milestone.approvedAmountCents > 0);
  const statusForScheduleInput = (input) => {
    if (schedule.workflow === 'parallel') return MILESTONE_STATUSES.ACTIVE;
    const earlierInputs = schedule.milestones.filter((candidate) => candidate.order < input.order);
    const allEarlierPaid = earlierInputs.every((candidate) => (
      candidate.id && existingById.get(String(candidate.id))?.status === MILESTONE_STATUSES.PAID
    ));
    return allEarlierPaid ? MILESTONE_STATUSES.ACTIVE : MILESTONE_STATUSES.PENDING;
  };

  if (hasFinancialHistory && board.milestoneWorkflow !== schedule.workflow) {
    throw new ErrorResponse('Milestone workflow cannot change after approvals have been recorded', 409);
  }

  for (const milestone of schedule.milestones) {
    if (milestone.id && !existingById.has(String(milestone.id))) {
      throw new ErrorResponse('Milestone schedule contains an invalid milestone id', 400);
    }
  }

  for (const milestone of existing) {
    const retained = incomingIds.has(milestone._id.toString());
    if (!retained && milestone.approvedAmountCents > 0) {
      throw new ErrorResponse('Milestones with approval history cannot be deleted', 409);
    }
  }

  // Move retained rows to collision-free temporary positions before applying a reorder.
  if (existing.length > 0) {
    await Milestone.bulkWrite(existing.map((milestone, index) => ({
      updateOne: {
        filter: { _id: milestone._id },
        update: { $set: { order: 1000000 + index } }
      }
    })), { session });
  }

  const audits = [];
  for (const input of schedule.milestones) {
    const current = input.id ? existingById.get(String(input.id)) : null;
    if (current) {
      if (current.approvedAmountCents > 0 && current.amountCents !== input.amountCents) {
        throw new ErrorResponse('Milestone amounts cannot change after an approval has been recorded', 409);
      }
      if (current.approvedAmountCents > 0 && current.order !== input.order) {
        throw new ErrorResponse('Milestone order cannot change after an approval has been recorded', 409);
      }

      const before = current.toObject();
      current.title = input.title;
      current.amountCents = input.amountCents;
      current.dueDate = input.dueDate;
      current.order = input.order;
      current.updatedBy = actorId;
      if (current.status !== MILESTONE_STATUSES.PAID) {
        current.status = current.approvedAmountCents > 0
          ? MILESTONE_STATUSES.IN_PROGRESS
          : statusForScheduleInput(input);
      }
      await current.save({ session });
      audits.push(auditEntry({
        actorId,
        action: 'MILESTONE_UPDATED',
        targetId: current._id,
        before,
        after: current.toObject(),
        requestContext
      }));
    } else {
      const [created] = await Milestone.create([{
        board: board._id,
        title: input.title,
        amountCents: input.amountCents,
        approvedAmountCents: 0,
        dueDate: input.dueDate,
        order: input.order,
        status: statusForScheduleInput(input),
        createdBy: actorId,
        updatedBy: actorId
      }], { session });
      audits.push(auditEntry({
        actorId,
        action: 'MILESTONE_CREATED',
        targetId: created._id,
        before: null,
        after: created.toObject(),
        requestContext
      }));
    }
  }

  const removable = existing.filter((milestone) => !incomingIds.has(milestone._id.toString()));
  if (removable.length > 0) {
    await Milestone.deleteMany({ _id: { $in: removable.map((milestone) => milestone._id) } }).session(session);
    removable.forEach((milestone) => audits.push(auditEntry({
      actorId,
      action: 'MILESTONE_DELETED',
      targetId: milestone._id,
      before: milestone.toObject(),
      after: null,
      requestContext
    })));
  }

  if (audits.length > 0) await AuditLog.insertMany(audits, { session });
};

export const removeUnapprovedMilestoneSchedule = async ({
  board,
  actorId,
  session,
  requestContext = {}
}) => {
  const [milestones, approvalCount, recognitionCount] = await Promise.all([
    Milestone.find({ board: board._id }).session(session),
    MilestoneApproval.countDocuments({ board: board._id }).session(session),
    MilestoneRevenueRecognition.countDocuments({ board: board._id }).session(session)
  ]);

  if (approvalCount > 0 || recognitionCount > 0) {
    throw new ErrorResponse('A Milestone project with financial history cannot change billing type', 409);
  }

  if (milestones.length > 0) {
    await Milestone.deleteMany({ board: board._id }).session(session);
    await AuditLog.insertMany(milestones.map((milestone) => auditEntry({
      actorId,
      action: 'MILESTONE_DELETED',
      targetId: milestone._id,
      before: milestone.toObject(),
      after: null,
      requestContext
    })), { session });
  }
};

const getSourceEntity = async ({ sourceType, sourceId, boardId, session }) => {
  const SourceModel = SOURCE_MODELS[sourceType];
  if (!SourceModel || !mongoose.Types.ObjectId.isValid(sourceId)) {
    throw new ErrorResponse('A valid Task, Subtask, or Nano Subtask source is required', 400);
  }
  const source = await SourceModel.findOne({ _id: sourceId, board: boardId }).select('_id title board').session(session);
  if (!source) throw new ErrorResponse('Approval source does not belong to this project', 400);
  return source;
};

const assertIdempotentRequestMatches = (approval, expected) => {
  if (!expected) return;
  const matches = approval.milestone?.toString() === expected.milestoneId?.toString()
    && approval.amountCents === expected.amountCents
    && approval.sourceType === expected.sourceType
    && approval.sourceId?.toString() === expected.sourceId?.toString();
  if (!matches) {
    throw new ErrorResponse('Idempotency key was already used for a different milestone approval', 409);
  }
};

const getIdempotentApprovalResult = async (boardId, idempotencyKey, expected = null) => {
  const approval = await MilestoneApproval.findOne({ board: boardId, idempotencyKey }).lean();
  if (!approval) return null;
  assertIdempotentRequestMatches(approval, expected);
  const milestone = await Milestone.findById(approval.milestone).lean();
  return {
    approval: serializeApproval(approval),
    milestone: serializeMilestone(milestone),
    idempotent: true
  };
};

export const approveMilestone = async ({
  boardId,
  milestoneId,
  amount,
  sourceType,
  sourceId,
  note,
  idempotencyKey,
  actorId,
  requestContext = {}
}) => {
  if (!mongoose.Types.ObjectId.isValid(boardId) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw new ErrorResponse('Invalid project or milestone id', 400);
  }
  const normalizedKey = String(idempotencyKey || '').trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) {
    throw new ErrorResponse('A valid idempotency key is required', 400);
  }

  let amountCents;
  try {
    amountCents = toCents(amount, 'Approved amount');
  } catch (error) {
    throw new ErrorResponse(error.message, 400);
  }

  const expectedRequest = { milestoneId, amountCents, sourceType, sourceId };
  const existingResult = await getIdempotentApprovalResult(boardId, normalizedKey, expectedRequest);
  if (existingResult) return existingResult;

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const board = await Board.findById(boardId).select('billingCycle milestoneWorkflow isDeleted').session(session);
      if (!board || board.isDeleted) throw new ErrorResponse('Project not found', 404);
      if (String(board.billingCycle).toLowerCase() !== MILESTONE_BILLING_TYPE) {
        throw new ErrorResponse('Approvals can only be recorded for Milestone projects', 400);
      }

      const duplicate = await MilestoneApproval.findOne({ board: boardId, idempotencyKey: normalizedKey }).session(session);
      if (duplicate) {
        assertIdempotentRequestMatches(duplicate, expectedRequest);
        const duplicateMilestone = await Milestone.findById(duplicate.milestone).session(session);
        result = {
          approval: serializeApproval(duplicate),
          milestone: serializeMilestone(duplicateMilestone),
          idempotent: true
        };
        return;
      }

      const source = await getSourceEntity({ sourceType, sourceId, boardId, session });
      const milestone = await Milestone.findOne({ _id: milestoneId, board: boardId }).session(session);
      if (!milestone) throw new ErrorResponse('Milestone not found', 404);
      if (![MILESTONE_STATUSES.ACTIVE, MILESTONE_STATUSES.IN_PROGRESS].includes(milestone.status)) {
        throw new ErrorResponse('Only an active or in-progress milestone can receive approval', 409);
      }

      const nextApprovedCents = milestone.approvedAmountCents + amountCents;
      if (nextApprovedCents > milestone.amountCents) {
        throw new ErrorResponse(
          `Approval exceeds the remaining milestone amount of $${fromCents(milestone.amountCents - milestone.approvedAmountCents).toFixed(2)}`,
          409
        );
      }

      const now = new Date();
      const becomesPaid = nextApprovedCents === milestone.amountCents;
      const updatedMilestone = await Milestone.findOneAndUpdate({
        _id: milestone._id,
        board: boardId,
        amountCents: milestone.amountCents,
        approvedAmountCents: milestone.approvedAmountCents,
        status: milestone.status
      }, {
        $set: {
          approvedAmountCents: nextApprovedCents,
          status: becomesPaid ? MILESTONE_STATUSES.PAID : MILESTONE_STATUSES.IN_PROGRESS,
          paidAt: becomesPaid ? now : null,
          revenueRecognizedAt: milestone.revenueRecognizedAt || now,
          updatedBy: actorId
        }
      }, { new: true, runValidators: true, session });

      if (!updatedMilestone) {
        throw new ErrorResponse('Milestone changed concurrently; refresh and retry with a new idempotency key', 409);
      }

      const [approval] = await MilestoneApproval.create([{
        board: boardId,
        milestone: milestone._id,
        amountCents,
        approvedBy: actorId,
        approvedAt: now,
        sourceType,
        sourceId: source._id,
        sourceTitle: source.title,
        note: String(note || '').trim() || undefined,
        idempotencyKey: normalizedKey
      }], { session });

      const audits = [auditEntry({
        actorId,
        action: 'MILESTONE_APPROVAL_RECORDED',
        targetId: milestone._id,
        before: { approvedAmountCents: milestone.approvedAmountCents, status: milestone.status },
        after: {
          approvalId: approval._id,
          approvalAmountCents: amountCents,
          approvedAmountCents: nextApprovedCents,
          financeRecognizedAmountCents: amountCents,
          financeRecognizedAt: now,
          sourceType,
          sourceId: source._id,
          status: updatedMilestone.status
        },
        requestContext
      })];

      if (becomesPaid) {
        audits.push(auditEntry({
          actorId,
          action: 'MILESTONE_PAID',
          targetId: milestone._id,
          before: { status: milestone.status },
          after: {
            status: MILESTONE_STATUSES.PAID,
            paidAt: now,
            approvedAmountCents: nextApprovedCents
          },
          requestContext
        }));

        if (board.milestoneWorkflow === 'sequential') {
          const activatedMilestone = await Milestone.findOneAndUpdate({
            board: boardId,
            order: { $gt: milestone.order },
            status: MILESTONE_STATUSES.PENDING
          }, {
            $set: { status: MILESTONE_STATUSES.ACTIVE, updatedBy: actorId }
          }, {
            sort: { order: 1 },
            new: true,
            session
          });
          if (activatedMilestone) {
            audits.push(auditEntry({
              actorId,
              action: 'MILESTONE_ACTIVATED',
              targetId: activatedMilestone._id,
              before: { status: MILESTONE_STATUSES.PENDING },
              after: { status: MILESTONE_STATUSES.ACTIVE, activatedAfterMilestoneId: milestone._id },
              requestContext
            }));
          }
        }
      }

      await AuditLog.insertMany(audits, { session });
      result = {
        approval: serializeApproval(approval),
        milestone: serializeMilestone(updatedMilestone),
        paidTransition: becomesPaid,
        idempotent: false
      };
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateResult = await getIdempotentApprovalResult(boardId, normalizedKey, expectedRequest);
      if (duplicateResult) return duplicateResult;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return result;
};

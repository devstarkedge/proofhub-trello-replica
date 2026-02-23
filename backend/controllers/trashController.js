import asyncHandler from '../middleware/asyncHandler.js';
import Attachment from '../models/Attachment.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { emitToBoard } from '../server.js';
import { deleteFromCloudinary, deleteMultipleFromCloudinary } from '../utils/cloudinary.js';

const ensureRestorePermission = async (user, board) => {
  if (!user) return false;
  if (!board) return false;
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return true;
  // department manager
  if (board.department && Array.isArray(board.department.managers)) {
    if (board.department.managers.some(id => id.toString() === user._id?.toString() || id.toString() === user.id)) return true;
  }
  // owner or member (assignees)
  const uid = user._id?.toString?.() || user.id;
  if (board.owner && board.owner.toString() === uid) return true;
  if (Array.isArray(board.members) && board.members.some(id => id.toString() === uid)) return true;
  return false;
};

// GET /projects/:id/trash
export const getProjectTrash = asyncHandler(async (req, res) => {
  const { id } = req.params; // project id (board)
  const { page = 1, limit = 20, q, fileType, deletedBy, startDate, endDate } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (pageNum - 1) * limitNum;

  const board = await Board.findById(id).populate('department', 'name managers').lean();
  if (!board) throw new ErrorResponse('Project not found', 404);

  // Permission to view trash: same as project access (members, owner, manager, admin)
  const canView = await ensureRestorePermission(req.user, { ...board, department: board.department });
  if (!canView) throw new ErrorResponse('Access denied', 403);

  const query = { board: id, isDeleted: true };
  if (q) {
    query.$or = [
      { fileName: { $regex: q, $options: 'i' } },
      { originalName: { $regex: q, $options: 'i' } }
    ];
  }
  if (fileType) query.fileType = fileType;
  if (deletedBy) query.deletedBy = deletedBy;
  if (startDate || endDate) {
    query.deletedAt = {};
    if (startDate) query.deletedAt.$gte = new Date(startDate);
    if (endDate) query.deletedAt.$lte = new Date(endDate);
  }

  const [rawItems, total] = await Promise.all([
    Attachment.find(query)
      .populate('uploadedBy', 'name avatar')
      .populate('deletedBy', 'name avatar')
      .populate('card', 'title')
      .populate({
        path: 'subtask',
        select: 'title task',
        populate: { path: 'task', select: 'title' }
      })
      .populate({
        path: 'nanoSubtask',
        select: 'title subtask',
        populate: {
          path: 'subtask',
          select: 'title task',
          populate: { path: 'task', select: 'title' }
        }
      })
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Attachment.countDocuments(query)
  ]);

  // Attach taskName and parentType for each item
  const items = rawItems.map(item => {
    let taskName = '';
    let parentType = '';
    if (item.card) {
      taskName = item.card.title || '';
      parentType = 'card';
    } else if (item.subtask) {
      taskName = item.subtask.title || '';
      parentType = 'subtask';
    } else if (item.nanoSubtask) {
      taskName = item.nanoSubtask.title || '';
      parentType = 'nenoSubtask';
    }
    return { ...item, taskName, parentType };
  });

  res.status(200).json({
    success: true,
    data: items,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// POST /attachments/:id/restore
export const restoreAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const att = await Attachment.findById(id);
  if (!att || !att.isDeleted) throw new ErrorResponse('Attachment not found in trash', 404);

  const board = await Board.findById(att.board).populate('department', 'managers').lean();
  if (!board) throw new ErrorResponse('Project not found', 404);

  // Permission
  const allowed = await ensureRestorePermission(req.user, { ...board, department: board.department });
  if (!allowed) throw new ErrorResponse('Not authorized to restore', 403);

  // Validate parent still exists
  let parentExists = false;
  let parentType = 'card';
  let parentId = att.card || att.subtask || att.nanoSubtask;
  if (att.card) {
    const c = await Card.findById(att.card).select('_id isArchived').lean();
    parentExists = !!c;
    parentType = 'card';
  } else if (att.subtask) {
    const s = await Subtask.findById(att.subtask).select('_id isDeleted').lean();
    parentExists = !!s;
    parentType = 'subtask';
  } else if (att.nanoSubtask) {
    const n = await SubtaskNano.findById(att.nanoSubtask).select('_id isDeleted').lean();
    parentExists = !!n;
    parentType = 'nanoSubtask';
  }

  if (!parentExists) {
    throw new ErrorResponse('Original parent no longer exists', 409);
  }

  att.isDeleted = false;
  att.restoredAt = new Date();
  att.restoredBy = req.user.id;
  await att.save();

  // Activity
  await Activity.create({
    type: 'attachment_restored',
    description: `Restored attachment: ${att.originalName || att.fileName}`,
    user: req.user.id,
    board: att.board,
    card: att.card || undefined,
    subtask: att.subtask || undefined,
    nanoSubtask: att.nanoSubtask || undefined,
    contextType: 'card'
  });

  // Socket
  emitToBoard(att.board.toString(), 'attachment-restored', {
    parentType,
    parentId,
    cardId: att.card || null,
    subtaskId: att.subtask || null,
    nanoSubtaskId: att.nanoSubtask || null,
    attachment: att.toObject(),
    restoredBy: { id: req.user.id, name: req.user.name }
  });

  res.status(200).json({ success: true, data: att });
});

// DELETE /attachments/:id/permanent (Admin only)
export const permanentlyDeleteAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const att = await Attachment.findById(id);
  if (!att || !att.isDeleted) throw new ErrorResponse('Attachment not found in trash', 404);

  // Only admin can permanently delete
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') throw new ErrorResponse('Only admins can permanently delete attachments', 403);

  try {
    await deleteFromCloudinary(att.publicId, att.resourceType);
  } catch (e) {
    console.error('Cloudinary delete error (permanent):', e.message);
  }

  await Attachment.deleteOne({ _id: att._id });

  await Activity.create({
    type: 'attachment_permanently_deleted',
    description: `Permanently deleted: ${att.originalName || att.fileName}`,
    user: req.user.id,
    board: att.board,
    card: att.card || undefined,
    subtask: att.subtask || undefined,
    nanoSubtask: att.nanoSubtask || undefined,
    contextType: 'card'
  });

  emitToBoard(att.board.toString(), 'attachment-permanently-deleted', {
    attachmentId: id
  });

  res.status(200).json({ success: true, message: 'Attachment permanently deleted' });
});

// POST /attachments/bulk/restore
export const bulkRestore = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw new ErrorResponse('ids required', 400);
  const atts = await Attachment.find({ _id: { $in: ids }, isDeleted: true });
  if (atts.length === 0) return res.status(200).json({ success: true, restored: 0 });

  // Check permission per board; group by board
  const byBoard = new Map();
  for (const a of atts) {
    const key = a.board?.toString();
    if (!byBoard.has(key)) byBoard.set(key, []);
    byBoard.get(key).push(a);
  }

  let restored = 0;
  const activities = [];
  const socketUpdates = new Map();

  for (const [boardId, list] of byBoard.entries()) {
    const board = await Board.findById(boardId).populate('department', 'managers').lean();
    const allowed = await ensureRestorePermission(req.user, { ...board, department: board.department });
    if (!allowed) continue;

    for (const a of list) {
      a.isDeleted = false;
      a.restoredAt = new Date();
      a.restoredBy = req.user.id;
      await a.save();
      restored += 1;

      // Activity log
      activities.push({
        type: 'attachment_restored',
        description: `Restored attachment: ${a.originalName || a.fileName}`,
        user: req.user.id,
        board: boardId,
        card: a.card || undefined,
        subtask: a.subtask || undefined,
        nanoSubtask: a.nanoSubtask || undefined,
        contextType: 'card'
      });

      // Prepare socket data
      if (!socketUpdates.has(boardId)) {
        socketUpdates.set(boardId, []);
      }
      socketUpdates.get(boardId).push({
        parentType: a.card ? 'card' : a.subtask ? 'subtask' : 'nanoSubtask',
        parentId: a.card || a.subtask || a.nanoSubtask,
        cardId: a.card || null,
        subtaskId: a.subtask || null,
        nanoSubtaskId: a.nanoSubtask || null,
        attachment: a.toObject(),
        restoredBy: { id: req.user.id, name: req.user.name }
      });
    }
  }

  // Bulk create activities
  if (activities.length > 0) {
    await Activity.insertMany(activities);
  }

  // Emit socket updates per board
  for (const [boardId, updates] of socketUpdates.entries()) {
    emitToBoard(boardId, 'attachments-bulk-restored', {
      items: updates,
      restoredCount: updates.length,
      restoredBy: { id: req.user.id, name: req.user.name }
    });
  }

  res.status(200).json({ success: true, restored });
});

// DELETE /attachments/bulk/permanent (Admin only)
export const bulkPermanentDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw new ErrorResponse('ids required', 400);
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') throw new ErrorResponse('Admin only', 403);

  const atts = await Attachment.find({ _id: { $in: ids }, isDeleted: true });
  if (atts.length === 0) return res.status(200).json({ success: true, deleted: 0 });

  // Group by board for socket emission
  const byBoard = new Map();
  for (const a of atts) {
    const key = a.board?.toString();
    if (!byBoard.has(key)) byBoard.set(key, []);
    byBoard.get(key).push(a);
  }

  const imageIds = atts.filter(a => a.resourceType === 'image').map(a => a.publicId);
  const rawIds = atts.filter(a => a.resourceType !== 'image').map(a => a.publicId);
  try {
    if (imageIds.length) await deleteMultipleFromCloudinary(imageIds, 'image');
    if (rawIds.length) await deleteMultipleFromCloudinary(rawIds, 'raw');
  } catch (e) {
    console.error('Cloudinary bulk permanent delete error:', e);
  }

  // Create activity logs for bulk delete
  const activities = atts.map(a => ({
    type: 'attachment_permanently_deleted',
    description: `Permanently deleted: ${a.originalName || a.fileName}`,
    user: req.user.id,
    board: a.board,
    card: a.card || undefined,
    subtask: a.subtask || undefined,
    nanoSubtask: a.nanoSubtask || undefined,
    contextType: 'card'
  }));
  await Activity.insertMany(activities);

  await Attachment.deleteMany({ _id: { $in: ids } });

  // Emit socket events per board
  for (const [boardId, list] of byBoard.entries()) {
    emitToBoard(boardId, 'attachments-permanently-deleted', {
      attachmentIds: list.map(a => a._id),
      deletedBy: { id: req.user.id, name: req.user.name }
    });
  }

  res.status(200).json({ success: true, deleted: atts.length });
});

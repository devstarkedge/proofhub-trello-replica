import asyncHandler from '../middleware/asyncHandler.js';
import VersionHistory from '../models/VersionHistory.js';
import Card from '../models/Card.js';
import Comment from '../models/Comment.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { emitToBoard } from '../realtime/index.js';

// @desc    Get version history for an entity
// @route   GET /api/versions/:entityType/:entityId
// @access  Private
export const getVersionHistory = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Validate entity type
  const validTypes = ['card_description', 'comment', 'subtask_description'];
  if (!validTypes.includes(entityType)) {
    throw new ErrorResponse('Invalid entity type', 400);
  }

  const [versions, total] = await Promise.all([
    VersionHistory.getVersionHistory(entityType, entityId, { skip, limit: limitNum, lean: true }),
    VersionHistory.getVersionCount(entityType, entityId)
  ]);

  res.status(200).json({
    success: true,
    data: versions,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// @desc    Get a specific version
// @route   GET /api/versions/:entityType/:entityId/version/:versionNumber
// @access  Private
export const getSpecificVersion = asyncHandler(async (req, res) => {
  const { entityType, entityId, versionNumber } = req.params;

  const version = await VersionHistory.getVersion(entityType, entityId, parseInt(versionNumber, 10));

  if (!version) {
    throw new ErrorResponse('Version not found', 404);
  }

  res.status(200).json({
    success: true,
    data: version
  });
});

// @desc    Rollback to a specific version
// @route   POST /api/versions/:entityType/:entityId/rollback/:versionNumber
// @access  Private
export const rollbackToVersion = asyncHandler(async (req, res) => {
  const { entityType, entityId, versionNumber } = req.params;

  // Validate entity type
  const validTypes = ['card_description', 'comment', 'subtask_description'];
  if (!validTypes.includes(entityType)) {
    throw new ErrorResponse('Invalid entity type', 400);
  }

  let card, board;

  // Get the parent entity to find board and card
  if (entityType === 'card_description') {
    card = await Card.findById(entityId).select('board');
    if (!card) {
      throw new ErrorResponse('Card not found', 404);
    }
    board = card.board;
  } else if (entityType === 'comment') {
    const comment = await Comment.findById(entityId).populate('card');
    if (!comment) {
      throw new ErrorResponse('Comment not found', 404);
    }
    card = comment.card._id;
    board = comment.card.board;
  }

  // Perform rollback
  const { rollbackVersion, restoredContent, restoredHtmlContent } = await VersionHistory.rollbackToVersion(
    entityType,
    entityId,
    parseInt(versionNumber, 10),
    req.user.id,
    board,
    card
  );

  // Update the actual entity with restored content
  if (entityType === 'card_description') {
    await Card.findByIdAndUpdate(entityId, {
      description: restoredHtmlContent || restoredContent
    });
  } else if (entityType === 'comment') {
    await Comment.findByIdAndUpdate(entityId, {
      htmlContent: restoredHtmlContent || restoredContent,
      text: restoredContent,
      isEdited: true,
      editedAt: new Date()
    });
  }

  // Emit real-time update
  if (board) {
    emitToBoard(board.toString(), 'version-rollback', {
      entityType,
      entityId,
      versionNumber: rollbackVersion.versionNumber,
      restoredContent: restoredHtmlContent || restoredContent,
      rolledBackBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  }

  // Return rollback info along with restored content so frontend can update UI
  res.status(200).json({
    success: true,
    data: {
      rollbackVersion,
      restoredContent,
      restoredHtmlContent
    },
    message: `Rolled back to version ${versionNumber}`
  });
});

// @desc    Compare two versions
// @route   GET /api/versions/:entityType/:entityId/compare/:v1/:v2
// @access  Private
export const compareVersions = asyncHandler(async (req, res) => {
  const { entityType, entityId, v1, v2 } = req.params;

  const [version1, version2] = await Promise.all([
    VersionHistory.getVersion(entityType, entityId, parseInt(v1, 10)),
    VersionHistory.getVersion(entityType, entityId, parseInt(v2, 10))
  ]);

  if (!version1 || !version2) {
    throw new ErrorResponse('One or both versions not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      version1,
      version2
    }
  });
});

// @desc    Get version count for an entity
// @route   GET /api/versions/:entityType/:entityId/count
// @access  Private
export const getVersionCount = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;

  const count = await VersionHistory.getVersionCount(entityType, entityId);

  res.status(200).json({
    success: true,
    data: { count }
  });
});

// @desc    Get latest version for an entity
// @route   GET /api/versions/:entityType/:entityId/latest
// @access  Private
export const getLatestVersion = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;

  const latestVersionNumber = await VersionHistory.getLatestVersionNumber(entityType, entityId);
  
  if (latestVersionNumber === 0) {
    return res.status(200).json({
      success: true,
      data: null
    });
  }

  const version = await VersionHistory.getVersion(entityType, entityId, latestVersionNumber);

  res.status(200).json({
    success: true,
    data: version
  });
});

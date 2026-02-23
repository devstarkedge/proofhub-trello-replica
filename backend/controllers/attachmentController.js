import asyncHandler from '../middleware/asyncHandler.js';
import Attachment from '../models/Attachment.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import Board from '../models/Board.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { emitToBoard } from '../realtime/index.js';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  getFileTypeCategory,
  getCloudinaryResourceType,
  getThumbnailUrl,
  getOptimizedUrl
} from '../utils/cloudinary.js';
import multer from 'multer';

// Configure multer for memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp','image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed', 'application/x-zip-compressed', 'application/x-compressed', 'multipart/x-zip',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/wav', 'audio/x-wav',
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.ms-works'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not supported`), false);
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 10 // Max 10 files at once
  },
  fileFilter
});

// @desc    Upload single attachment to Cloudinary
// @route   POST /api/attachments/upload
// @access  Private
export const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ErrorResponse('No file uploaded', 400);
  }

  const { cardId, subtaskId, nanoSubtaskId, boardId: projectId, contextType = 'description', contextRef, commentId, setCover } = req.body;

  // Validate exactly one parent reference is provided
  const parentCount = [cardId, subtaskId, nanoSubtaskId, projectId].filter(Boolean).length;
  if (parentCount !== 1) {
    throw new ErrorResponse('Exactly one parent reference (cardId, subtaskId, nanoSubtaskId, or boardId) is required', 400);
  }

  let resolvedBoardId, parentType, parentRefId, folderPath, cardForCover;
  
  if (cardId) {
    const card = await Card.findById(cardId).select('board').lean();
    if (!card) throw new ErrorResponse('Card not found', 404);
    resolvedBoardId = card.board;
    parentType = 'card';
    parentRefId = cardId;
    folderPath = `flowtask/cards/${cardId}/attachments`;
    cardForCover = cardId;
  } else if (subtaskId) {
    const subtask = await Subtask.findById(subtaskId).populate('task', 'board').lean();
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    resolvedBoardId = subtask.task?.board;
    parentType = 'subtask';
    parentRefId = subtaskId;
    folderPath = `flowtask/subtasks/${subtaskId}/attachments`;
    cardForCover = null; // Subtasks don't have cover images
  } else if (nanoSubtaskId) {
    const nano = await SubtaskNano.findById(nanoSubtaskId).populate({ 
      path: 'subtask', 
      populate: { path: 'task', select: 'board' } 
    }).lean();
    if (!nano) throw new ErrorResponse('Nano-subtask not found', 404);
    resolvedBoardId = nano.subtask?.task?.board;
    parentType = 'nanoSubtask';
    parentRefId = nanoSubtaskId;
    folderPath = `flowtask/nanos/${nanoSubtaskId}/attachments`;
    cardForCover = null; // Nanos don't have cover images
  } else if (projectId) {
    const board = await Board.findById(projectId).select('department').lean();
    if (!board) throw new ErrorResponse('Project not found', 404);
    parentType = 'board';
    parentRefId = projectId;
    resolvedBoardId = projectId;
    folderPath = `flowtask/projects/${projectId}/attachments`;
    cardForCover = null;
  }

  const fileType = getFileTypeCategory(req.file.mimetype);
  const resourceType = getCloudinaryResourceType(req.file.mimetype);

  // Cover is ONLY set when explicitly requested - no auto-cover logic
  // This ensures attachments in subtask/nano modals never affect parent covers
  const shouldSetAsCover = setCover === 'true' && parentType === 'card';

  // Versioning for project attachments
  let versionGroup = null;
  let versionNumber = null;
  let versionLabel = null;
  let fileExtension = null;
  let displayFileName = req.file.originalname;
  if (parentType === 'board') {
    const originalName = req.file.originalname || '';
    const lastDotIndex = originalName.lastIndexOf('.');
    const baseName = lastDotIndex > -1 ? originalName.slice(0, lastDotIndex) : originalName;
    const ext = lastDotIndex > -1 ? originalName.slice(lastDotIndex + 1) : '';
    versionGroup = baseName.trim() || 'file';
    fileExtension = ext.toLowerCase();

    const latest = await Attachment.findOne({
      board: resolvedBoardId,
      versionGroup,
      isDeleted: false
    }).sort({ versionNumber: -1 }).lean();

    versionNumber = (latest?.versionNumber || 0) + 1;
    versionLabel = `v${versionNumber}`;
    displayFileName = `${versionGroup}_v${versionNumber}${fileExtension ? `.${fileExtension}` : ''}`;

    if (latest?._id) {
      await Attachment.updateMany(
        { board: resolvedBoardId, versionGroup, isDeleted: false },
        { $set: { isLatestVersion: false } }
      );
    }
  }

  // Upload to Cloudinary
  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      folder: folderPath,
      resourceType,
      context: {
        [parentType]: parentRefId,
        uploadedBy: req.user.id,
        originalName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Upload failed:', error.message);
    throw new ErrorResponse(
      error.message.includes('Cloudinary configuration missing') 
        ? 'Server storage configuration error' 
        : 'Image upload failed', 
      500
    );
  }

  // Create attachment record with correct parent field
  const attachmentData = {
    fileName: displayFileName,
    originalName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    url: cloudinaryResult.url,
    secureUrl: cloudinaryResult.secure_url,
    publicId: cloudinaryResult.public_id,
    resourceType: cloudinaryResult.resource_type,
    format: cloudinaryResult.format,
    // Use the frontend's contextType ('description' or 'comment') for proper separation
    // If contextType is 'comment' and commentId is provided, use it
    // Otherwise use contextRef or fallback to parentRefId
    contextType: parentType === 'board' ? 'board' : (contextType || 'description'),
    contextRef: contextType === 'comment' ? (commentId || contextRef || parentRefId) : (contextRef || parentRefId),
    board: resolvedBoardId,
    comment: commentId || null,
    uploadedBy: req.user.id,
    width: cloudinaryResult.width,
    height: cloudinaryResult.height,
    pages: cloudinaryResult.pages,
    duration: cloudinaryResult.duration,
    isCover: shouldSetAsCover,
    versionGroup,
    versionNumber,
    versionLabel,
    fileExtension,
    isLatestVersion: parentType === 'board' ? true : undefined
  };

  // Set the correct parent field
  if (parentType === 'card') {
    attachmentData.card = cardId;
  } else if (parentType === 'subtask') {
    attachmentData.subtask = subtaskId;
  } else if (parentType === 'nanoSubtask') {
    attachmentData.nanoSubtask = nanoSubtaskId;
  } else if (parentType === 'board') {
    attachmentData.board = resolvedBoardId;
  }

  // Add thumbnail URLs for images
  if (fileType === 'image') {
    attachmentData.thumbnailUrl = getThumbnailUrl(cloudinaryResult.public_id, 200, 200);
    attachmentData.previewUrl = getOptimizedUrl(cloudinaryResult.public_id, {
      width: 800,
      height: 800,
      crop: 'limit'
    });
  }

  const attachment = await Attachment.create(attachmentData);
  await attachment.populate('uploadedBy', 'name avatar');

  // If this attachment is set as cover (only for cards), update the card's coverImage field
  if (shouldSetAsCover && cardForCover) {
    await Card.findByIdAndUpdate(cardForCover, { coverImage: attachment._id });
  }

  // Log activity
  const activityData = {
    type: 'attachment_added',
    description: `Added attachment: ${req.file.originalname}`,
    user: req.user.id,
    board: resolvedBoardId
  };
  if (parentType === 'card') activityData.card = cardId;
  await Activity.create(activityData);

  // Project file upload activity and notifications
  if (parentType === 'board' && resolvedBoardId) {
    await Activity.create({
      type: 'project_file_uploaded',
      description: `Uploaded file: ${displayFileName}`,
      user: req.user.id,
      board: resolvedBoardId,
      contextType: 'board',
      metadata: {
        fileName: displayFileName,
        versionLabel
      }
    });
  }

  // Emit real-time update
  if (resolvedBoardId) {
    emitToBoard(resolvedBoardId.toString(), 'attachment-added', {
      parentType,
      parentId: parentRefId,
      cardId: parentType === 'card' ? cardId : null,
      subtaskId: parentType === 'subtask' ? subtaskId : null,
      nanoSubtaskId: parentType === 'nanoSubtask' ? nanoSubtaskId : null,
      attachment,
      addedBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  }

  res.status(201).json({
    success: true,
    data: attachment
  });
});

// @desc    Upload multiple attachments to Cloudinary
// @route   POST /api/attachments/upload-multiple
// @access  Private
export const uploadMultipleAttachments = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ErrorResponse('No files uploaded', 400);
  }

  const { cardId, contextType = 'description', contextRef } = req.body;

  // Validate card exists
  const card = await Card.findById(cardId).select('board').lean();
  if (!card) {
    throw new ErrorResponse('Card not found', 404);
  }

  const uploadPromises = req.files.map(async (file) => {
    const fileType = getFileTypeCategory(file.mimetype);
    const resourceType = getCloudinaryResourceType(file.mimetype);

    try {
      const cloudinaryResult = await uploadToCloudinary(file.buffer, {
        folder: `flowtask/cards/${cardId}/attachments`,
        resourceType,
        context: {
          cardId,
          uploadedBy: req.user.id,
          originalName: file.originalname
        }
      });

      const attachmentData = {
        fileName: cloudinaryResult.public_id.split('/').pop(),
        originalName: file.originalname,
        fileType,
        mimeType: file.mimetype,
        fileSize: file.size,
        url: cloudinaryResult.url,
        secureUrl: cloudinaryResult.secure_url,
        publicId: cloudinaryResult.public_id,
        resourceType: cloudinaryResult.resource_type,
        format: cloudinaryResult.format,
        // Use the frontend's contextType ('description' or 'comment') for proper separation
        contextType: contextType || 'description',
        contextRef: contextRef || cardId,
        card: cardId,
        board: card.board,
        uploadedBy: req.user.id,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        pages: cloudinaryResult.pages,
        duration: cloudinaryResult.duration
      };

      if (fileType === 'image') {
        attachmentData.thumbnailUrl = getThumbnailUrl(cloudinaryResult.public_id, 200, 200);
        attachmentData.previewUrl = getOptimizedUrl(cloudinaryResult.public_id, {
          width: 800,
          height: 800,
          crop: 'limit'
        });
      }

      return { success: true, data: attachmentData, originalName: file.originalname };
    } catch (error) {
      return { success: false, error: error.message, originalName: file.originalname };
    }
  });

  const results = await Promise.all(uploadPromises);
  
  // Filter successful uploads
  const successfulUploads = results.filter(r => r.success);
  const failedUploads = results.filter(r => !r.success);

  // Batch insert successful uploads
  let attachments = [];
  if (successfulUploads.length > 0) {
    attachments = await Attachment.insertMany(
      successfulUploads.map(r => r.data)
    );
    
    // Populate uploadedBy
    await Attachment.populate(attachments, { path: 'uploadedBy', select: 'name avatar' });
  }

  // Log activity
  if (attachments.length > 0) {
    await Activity.create({
      type: 'attachments_added',
      description: `Added ${attachments.length} attachment(s)`,
      user: req.user.id,
      board: card.board,
      card: cardId
    });

    // Emit real-time update
    emitToBoard(card.board.toString(), 'attachments-added', {
      cardId,
      attachments,
      addedBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  }

  res.status(201).json({
    success: true,
    data: {
      uploaded: attachments,
      failed: failedUploads.map(f => ({ name: f.originalName, error: f.error }))
    }
  });
});

// @desc    Get attachments for a card
// @route   GET /api/attachments/card/:cardId
// @access  Private
export const getCardAttachments = asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const { page = 1, limit = 20, fileType } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const query = { card: cardId, isDeleted: false };
  if (fileType) {
    query.fileType = fileType;
  }

  const [attachments, total] = await Promise.all([
    Attachment.find(query)
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Attachment.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: attachments,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// @desc    Get attachments for a project/board
// @route   GET /api/attachments/board/:boardId
// @access  Private
export const getBoardAttachments = asyncHandler(async (req, res) => {
  const { boardId } = req.params;
  const { page = 1, limit = 50, fileType, versionGroup } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const query = { board: boardId, contextType: 'board', isDeleted: false };
  if (fileType) {
    query.fileType = fileType;
  }
  if (versionGroup) {
    query.versionGroup = versionGroup;
  }

  const [attachments, total] = await Promise.all([
    Attachment.find(query)
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Attachment.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: attachments,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// @desc    Get attachments for a subtask
// @route   GET /api/attachments/subtask/:subtaskId
// @access  Private
export const getSubtaskAttachments = asyncHandler(async (req, res) => {
  const { subtaskId } = req.params;
  const { page = 1, limit = 20, fileType } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const query = { subtask: subtaskId, isDeleted: false };
  if (fileType) {
    query.fileType = fileType;
  }

  const [attachments, total] = await Promise.all([
    Attachment.find(query)
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Attachment.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: attachments,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// @desc    Get attachments for a nano-subtask
// @route   GET /api/attachments/nano/:nanoSubtaskId
// @access  Private
export const getNanoSubtaskAttachments = asyncHandler(async (req, res) => {
  const { nanoSubtaskId } = req.params;
  const { page = 1, limit = 20, fileType } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const query = { nanoSubtask: nanoSubtaskId, isDeleted: false };
  if (fileType) {
    query.fileType = fileType;
  }

  const [attachments, total] = await Promise.all([
    Attachment.find(query)
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Attachment.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: attachments,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1
    }
  });
});

// @desc    Get attachments by context
// @route   GET /api/attachments/context/:contextType/:contextRef
// @access  Private
export const getAttachmentsByContext = asyncHandler(async (req, res) => {
  const { contextType, contextRef } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [attachments, total] = await Promise.all([
    Attachment.findByContext(contextType, contextRef, { skip, limit: limitNum, lean: true }),
    Attachment.countDocuments({ contextType, contextRef, isDeleted: false })
  ]);

  res.status(200).json({
    success: true,
    data: attachments,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

// @desc    Get single attachment
// @route   GET /api/attachments/:id
// @access  Private
export const getAttachment = asyncHandler(async (req, res) => {
  const attachment = await Attachment.findById(req.params.id)
    .populate('uploadedBy', 'name avatar')
    .lean();

  if (!attachment || attachment.isDeleted) {
    throw new ErrorResponse('Attachment not found', 404);
  }

  res.status(200).json({
    success: true,
    data: attachment
  });
});

// @desc    Delete attachment
// @route   DELETE /api/attachments/:id
// @access  Private
export const deleteAttachment = asyncHandler(async (req, res) => {
  const attachment = await Attachment.findById(req.params.id);

  if (!attachment || attachment.isDeleted) {
    throw new ErrorResponse('Attachment not found', 404);
  }

  const wasCover = attachment.isCover;
  const cardId = attachment.card;
  const isProjectAttachment = attachment.contextType === 'board' || (!attachment.card && attachment.board);
  
  // Build originalContext on first delete
  try {
    if (!attachment.originalContext) {
      const parentType = attachment.card
        ? 'card'
        : attachment.subtask
          ? 'subtask'
          : attachment.nanoSubtask
            ? 'nenoSubtask'
            : 'card';
      const parentId = attachment.card || attachment.subtask || attachment.nanoSubtask;
      const section = attachment.contextType === 'comment'
        ? 'comment'
        : attachment.contextType === 'description'
          ? 'description'
          : 'attachment';
      const boardId = attachment.board;
      let departmentId = attachment.departmentId;
      if (!departmentId && boardId) {
        const b = await Board.findById(boardId).select('department').lean();
        departmentId = b?.department;
      }
      attachment.originalContext = {
        departmentId,
        projectId: boardId,
        parentType,
        parentId,
        section,
        commentId: attachment.comment || undefined,
        indexPosition: undefined
      };
      if (departmentId && !attachment.departmentId) {
        attachment.departmentId = departmentId;
      }
    }
  } catch (e) {
    console.error('Error building originalContext on delete:', e);
  }

  // Soft delete only (do not remove from Cloudinary here)
  await attachment.softDelete(req.user.id);

  // Auto-promote next description image to cover if deleted attachment was cover
  let newCoverAttachment = null;
  if (wasCover && cardId) {
    // Find next eligible image to be cover (prioritize description images)
    newCoverAttachment = await Attachment.findOne({
      card: cardId,
      fileType: 'image',
      isDeleted: false,
      _id: { $ne: attachment._id }
    }).sort({ 
      contextType: 1, // 'description' comes before 'comment' alphabetically
      createdAt: 1 
    });

    if (newCoverAttachment) {
      newCoverAttachment.isCover = true;
      await newCoverAttachment.save();
    }
  }

  // Update latest version flag for project attachments
  if (isProjectAttachment && attachment.versionGroup) {
    const latest = await Attachment.findOne({
      board: attachment.board,
      versionGroup: attachment.versionGroup,
      isDeleted: false
    }).sort({ versionNumber: -1 });

    if (latest) {
      latest.isLatestVersion = true;
      await latest.save();
    }
  }

  // Log activity
  await Activity.create({
    type: isProjectAttachment ? 'project_file_deleted' : 'attachment_deleted',
    description: `Deleted attachment: ${attachment.originalName}`,
    user: req.user.id,
    board: attachment.board,
    card: attachment.card,
    contextType: isProjectAttachment ? 'board' : 'card'
  });

  // Emit real-time update
  if (attachment.board) {
    emitToBoard(attachment.board.toString(), 'attachment-deleted', {
      cardId: attachment.card,
      attachmentId: attachment._id,
      deletedBy: {
        id: req.user.id,
        name: req.user.name
      },
      newCover: newCoverAttachment ? {
        _id: newCoverAttachment._id,
        url: newCoverAttachment.secureUrl || newCoverAttachment.url,
        thumbnailUrl: newCoverAttachment.thumbnailUrl
      } : null
    });
  }

  res.status(200).json({
    success: true,
    message: 'Attachment deleted successfully',
    newCover: newCoverAttachment ? {
      _id: newCoverAttachment._id,
      url: newCoverAttachment.secureUrl || newCoverAttachment.url
    } : null
  });
});

// @desc    Delete multiple attachments
// @route   DELETE /api/attachments/bulk
// @access  Private
export const deleteMultipleAttachments = asyncHandler(async (req, res) => {
  const { attachmentIds } = req.body;

  if (!attachmentIds || !Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    throw new ErrorResponse('Attachment IDs are required', 400);
  }

  const attachments = await Attachment.find({
    _id: { $in: attachmentIds },
    isDeleted: false
  });

  // If no attachments found, just return success (idempotent)
  if (attachments.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No attachments found to delete',
      deletedCount: 0
    });
  }

  // Prepare originalContext + soft delete (no Cloudinary deletion here)
  const now = new Date();
  for (const att of attachments) {
    try {
      if (!att.originalContext) {
        const parentType = att.card ? 'card' : att.subtask ? 'subtask' : att.nanoSubtask ? 'nenoSubtask' : 'card';
        const parentId = att.card || att.subtask || att.nanoSubtask;
        const section = att.contextType === 'comment' ? 'comment' : att.contextType === 'description' ? 'description' : 'attachment';
        let departmentId = att.departmentId;
        if (!departmentId && att.board) {
          const b = await Board.findById(att.board).select('department').lean();
          departmentId = b?.department;
        }
        att.originalContext = {
          departmentId,
          projectId: att.board,
          parentType,
          parentId,
          section,
          commentId: att.comment || undefined,
          indexPosition: undefined
        };
        if (departmentId && !att.departmentId) att.departmentId = departmentId;
      }
      att.isDeleted = true;
      att.deletedAt = now;
      att.deletedBy = req.user.id;
      await att.save();
    } catch (e) {
      console.error('Error preparing originalContext in bulk delete:', e);
    }
  }

  // Get unique cards and boards for cache invalidation
  const uniqueCards = [...new Set(attachments.map(a => a.card?.toString()))].filter(Boolean);
  const uniqueBoards = [...new Set(attachments.map(a => a.board?.toString()))].filter(Boolean);

  // Emit real-time updates
  uniqueBoards.forEach(boardId => {
    emitToBoard(boardId, 'attachments-deleted', {
      attachmentIds,
      deletedBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  });

  res.status(200).json({
    success: true,
    message: `${attachments.length} attachment(s) deleted successfully`
  });
});

// @desc    Set attachment as entity cover (card, subtask, or nanoSubtask)
// @route   PATCH /api/attachments/:id/set-cover
// @access  Private
export const setAsCover = asyncHandler(async (req, res) => {
  const attachment = await Attachment.findById(req.params.id);

  if (!attachment || attachment.isDeleted) {
    throw new ErrorResponse('Attachment not found', 404);
  }

  if (attachment.fileType !== 'image') {
    throw new ErrorResponse('Only images can be set as cover', 400);
  }

  // Determine which entity this attachment belongs to
  let entityType, entityId, entityModel;
  
  if (attachment.card) {
    entityType = 'card';
    entityId = attachment.card;
    entityModel = Card;
  } else if (attachment.subtask) {
    entityType = 'subtask';
    entityId = attachment.subtask;
    entityModel = Subtask;
  } else if (attachment.nanoSubtask) {
    entityType = 'nanoSubtask';
    entityId = attachment.nanoSubtask;
    entityModel = SubtaskNano;
  } else {
    throw new ErrorResponse('Attachment does not belong to any entity', 400);
  }

  // Remove cover from other attachments within the SAME entity only
  const query = { isCover: true, _id: { $ne: attachment._id } };
  if (entityType === 'card') {
    query.card = entityId;
  } else if (entityType === 'subtask') {
    query.subtask = entityId;
  } else if (entityType === 'nanoSubtask') {
    query.nanoSubtask = entityId;
  }
  
  await Attachment.updateMany(query, { isCover: false });

  // Set this attachment as cover
  attachment.isCover = true;
  await attachment.save();

  // Update the entity's coverImage field
  await entityModel.findByIdAndUpdate(entityId, {
    coverImage: attachment._id
  });

  // Emit real-time update with entity-specific event
  if (attachment.board) {
    const eventName = `${entityType}-cover-updated`;
    emitToBoard(attachment.board.toString(), eventName, {
      entityType,
      entityId,
      cardId: entityType === 'card' ? entityId : null,
      subtaskId: entityType === 'subtask' ? entityId : null,
      nanoSubtaskId: entityType === 'nanoSubtask' ? entityId : null,
      coverImage: attachment,  // Use coverImage for consistency with frontend expectations
      coverAttachment: attachment  // Keep for backward compatibility
    });
  }

  res.status(200).json({
    success: true,
    data: attachment,
    entityType,
    entityId
  });
});


// @desc    Upload image from clipboard/paste
// @route   POST /api/attachments/paste
// @access  Private
export const uploadFromPaste = asyncHandler(async (req, res) => {
  const { imageData, cardId, subtaskId, nanoSubtaskId, contextType = 'description', contextRef, setCover } = req.body;

  if (!imageData) {
    throw new ErrorResponse('Image data is required', 400);
  }

  // Validate exactly one parent reference is provided
  const parentCount = [cardId, subtaskId, nanoSubtaskId].filter(Boolean).length;
  if (parentCount !== 1) {
    throw new ErrorResponse('Exactly one parent reference (cardId, subtaskId, or nanoSubtaskId) is required', 400);
  }

  let boardId, parentType, parentRefId, folderPath;

  if (cardId) {
    const card = await Card.findById(cardId).select('board').lean();
    if (!card) throw new ErrorResponse('Card not found', 404);
    boardId = card.board;
    parentType = 'card';
    parentRefId = cardId;
    folderPath = `flowtask/cards/${cardId}/attachments`;
  } else if (subtaskId) {
    const subtask = await Subtask.findById(subtaskId).populate('task', 'board').lean();
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    boardId = subtask.task?.board;
    parentType = 'subtask';
    parentRefId = subtaskId;
    folderPath = `flowtask/subtasks/${subtaskId}/attachments`;
  } else if (nanoSubtaskId) {
    const nano = await SubtaskNano.findById(nanoSubtaskId).populate({ 
      path: 'subtask', 
      populate: { path: 'task', select: 'board' } 
    }).lean();
    if (!nano) throw new ErrorResponse('Nano-subtask not found', 404);
    boardId = nano.subtask?.task?.board;
    parentType = 'nanoSubtask';
    parentRefId = nanoSubtaskId;
    folderPath = `flowtask/nanos/${nanoSubtaskId}/attachments`;
  }

  // Convert base64 to buffer
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Detect format from data URL
  const formatMatch = imageData.match(/^data:image\/(\w+);base64,/);
  const format = formatMatch ? formatMatch[1] : 'png';
  const mimeType = `image/${format}`;

  // Upload to Cloudinary
  const cloudinaryResult = await uploadToCloudinary(buffer, {
    folder: folderPath,
    resourceType: 'image',
    format,
    context: {
      [parentType]: parentRefId,
      uploadedBy: req.user.id,
      source: 'clipboard'
    }
  });

  // Determine if should set as cover (only for cards)
  let shouldSetAsCover = setCover && parentType === 'card';

  const attachmentData = {
    fileName: cloudinaryResult.public_id.split('/').pop(),
    originalName: `pasted-image-${Date.now()}.${format}`,
    fileType: 'image',
    mimeType,
    fileSize: buffer.length,
    url: cloudinaryResult.url,
    secureUrl: cloudinaryResult.secure_url,
    publicId: cloudinaryResult.public_id,
    resourceType: 'image',
    format: cloudinaryResult.format,
    // Use the frontend's contextType ('description' or 'comment') for proper separation
    contextType: contextType || 'description',
    contextRef: contextType === 'comment' ? (contextRef || parentRefId) : (contextRef || parentRefId),
    board: boardId,
    uploadedBy: req.user.id,
    width: cloudinaryResult.width,
    height: cloudinaryResult.height,
    thumbnailUrl: getThumbnailUrl(cloudinaryResult.public_id, 200, 200),
    previewUrl: getOptimizedUrl(cloudinaryResult.public_id, {
      width: 800,
      height: 800,
      crop: 'limit'
    }),
    isCover: shouldSetAsCover
  };

  // Set the correct parent field
  if (parentType === 'card') {
    attachmentData.card = cardId;
  } else if (parentType === 'subtask') {
    attachmentData.subtask = subtaskId;
  } else if (parentType === 'nanoSubtask') {
    attachmentData.nanoSubtask = nanoSubtaskId;
  }

  const attachment = await Attachment.create(attachmentData);
  await attachment.populate('uploadedBy', 'name avatar');

  // Handle cover image update if needed
  if (shouldSetAsCover && parentType === 'card') {
    await Attachment.updateMany(
      { card: cardId, isCover: true, _id: { $ne: attachment._id } },
      { isCover: false }
    );
    await Card.findByIdAndUpdate(cardId, { coverImage: attachment._id });
  }

  // Emit real-time update
  emitToBoard(boardId.toString(), 'attachment-added', {
    parentType,
    parentId: parentRefId,
    cardId: parentType === 'card' ? cardId : null,
    subtaskId: parentType === 'subtask' ? subtaskId : null,
    nanoSubtaskId: parentType === 'nanoSubtask' ? nanoSubtaskId : null,
    attachment,
    addedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  res.status(201).json({
    success: true,
    data: attachment
  });
});

// @desc    Upload file from Google Drive to Cloudinary
// @route   POST /api/attachments/upload-from-drive
// @access  Private
export const uploadFromGoogleDrive = asyncHandler(async (req, res) => {
  const { 
    fileId, 
    fileName, 
    mimeType, 
    fileSize,
    accessToken, 
    cardId, 
    subtaskId, 
    nanoSubtaskId, 
    contextType = 'description', 
    contextRef,
    commentId 
  } = req.body;

  // Validate required fields
  if (!fileId || !accessToken) {
    throw new ErrorResponse('File ID and access token are required', 400);
  }

  // Validate exactly one parent reference is provided
  const parentCount = [cardId, subtaskId, nanoSubtaskId].filter(Boolean).length;
  if (parentCount !== 1) {
    throw new ErrorResponse('Exactly one parent reference (cardId, subtaskId, or nanoSubtaskId) is required', 400);
  }

  // Validate file size (10MB limit)
  const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
  if (fileSize && fileSize > MAX_FILE_SIZE) {
    throw new ErrorResponse(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`, 400);
  }

  let boardId, parentType, parentRefId, folderPath;

  if (cardId) {
    const card = await Card.findById(cardId).select('board').lean();
    if (!card) throw new ErrorResponse('Card not found', 404);
    boardId = card.board;
    parentType = 'card';
    parentRefId = cardId;
    folderPath = `flowtask/cards/${cardId}/attachments`;
  } else if (subtaskId) {
    const subtask = await Subtask.findById(subtaskId).populate('task', 'board').lean();
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    boardId = subtask.task?.board;
    parentType = 'subtask';
    parentRefId = subtaskId;
    folderPath = `flowtask/subtasks/${subtaskId}/attachments`;
  } else if (nanoSubtaskId) {
    const nano = await SubtaskNano.findById(nanoSubtaskId).populate({
      path: 'subtask',
      populate: { path: 'task', select: 'board' }
    }).lean();
    if (!nano) throw new ErrorResponse('Nano-subtask not found', 404);
    boardId = nano.subtask?.task?.board;
    parentType = 'nanoSubtask';
    parentRefId = nanoSubtaskId;
    folderPath = `flowtask/nanos/${nanoSubtaskId}/attachments`;
  }

  // Fetch file from Google Drive
  let fileBuffer;
  let actualMimeType = mimeType;
  let actualFileName = fileName;

  try {
    // For Google Docs/Sheets/Slides, we need to export them
    const googleDocsTypes = {
      'application/vnd.google-apps.document': { 
        exportMimeType: 'application/pdf', 
        extension: '.pdf' 
      },
      'application/vnd.google-apps.spreadsheet': { 
        exportMimeType: 'application/pdf', 
        extension: '.pdf' 
      },
      'application/vnd.google-apps.presentation': { 
        exportMimeType: 'application/pdf', 
        extension: '.pdf' 
      },
      'application/vnd.google-apps.drawing': { 
        exportMimeType: 'image/png', 
        extension: '.png' 
      }
    };

    let downloadUrl;
    
    if (googleDocsTypes[mimeType]) {
      // Export Google Workspace files
      const exportConfig = googleDocsTypes[mimeType];
      actualMimeType = exportConfig.exportMimeType;
      actualFileName = fileName.replace(/\.[^/.]+$/, '') + exportConfig.extension;
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportConfig.exportMimeType)}`;
    } else {
      // Regular file download
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const driveResponse = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      console.error('Google Drive API error:', errorText);
      
      if (driveResponse.status === 401) {
        throw new ErrorResponse('Google Drive access token expired. Please try again.', 401);
      }
      if (driveResponse.status === 403) {
        throw new ErrorResponse('Access denied to Google Drive file', 403);
      }
      if (driveResponse.status === 404) {
        throw new ErrorResponse('Google Drive file not found', 404);
      }
      
      throw new ErrorResponse('Failed to fetch file from Google Drive', 500);
    }

    const arrayBuffer = await driveResponse.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);

    // Verify the file isn't empty
    if (fileBuffer.length === 0) {
      throw new ErrorResponse('Downloaded file is empty', 400);
    }

  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    console.error('Google Drive fetch error:', error);
    throw new ErrorResponse(`Failed to fetch file from Google Drive: ${error.message}`, 500);
  }

  // Upload to Cloudinary
  const fileType = getFileTypeCategory(actualMimeType);
  const resourceType = getCloudinaryResourceType(actualMimeType);

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary(fileBuffer, {
      folder: folderPath,
      resourceType,
      context: {
        [parentType]: parentRefId,
        uploadedBy: req.user.id,
        originalName: actualFileName,
        source: 'google-drive',
        driveFileId: fileId
      }
    });
  } catch (error) {
    console.error('Cloudinary upload failed:', error.message);
    throw new ErrorResponse(
      error.message.includes('Cloudinary configuration missing')
        ? 'Server storage configuration error'
        : 'File upload to storage failed',
      500
    );
  }

  // Create attachment record
  const attachmentData = {
    fileName: cloudinaryResult.public_id.split('/').pop(),
    originalName: actualFileName,
    fileType,
    mimeType: actualMimeType,
    fileSize: fileBuffer.length,
    url: cloudinaryResult.url,
    secureUrl: cloudinaryResult.secure_url,
    publicId: cloudinaryResult.public_id,
    resourceType: cloudinaryResult.resource_type,
    format: cloudinaryResult.format,
    contextType: contextType || 'description',
    contextRef: contextType === 'comment' ? (commentId || contextRef || parentRefId) : (contextRef || parentRefId),
    board: boardId,
    comment: commentId || null,
    uploadedBy: req.user.id,
    width: cloudinaryResult.width,
    height: cloudinaryResult.height,
    pages: cloudinaryResult.pages,
    duration: cloudinaryResult.duration
  };

  // Set the correct parent field
  if (parentType === 'card') {
    attachmentData.card = cardId;
  } else if (parentType === 'subtask') {
    attachmentData.subtask = subtaskId;
  } else if (parentType === 'nanoSubtask') {
    attachmentData.nanoSubtask = nanoSubtaskId;
  }

  // Add thumbnail URLs for images
  if (fileType === 'image') {
    attachmentData.thumbnailUrl = getThumbnailUrl(cloudinaryResult.public_id, 200, 200);
    attachmentData.previewUrl = getOptimizedUrl(cloudinaryResult.public_id, {
      width: 800,
      height: 800,
      crop: 'limit'
    });
  }

  const attachment = await Attachment.create(attachmentData);
  await attachment.populate('uploadedBy', 'name avatar');

  // Log activity
  const activityData = {
    type: 'attachment_added',
    description: `Added attachment from Google Drive: ${actualFileName}`,
    user: req.user.id,
    board: boardId
  };
  if (parentType === 'card') activityData.card = cardId;
  await Activity.create(activityData);

  // Emit real-time update
  if (boardId) {
    emitToBoard(boardId.toString(), 'attachment-added', {
      parentType,
      parentId: parentRefId,
      cardId: parentType === 'card' ? cardId : null,
      subtaskId: parentType === 'subtask' ? subtaskId : null,
      nanoSubtaskId: parentType === 'nanoSubtask' ? nanoSubtaskId : null,
      attachment,
      addedBy: {
        id: req.user.id,
        name: req.user.name
      },
      source: 'google-drive'
    });
  }

  res.status(201).json({
    success: true,
    data: attachment,
    source: 'google-drive'
  });
});


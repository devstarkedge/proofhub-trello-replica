import asyncHandler from '../middleware/asyncHandler.js';
import Attachment from '../models/Attachment.js';
import Card from '../models/Card.js';
import Activity from '../models/Activity.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { emitToBoard } from '../server.js';
import { invalidateCache } from '../middleware/cache.js';
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
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar/;
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed'
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

  const { cardId, contextType = 'card', contextRef, commentId, setCover } = req.body;

  // Validate card exists
  const card = await Card.findById(cardId).select('board').lean();
  if (!card) {
    throw new ErrorResponse('Card not found', 404);
  }

  const fileType = getFileTypeCategory(req.file.mimetype);
  const resourceType = getCloudinaryResourceType(req.file.mimetype);

  // Auto-cover logic: Set as cover if this is the first description image and no cover exists
  let shouldSetAsCover = setCover === 'true';
  if (!shouldSetAsCover && fileType === 'image' && contextType === 'description') {
    // Check if card already has a cover image
    const existingCover = await Attachment.findOne({
      card: cardId,
      isCover: true,
      isDeleted: false
    }).lean();
    
    if (!existingCover) {
      // No cover exists, check if there are any description images
      const descriptionImages = await Attachment.countDocuments({
        card: cardId,
        contextType: 'description',
        fileType: 'image',
        isDeleted: false
      });
      
      // If this is the first description image, set it as cover
      shouldSetAsCover = descriptionImages === 0;
    }
  }

  // Upload to Cloudinary
  const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
    folder: `flowtask/cards/${cardId}/attachments`,
    resourceType,
    context: {
      cardId,
      uploadedBy: req.user.id,
      originalName: req.file.originalname
    }
  });

  // Create attachment record
  const attachmentData = {
    fileName: cloudinaryResult.public_id.split('/').pop(),
    originalName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    url: cloudinaryResult.url,
    secureUrl: cloudinaryResult.secure_url,
    publicId: cloudinaryResult.public_id,
    resourceType: cloudinaryResult.resource_type,
    format: cloudinaryResult.format,
    contextType: contextType || 'card',
    contextRef: contextRef || cardId,
    card: cardId,
    board: card.board,
    comment: commentId || null,
    uploadedBy: req.user.id,
    width: cloudinaryResult.width,
    height: cloudinaryResult.height,
    pages: cloudinaryResult.pages,
    duration: cloudinaryResult.duration,
    isCover: shouldSetAsCover
  };

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

  // If this attachment is set as cover, update the card's coverImage field
  if (shouldSetAsCover) {
    await Card.findByIdAndUpdate(cardId, { coverImage: attachment._id });
  }

  // Log activity
  await Activity.create({
    type: 'attachment_added',
    description: `Added attachment: ${req.file.originalname}`,
    user: req.user.id,
    board: card.board,
    card: cardId
  });

  // Emit real-time update
  emitToBoard(card.board.toString(), 'attachment-added', {
    cardId,
    attachment,
    addedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // Invalidate cache
  invalidateCache(`/api/cards/${cardId}`);
  invalidateCache(`/api/attachments/card/${cardId}`);

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

  const { cardId, contextType = 'card', contextRef } = req.body;

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
        contextType: contextType || 'card',
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

  // Invalidate cache
  invalidateCache(`/api/cards/${cardId}`);
  invalidateCache(`/api/attachments/card/${cardId}`);

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

  // Delete from Cloudinary
  try {
    await deleteFromCloudinary(attachment.publicId, attachment.resourceType);
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    // Continue with soft delete even if Cloudinary fails
  }

  // Soft delete the attachment
  await attachment.softDelete(req.user.id);

  // Auto-promote next description image to cover if deleted attachment was cover
  let newCoverAttachment = null;
  if (wasCover) {
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

  // Log activity
  await Activity.create({
    type: 'attachment_deleted',
    description: `Deleted attachment: ${attachment.originalName}`,
    user: req.user.id,
    board: attachment.board,
    card: attachment.card
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

  // Invalidate cache
  invalidateCache(`/api/cards/${attachment.card}`);
  invalidateCache(`/api/attachments/card/${attachment.card}`);

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

  if (attachments.length === 0) {
    throw new ErrorResponse('No attachments found', 404);
  }

  // Group by resource type for Cloudinary deletion
  const imageIds = attachments
    .filter(a => a.resourceType === 'image')
    .map(a => a.publicId);
  const rawIds = attachments
    .filter(a => a.resourceType === 'raw')
    .map(a => a.publicId);

  // Delete from Cloudinary
  try {
    if (imageIds.length > 0) {
      await deleteMultipleFromCloudinary(imageIds, 'image');
    }
    if (rawIds.length > 0) {
      await deleteMultipleFromCloudinary(rawIds, 'raw');
    }
  } catch (error) {
    console.error('Cloudinary bulk deletion error:', error);
  }

  // Soft delete all attachments
  await Attachment.updateMany(
    { _id: { $in: attachmentIds } },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id
    }
  );

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

  // Invalidate caches
  uniqueCards.forEach(cardId => {
    invalidateCache(`/api/cards/${cardId}`);
    invalidateCache(`/api/attachments/card/${cardId}`);
  });

  res.status(200).json({
    success: true,
    message: `${attachments.length} attachment(s) deleted successfully`
  });
});

// @desc    Set attachment as card cover
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

  // Remove cover from other attachments
  await Attachment.updateMany(
    { card: attachment.card, isCover: true, _id: { $ne: attachment._id } },
    { isCover: false }
  );

  // Set this attachment as cover
  attachment.isCover = true;
  await attachment.save();

  // Update card cover
  await Card.findByIdAndUpdate(attachment.card, {
    coverImage: attachment._id
  });

  // Emit real-time update
  if (attachment.board) {
    emitToBoard(attachment.board.toString(), 'card-cover-updated', {
      cardId: attachment.card,
      coverAttachment: attachment
    });
  }

  res.status(200).json({
    success: true,
    data: attachment
  });
});

// @desc    Upload image from clipboard/paste
// @route   POST /api/attachments/paste
// @access  Private
export const uploadFromPaste = asyncHandler(async (req, res) => {
  const { imageData, cardId, contextType = 'description', contextRef } = req.body;

  if (!imageData) {
    throw new ErrorResponse('Image data is required', 400);
  }

  // Validate card exists
  const card = await Card.findById(cardId).select('board').lean();
  if (!card) {
    throw new ErrorResponse('Card not found', 404);
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
    folder: `flowtask/cards/${cardId}/attachments`,
    resourceType: 'image',
    format,
    context: {
      cardId,
      uploadedBy: req.user.id,
      source: 'clipboard'
    }
  });

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
    contextType,
    contextRef: contextRef || cardId,
    card: cardId,
    board: card.board,
    uploadedBy: req.user.id,
    width: cloudinaryResult.width,
    height: cloudinaryResult.height,
    thumbnailUrl: getThumbnailUrl(cloudinaryResult.public_id, 200, 200),
    previewUrl: getOptimizedUrl(cloudinaryResult.public_id, {
      width: 800,
      height: 800,
      crop: 'limit'
    })
  };

  const attachment = await Attachment.create(attachmentData);
  await attachment.populate('uploadedBy', 'name avatar');

  // Emit real-time update
  emitToBoard(card.board.toString(), 'attachment-added', {
    cardId,
    attachment,
    addedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // Invalidate cache
  invalidateCache(`/api/cards/${cardId}`);
  invalidateCache(`/api/attachments/card/${cardId}`);

  res.status(201).json({
    success: true,
    data: attachment
  });
});

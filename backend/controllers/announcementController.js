import Announcement from "../models/Announcement.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Department from "../models/Department.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import notificationService from "../utils/notificationService.js";
import { invalidateAnnouncementCache } from "../utils/cacheInvalidation.js";
import { emitNotification, io } from "../server.js";
import {
  uploadAnnouncementAttachment,
  uploadMultipleAnnouncementAttachments,
  deleteAnnouncementAttachment,
  deleteMultipleAnnouncementAttachments,
  validateAnnouncementFile,
  generateFileHash
} from "../utils/cloudinary.js";

// Helper function to calculate expiration date
const calculateExpiryDate = (value, unit) => {
  const date = new Date();
  switch (unit) {
    case 'hours':
      date.setHours(date.getHours() + value);
      break;
    case 'days':
      date.setDate(date.getDate() + value);
      break;
    case 'weeks':
      date.setDate(date.getDate() + value * 7);
      break;
    case 'months':
      date.setMonth(date.getMonth() + value);
      break;
    default:
      date.setDate(date.getDate() + 7); // Default 7 days
  }
  return date;
};

// Helper to get subscriber user IDs
const getSubscriberUserIds = asyncHandler(async (subscribers) => {
  let userIds = [];

  if (subscribers.type === 'all') {
    const users = await User.find({ isActive: true, isVerified: true }).select('_id');
    userIds = users.map(u => u._id);
  } else if (subscribers.type === 'departments') {
    const users = await User.find({
      department: { $in: subscribers.departments },
      isActive: true,
      isVerified: true
    }).select('_id');
    userIds = users.map(u => u._id);
  } else if (subscribers.type === 'users') {
    userIds = subscribers.users;
  } else if (subscribers.type === 'managers') {
    const users = await User.find({
      role: 'manager',
      isActive: true,
      isVerified: true
    }).select('_id');
    userIds = users.map(u => u._id);
  } else if (subscribers.type === 'custom') {
    userIds = subscribers.users;
  }

  return userIds;
});

// @desc    Get all announcements with filtering and sorting
// @route   GET /api/announcements
// @access  Private
export const getAnnouncements = asyncHandler(async (req, res, next) => {
  const { sort = 'latest', category, isArchived = false, search } = req.query;
  const userId = req.user.id;
  const userDepartment = req.user.department;
  const userRole = req.user.role;

  // Build visibility query - announcements visible to this user
  const visibilityConditions = [
    { 'subscribers.type': 'all' },
    { 'subscribers.users': userId },
    { createdBy: userId }
  ];

  // Add department filter if user has a department
  if (userDepartment) {
    visibilityConditions.push({ 'subscribers.departments': userDepartment });
  }

  // Add role-based filter
  if (userRole) {
    visibilityConditions.push({ 'subscribers.roles': userRole });
  }

  // Build main query
  let query = {
    $and: [
      { $or: visibilityConditions },
      { isArchived: isArchived === 'true' }
    ]
  };

  // Apply category filter
  if (category && category !== 'all') {
    query.$and.push({ category });
  }

  // Apply search filter
  if (search) {
    query.$and.push({
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    });
  }

  // Apply sorting
  let sortQuery = {};
  switch (sort) {
    case 'latest':
      sortQuery = { createdAt: -1 };
      break;
    case 'pinned':
      sortQuery = { isPinned: -1, createdAt: -1 };
      break;
    case 'oldest':
      sortQuery = { createdAt: 1 };
      break;
    case 'category':
      sortQuery = { category: 1, createdAt: -1 };
      break;
    case 'scheduled':
      sortQuery = { scheduledFor: 1, createdAt: -1 };
      break;
    default:
      sortQuery = { createdAt: -1 };
  }

  // Fetch announcements
  const announcements = await Announcement.find(query)
    .populate('createdBy', 'name email avatar role')
    .populate('subscribers.departments', 'name')
    .populate('subscribers.users', 'name email avatar')
    .populate('comments.author', 'name email avatar role')
    .populate('reactions.users', 'name avatar')
    .sort(sortQuery);

  // Separate pinned and unpinned (only for relevant sorts)
  if (sort !== 'oldest' && sort !== 'scheduled') {
    const pinned = announcements.filter(a => a.isPinned).sort((a, b) => {
      if (a.pinPosition !== b.pinPosition) {
        return a.pinPosition - b.pinPosition;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const unpinned = announcements.filter(a => !a.isPinned);
    const result = [...pinned, ...unpinned];

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });
  }

  res.status(200).json({
    success: true,
    count: announcements.length,
    data: announcements
  });
});

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private
export const getAnnouncement = asyncHandler(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('createdBy', 'name email avatar role')
    .populate('subscribers.departments', 'name')
    .populate('subscribers.users', 'name email avatar')
    .populate('comments.author', 'name email avatar role')
    .populate('reactions.users', 'name avatar');

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Mark as read
  const isAlreadyRead = announcement.readBy.some(
    r => r.userId.toString() === req.user.id
  );

  if (!isAlreadyRead) {
    announcement.readBy.push({
      userId: req.user.id,
      readAt: new Date()
    });
    announcement.viewCount = (announcement.viewCount || 0) + 1;
    await announcement.save();
  }

  res.status(200).json({
    success: true,
    data: announcement
  });
});

// @desc    Create new announcement
// @route   POST /api/announcements
// @access  Private/Admin/Manager
export const createAnnouncement = asyncHandler(async (req, res, next) => {
  // Check authorization
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.role !== 'hr') {
    return next(new ErrorResponse('Not authorized to create announcements', 403));
  }

  const {
    title,
    description,
    category,
    customCategory,
    subscribers,
    lastFor,
    scheduledFor,
    allowComments,
    isPinned
  } = req.body;

  if (!title || !description) {
    return next(new ErrorResponse('Title and description are required', 400));
  }

  if (!lastFor || !lastFor.value || !lastFor.unit) {
    return next(new ErrorResponse('Expiration duration is required', 400));
  }

  // Calculate expiry date
  const expiresAt = calculateExpiryDate(lastFor.value, lastFor.unit);

  // Prepare for attachments upload (we'll upload after creating the announcement)
  const attachments = [];
  const uploadErrors = [];
  const filesToUpload = (req.files && Array.isArray(req.files)) ? req.files : [];

  // Create announcement object
  const announcementData = {
    title,
    description,
    category: category === 'Custom' ? 'Custom' : category,
    customCategory: category === 'Custom' ? customCategory : undefined,
    createdBy: req.user.id,
    subscribers: subscribers || {
      type: 'all',
      departments: [],
      users: [],
      roles: []
    },
    expiresAt,
    lastFor,
    allowComments: allowComments !== false,
    attachments,
    isPinned: isPinned === true
  };

  // Only add scheduling fields if scheduledFor is provided and valid
  if (scheduledFor) {
    const scheduledDate = new Date(scheduledFor);
    if (!isNaN(scheduledDate.getTime())) {
      announcementData.isScheduled = true;
      announcementData.scheduledFor = scheduledDate;
    } else {
      announcementData.isScheduled = false;
      announcementData.scheduledFor = null;
    }
  } else {
    announcementData.isScheduled = false;
    announcementData.scheduledFor = null;
  }

  // Handle pinning logic
  if (announcementData.isPinned) {
    const pinnedCount = await Announcement.countDocuments({
      isPinned: true,
      isArchived: false
    });

    if (pinnedCount >= 3) {
      return next(new ErrorResponse('Maximum 3 announcements can be pinned', 400));
    }

    announcementData.pinPosition = pinnedCount + 1;
  }

  const announcement = await Announcement.create(announcementData);

  // If there were files uploaded in the request, upload them directly into the
  // announcement's permanent folder now that we have an announcement ID. This
  // avoids Cloudinary renames and reduces background processing timeouts.
  if (filesToUpload.length > 0) {
    try {
      const uploadResults = await uploadMultipleAnnouncementAttachments(
        filesToUpload,
        announcement._id.toString(),
        req.user.id
      );

      // Attach successful uploads to the announcement
      announcement.attachments = Array.isArray(uploadResults.successful) ? uploadResults.successful : [];
      if (uploadResults.failed && uploadResults.failed.length > 0) {
        uploadErrors.push(...uploadResults.failed);
      }

      await announcement.save();
    } catch (err) {
      console.error('Error uploading announcement attachments after create:', err);
      // Do not block announcement creation on attachment upload failures
    }
  }

  await announcement.populate('createdBy', 'name email avatar role');

  // If not scheduled, broadcast immediately
  if (!announcementData.isScheduled) {
    // Use the saved announcement's subscribers to avoid mismatches and ensure structure
    const rawSubscribers = announcement.subscribers || subscribers || { type: 'all' };
    let subscriberIds = [];
    try {
      const result = await getSubscriberUserIds(rawSubscribers);
      subscriberIds = Array.isArray(result) ? result : [];
    } catch (err) {
      console.error('Error resolving subscriber IDs:', err);
      subscriberIds = [];
    }

    // Create notifications for all subscribers
    const notifications = (subscriberIds || []).map(userId => ({
      type: 'announcement_created',
      title: 'New Announcement',
      message: `${req.user.name} posted: ${title}`,
      user: userId,
      sender: req.user.id,
      relatedAnnouncement: announcement._id,
      isRead: false
    }));

    await Notification.insertMany(notifications);

    // Emit real-time notification to subscribers
    subscriberIds.forEach(userId => {
      io.to(`user-${userId}`).emit('announcement-created', {
        announcement: announcement.toJSON(),
        notification: {
          type: 'announcement_created',
          title: 'New Announcement',
          message: `${req.user.name} posted: ${title}`
        }
      });
    });

    announcement.broadcastedAt = new Date();
    announcement.broadcastedTo = subscriberIds;
    await announcement.save();

    // Send background email notifications
    notificationService.sendAnnouncementEmails(announcement, subscriberIds);
  }

  invalidateAnnouncementCache({ announcementId: announcement._id, clearAll: true });

  res.status(201).json({
    success: true,
    message: announcementData.isScheduled
      ? 'Announcement scheduled successfully'
      : 'Announcement created and broadcasted successfully',
    data: announcement,
    uploadErrors: uploadErrors.length > 0 ? uploadErrors : undefined
  });
});

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin/Manager
export const updateAnnouncement = asyncHandler(async (req, res, next) => {
  let announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to update this announcement', 403));
  }

  const { title, description, category, customCategory, subscribers, isPinned, allowComments } = req.body;

  if (title) announcement.title = title;
  if (description) announcement.description = description;
  if (category) {
    announcement.category = category === 'Custom' ? 'Custom' : category;
    announcement.customCategory = category === 'Custom' ? customCategory : '';
  }
  if (subscribers) announcement.subscribers = subscribers;
  if (allowComments !== undefined) announcement.allowComments = allowComments;

  // Handle pin update
  if (isPinned !== undefined && isPinned !== announcement.isPinned) {
    if (isPinned) {
      const pinnedCount = await Announcement.countDocuments({
        isPinned: true,
        isArchived: false,
        _id: { $ne: announcement._id }
      });

      if (pinnedCount >= 3) {
        return next(new ErrorResponse('Maximum 3 announcements can be pinned', 400));
      }

      announcement.isPinned = true;
      announcement.pinPosition = pinnedCount + 1;
    } else {
      announcement.isPinned = false;
      announcement.pinPosition = undefined;
    }
  }

  await announcement.save();
  await announcement.populate('createdBy', 'name email avatar role');

  // Notify subscribers of update
  try {
    const subscriberIds = await getSubscriberUserIds(announcement.subscribers);

    if (subscriberIds && Array.isArray(subscriberIds)) {
      subscriberIds.forEach(userId => {
        io.to(`user-${userId}`).emit('announcement-updated', {
          announcementId: announcement._id,
          announcement: announcement.toJSON()
        });
      });
    }
  } catch (error) {
    console.error('Error notifying subscribers about update:', error);
  }

  invalidateAnnouncementCache({ announcementId: announcement._id, clearAll: true });

  res.status(200).json({
    success: true,
    message: 'Announcement updated successfully',
    data: announcement
  });
});

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin/Manager
export const deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    // If announcement doesn't exist, consider it already deleted
    return res.status(200).json({
      success: true,
      message: 'Announcement already deleted or does not exist'
    });
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to delete this announcement', 403));
  }

  // Delete attachments from Cloudinary
  if (announcement.attachments && announcement.attachments.length > 0) {
    try {
      const attachmentsToDelete = announcement.attachments
        .filter(att => !att.isDeleted && att.public_id)
        .map(att => ({
          public_id: att.public_id,
          resource_type: att.resource_type
        }));
      
      if (attachmentsToDelete.length > 0) {
        await deleteMultipleAnnouncementAttachments(attachmentsToDelete);
      }
    } catch (error) {
      console.error('Error deleting Cloudinary attachments:', error);
      // Continue with deletion even if Cloudinary cleanup fails
    }
  }

  await Announcement.findByIdAndDelete(req.params.id);

  // Notify subscribers
  try {
    const subscriberIds = await getSubscriberUserIds(announcement.subscribers);

    if (subscriberIds && Array.isArray(subscriberIds)) {
      subscriberIds.forEach(userId => {
        io.to(`user-${userId}`).emit('announcement-deleted', {
          announcementId: announcement._id
        });
      });
    }
  } catch (error) {
    console.error('Error notifying subscribers about deletion:', error);
  }

  invalidateAnnouncementCache({ announcementId: announcement._id, clearAll: true });

  res.status(200).json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});

// @desc    Add comment to announcement
// @route   POST /api/announcements/:id/comments
// @access  Private
export const addComment = asyncHandler(async (req, res, next) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return next(new ErrorResponse('Comment text is required', 400));
  }

  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  if (!announcement.allowComments) {
    return next(new ErrorResponse('Comments are disabled for this announcement', 403));
  }

  const comment = {
    author: req.user.id,
    text: text.trim(),
    createdAt: new Date()
  };

  announcement.comments.push(comment);
  announcement.commentsCount = announcement.comments.length;

  await announcement.save();
  await announcement.populate('comments.author', 'name email avatar role');

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-comment-added', {
    announcementId: announcement._id,
    comment: announcement.comments[announcement.comments.length - 1]
  });

  res.status(201).json({
    success: true,
    message: 'Comment added successfully',
    data: announcement.comments[announcement.comments.length - 1]
  });
});

// @desc    Delete comment from announcement
// @route   DELETE /api/announcements/:id/comments/:commentId
// @access  Private
export const deleteComment = asyncHandler(async (req, res, next) => {
  const { id, commentId } = req.params;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  const comment = announcement.comments.id(commentId);

  if (!comment) {
    return next(new ErrorResponse('Comment not found', 404));
  }

  // Check authorization
  if (comment.author.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this comment', 403));
  }

  announcement.comments = announcement.comments.filter(
    c => c._id.toString() !== commentId
  );
  announcement.commentsCount = announcement.comments.length;

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-comment-deleted', {
    announcementId: announcement._id,
    commentId
  });

  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully'
  });
});

// @desc    Add emoji reaction
// @route   POST /api/announcements/:id/reactions
// @access  Private
export const addReaction = asyncHandler(async (req, res, next) => {
  const { emoji } = req.body;
  const validEmojis = ['👍', '❤️', '🎉', '🔥', '👀'];

  if (!validEmojis.includes(emoji)) {
    return next(new ErrorResponse('Invalid emoji', 400));
  }

  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  let reaction = announcement.reactions.find(r => r.emoji === emoji);

  if (!reaction) {
    reaction = { emoji, users: [], count: 0 };
    announcement.reactions.push(reaction);
    reaction = announcement.reactions[announcement.reactions.length - 1];
  }

  const userAlreadyReacted = reaction.users.some(
    u => u.toString() === req.user.id
  );

  if (!userAlreadyReacted) {
    reaction.users.push(req.user.id);
    reaction.count = reaction.users.length;
  }

  await announcement.save();
  await announcement.populate('reactions.users', 'name avatar');

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-reaction-added', {
    announcementId: announcement._id,
    reaction
  });

  res.status(200).json({
    success: true,
    message: 'Reaction added successfully',
    data: reaction
  });
});

// @desc    Remove emoji reaction
// @route   DELETE /api/announcements/:id/reactions/:emoji
// @access  Private
export const removeReaction = asyncHandler(async (req, res, next) => {
  const { emoji } = req.params;
  const validEmojis = ['👍', '❤️', '🎉', '🔥', '👀'];

  if (!validEmojis.includes(emoji)) {
    return next(new ErrorResponse('Invalid emoji', 400));
  }

  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  const reaction = announcement.reactions.find(r => r.emoji === emoji);

  if (!reaction) {
    return next(new ErrorResponse('Reaction not found', 404));
  }

  reaction.users = reaction.users.filter(u => u.toString() !== req.user.id);
  reaction.count = reaction.users.length;

  if (reaction.count === 0) {
    announcement.reactions = announcement.reactions.filter(r => r.emoji !== emoji);
  }

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-reaction-removed', {
    announcementId: announcement._id,
    emoji
  });

  res.status(200).json({
    success: true,
    message: 'Reaction removed successfully'
  });
});

// @desc    Pin/Unpin announcement
// @route   PUT /api/announcements/:id/pin
// @access  Private/Admin/Manager
export const togglePin = asyncHandler(async (req, res, next) => {
  const { pin } = req.body;

  let announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to pin this announcement', 403));
  }

  if (pin) {
    const pinnedCount = await Announcement.countDocuments({
      isPinned: true,
      isArchived: false,
      _id: { $ne: announcement._id }
    });

    if (pinnedCount >= 3) {
      return next(new ErrorResponse('Maximum 3 announcements can be pinned', 400));
    }

    announcement.isPinned = true;
    announcement.pinPosition = pinnedCount + 1;
  } else {
    announcement.isPinned = false;
    announcement.pinPosition = undefined;
  }

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id, clearAll: true });

  // Emit real-time update
  io.emit('announcement-pin-toggled', {
    announcementId: announcement._id,
    isPinned: announcement.isPinned
  });

  res.status(200).json({
    success: true,
    message: pin ? 'Announcement pinned successfully' : 'Announcement unpinned successfully',
    data: announcement
  });
});

// @desc    Archive/Unarchive announcement
// @route   PUT /api/announcements/:id/archive
// @access  Private/Admin/Manager
export const toggleArchive = asyncHandler(async (req, res, next) => {
  const { archive } = req.body;

  let announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to archive this announcement', 403));
  }

  announcement.isArchived = archive === true;
  announcement.archivedAt = archive ? new Date() : null;

  if (archive && announcement.isPinned) {
    announcement.isPinned = false;
    announcement.pinPosition = undefined;
  }

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id, clearAll: true });

  // Emit real-time update
  io.emit('announcement-archived', {
    announcementId: announcement._id,
    isArchived: announcement.isArchived
  });

  res.status(200).json({
    success: true,
    message: archive ? 'Announcement archived successfully' : 'Announcement unarchived successfully',
    data: announcement
  });
});

// @desc    Extend announcement expiry
// @route   PUT /api/announcements/:id/extend-expiry
// @access  Private/Admin/Manager
export const extendExpiry = asyncHandler(async (req, res, next) => {
  const { value, unit } = req.body;

  if (!value || !unit) {
    return next(new ErrorResponse('Duration value and unit are required', 400));
  }

  let announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to extend this announcement', 403));
  }

  // Calculate new expiry
  const newExpiresAt = calculateExpiryDate(value, unit);

  announcement.expiresAt = newExpiresAt;
  announcement.lastFor = { value, unit };

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-expiry-extended', {
    announcementId: announcement._id,
    newExpiresAt: announcement.expiresAt
  });

  res.status(200).json({
    success: true,
    message: 'Announcement expiry extended successfully',
    data: announcement
  });
});

// @desc    Get announcements statistics
// @route   GET /api/announcements/stats/overview
// @access  Private/Admin
export const getAnnouncementStats = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to view statistics', 403));
  }

  const total = await Announcement.countDocuments();
  const active = await Announcement.countDocuments({ isArchived: false });
  const archived = await Announcement.countDocuments({ isArchived: true });
  const pinned = await Announcement.countDocuments({ isPinned: true });

  const byCategory = await Announcement.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      total,
      active,
      archived,
      pinned,
      byCategory
    }
  });
});

// @desc    Upload attachments to an existing announcement
// @route   POST /api/announcements/:id/attachments
// @access  Private/Admin/Manager
export const uploadAttachments = asyncHandler(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to add attachments to this announcement', 403));
  }

  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('No files uploaded', 400));
  }

  // Check for duplicate files by hash
  const existingHashes = (announcement.attachments || [])
    .filter(att => !att.isDeleted)
    .map(att => att.file_hash);

  const filesToUpload = [];
  const duplicates = [];

  for (const file of req.files) {
    const hash = generateFileHash(file.buffer);
    if (existingHashes.includes(hash)) {
      duplicates.push(file.originalname);
    } else {
      filesToUpload.push(file);
    }
  }

  if (filesToUpload.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'All files are duplicates',
      duplicates
    });
  }

  // Upload files to Cloudinary
  const uploadResults = await uploadMultipleAnnouncementAttachments(
    filesToUpload,
    announcement._id.toString(),
    req.user.id
  );

  // Add successful uploads to announcement
  if (uploadResults.successful.length > 0) {
    announcement.attachments.push(...uploadResults.successful);
    await announcement.save();
    await announcement.populate('createdBy', 'name email avatar role');
  }

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-attachments-added', {
    announcementId: announcement._id,
    newAttachments: uploadResults.successful
  });

  res.status(200).json({
    success: true,
    message: `${uploadResults.successful.length} attachment(s) uploaded successfully`,
    data: {
      announcement,
      uploaded: uploadResults.successful,
      failed: uploadResults.failed,
      duplicates: duplicates.length > 0 ? duplicates : undefined
    }
  });
});

// @desc    Delete attachment from announcement
// @route   DELETE /api/announcements/:id/attachments/:attachmentId
// @access  Private/Admin/Manager/Creator
export const deleteAttachment = asyncHandler(async (req, res, next) => {
  const { id, attachmentId } = req.params;
  const { permanent = false } = req.query;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  if (!announcement.attachments || typeof announcement.attachments.id !== 'function') {
    return next(new ErrorResponse('No attachments available for this announcement', 404));
  }

  const attachment = announcement.attachments.id(attachmentId);

  if (!attachment) {
    return next(new ErrorResponse('Attachment not found', 404));
  }

  // Check authorization - only creator, admin, or the uploader can delete
  const isCreator = announcement.createdBy.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';
  const isUploader = attachment.uploadedBy?.toString() === req.user.id;

  if (!isCreator && !isAdmin && !isUploader) {
    return next(new ErrorResponse('Not authorized to delete this attachment', 403));
  }

  if (permanent === 'true') {
    // Permanently delete from Cloudinary
    try {
      await deleteAnnouncementAttachment(attachment.public_id, attachment.resource_type);
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error);
    }

    // Remove from database
    announcement.attachments = announcement.attachments.filter(
      att => att._id.toString() !== attachmentId
    );
  } else {
    // Soft delete
    attachment.isDeleted = true;
    attachment.deletedAt = new Date();
    attachment.deletedBy = req.user.id;
  }

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-attachment-deleted', {
    announcementId: announcement._id,
    attachmentId,
    permanent: permanent === 'true'
  });

  res.status(200).json({
    success: true,
    message: permanent === 'true' ? 'Attachment permanently deleted' : 'Attachment deleted successfully',
    data: announcement
  });
});

// @desc    Restore soft-deleted attachment
// @route   PUT /api/announcements/:id/attachments/:attachmentId/restore
// @access  Private/Admin
export const restoreAttachment = asyncHandler(async (req, res, next) => {
  const { id, attachmentId } = req.params;

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Only admin can restore
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to restore attachments', 403));
  }

  const attachment = announcement.attachments.id(attachmentId);

  if (!attachment) {
    return next(new ErrorResponse('Attachment not found', 404));
  }

  if (!attachment.isDeleted) {
    return next(new ErrorResponse('Attachment is not deleted', 400));
  }

  attachment.isDeleted = false;
  attachment.deletedAt = null;
  attachment.deletedBy = null;

  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  // Emit real-time update
  io.emit('announcement-attachment-restored', {
    announcementId: announcement._id,
    attachmentId
  });

  res.status(200).json({
    success: true,
    message: 'Attachment restored successfully',
    data: attachment
  });
});

// @desc    Update attachment tag
// @route   PUT /api/announcements/:id/attachments/:attachmentId/tag
// @access  Private/Admin/Manager
export const updateAttachmentTag = asyncHandler(async (req, res, next) => {
  const { id, attachmentId } = req.params;
  const { tag } = req.body;

  const validTags = ['notice', 'holiday', 'exam', 'general', 'policy', 'other'];

  if (!tag || !validTags.includes(tag)) {
    return next(new ErrorResponse(`Invalid tag. Must be one of: ${validTags.join(', ')}`, 400));
  }

  const announcement = await Announcement.findById(id);

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  // Check authorization
  if (announcement.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update attachment tag', 403));
  }

  const attachment = announcement.attachments.id(attachmentId);

  if (!attachment) {
    return next(new ErrorResponse('Attachment not found', 404));
  }

  attachment.tag = tag;
  await announcement.save();

  // Invalidate cache
  invalidateAnnouncementCache({ announcementId: announcement._id });

  res.status(200).json({
    success: true,
    message: 'Attachment tag updated successfully',
    data: attachment
  });
});

// @desc    Get announcement attachments
// @route   GET /api/announcements/:id/attachments
// @access  Private
export const getAttachments = asyncHandler(async (req, res, next) => {
  const { includeDeleted = false } = req.query;

  const announcement = await Announcement.findById(req.params.id)
    .select('attachments createdBy')
    .populate('attachments.uploadedBy', 'name avatar');

  if (!announcement) {
    return next(new ErrorResponse('Announcement not found', 404));
  }

  let attachments = Array.isArray(announcement.attachments) ? announcement.attachments : [];

  // Filter out deleted attachments unless admin requests them
  if (includeDeleted !== 'true' || req.user.role !== 'admin') {
    attachments = attachments.filter(att => !att.isDeleted);
  }

  // Separate images and documents
  const images = attachments.filter(att => att.resource_type === 'image');
  const documents = attachments.filter(att => att.resource_type === 'raw');

  res.status(200).json({
    success: true,
    data: {
      all: attachments,
      images,
      documents,
      totalCount: attachments.length,
      imageCount: images.length,
      documentCount: documents.length
    }
  });
});

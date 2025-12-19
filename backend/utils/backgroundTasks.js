import { sendEmail } from './email.js';
import notificationService from './notificationService.js';
import { sendPushNotification } from './pushNotification.js';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Attachment from '../models/Attachment.js';
import { io } from '../server.js';
import { deleteFromCloudinary, deleteMultipleFromCloudinary } from './cloudinary.js';

// Schedule an async function to run in background without blocking request
export const runBackground = (fn) => {
  try {
    setImmediate(async () => {
      try {
        await fn();
      } catch (err) {
        console.error('Background task failed:', err);
      }
    });
  } catch (err) {
    console.error('Failed to schedule background task:', err);
  }
};

export const sendEmailInBackground = (emailOptions) => {
  runBackground(async () => {
    try {
      await sendEmail(emailOptions);
    } catch (err) {
      console.error('sendEmailInBackground error:', err);
    }
  });
};

export const createNotificationInBackground = (notificationData) => {
  runBackground(async () => {
    try {
      await notificationService.createNotification(notificationData);
    } catch (err) {
      console.error('createNotificationInBackground error:', err);
    }
  });
};

// Background task for project creation notifications
export const notifyProjectCreatedInBackground = (board, creatorId) => {
  runBackground(async () => {
    try {
      await notificationService.notifyProjectCreated(board, creatorId);
    } catch (err) {
      console.error('notifyProjectCreatedInBackground error:', err);
    }
  });
};

// Background task for project-related emails
export const sendProjectEmailsInBackground = (board, members) => {
  runBackground(async () => {
    try {
      // Get member details for email
      const memberDocs = await User.find({ _id: { $in: members } }).select('email name');
      
      for (const member of memberDocs) {
        if (member.email) {
          await sendEmail({
            to: member.email,
            subject: `You've been added to project: ${board.name}`,
            html: `
              <h2>New Project Assignment</h2>
              <p>Hi ${member.name},</p>
              <p>You have been added to the project <strong>${board.name}</strong>.</p>
              <p>Description: ${board.description || 'No description provided'}</p>
              <p>Start Date: ${board.startDate ? new Date(board.startDate).toLocaleDateString() : 'Not set'}</p>
              <p>Due Date: ${board.dueDate ? new Date(board.dueDate).toLocaleDateString() : 'Not set'}</p>
              <br>
              <p>Best regards,<br>FlowTask Team</p>
            `
          });
        }
      }
    } catch (err) {
      console.error('sendProjectEmailsInBackground error:', err);
    }
  });
};

// Background task for logging project activities
export const logProjectActivityInBackground = (activityData) => {
  runBackground(async () => {
    try {
      const Activity = (await import('../models/Activity.js')).default;
      await Activity.create(activityData);
    } catch (err) {
      console.error('logProjectActivityInBackground error:', err);
    }
  });
};

// Background task for cache invalidation
export const invalidateCacheInBackground = (cacheKeys) => {
  runBackground(async () => {
    try {
      const { invalidateCache } = await import('../middleware/cache.js');
      for (const key of cacheKeys) {
        invalidateCache(key);
      }
    } catch (err) {
      console.error('invalidateCacheInBackground error:', err);
    }
  });
};

export const notifyAdminsUserRegisteredInBackground = (user, adminIds) => {
  runBackground(async () => {
    try {
      await notificationService.notifyUserRegistered(user, adminIds);
    } catch (err) {
      console.error('notifyAdminsUserRegisteredInBackground error:', err);
    }
  });
};

export const notifyAdminsUserCreatedInBackground = (user, admins, meta = {}) => {
  runBackground(async () => {
    try {
      // create notifications for each admin about a user created by admin
      const notifications = [];
      const departmentName = meta.departmentName || 'No department assigned';
      admins.forEach(admin => {
        notifications.push({
          type: 'user_created',
          title: 'New User Created',
          message: `A new user ${user.name} (${user.email}) has been created and assigned to ${departmentName}.`,
          user: admin._id || admin,
          sender: meta.creatorId || null
        });
      });
      await notificationService.createBulkNotifications(notifications);
    } catch (err) {
      console.error('notifyAdminsUserCreatedInBackground error:', err);
    }
  });
};

export const sendPushInBackground = (notification, pushSubscription) => {
  runBackground(async () => {
    try {
      if (pushSubscription) await sendPushNotification(notification, pushSubscription);
    } catch (err) {
      console.error('sendPushInBackground error:', err);
    }
  });
};

// Process scheduled announcements
export const processScheduledAnnouncements = () => {
  runBackground(async () => {
    try {
      const now = new Date();
      
      // Find announcements that should be broadcasted
      const scheduledAnnouncements = await Announcement.find({
        isScheduled: true,
        scheduleBroadcasted: false,
        scheduledFor: { $lte: now }
      }).populate('createdBy').populate('subscribers.users').populate('subscribers.departments');

      for (const announcement of scheduledAnnouncements) {
        try {
          // Get subscriber user IDs
          let subscriberIds = [];
          
          if (announcement.subscribers.type === 'all') {
            const users = await User.find({ isActive: true, isVerified: true }).select('_id');
            subscriberIds = users.map(u => u._id);
          } else if (announcement.subscribers.type === 'departments') {
            const users = await User.find({
              department: { $in: announcement.subscribers.departments },
              isActive: true,
              isVerified: true
            }).select('_id');
            subscriberIds = users.map(u => u._id);
          } else if (announcement.subscribers.type === 'users') {
            subscriberIds = announcement.subscribers.users.map(u => u._id || u);
          } else if (announcement.subscribers.type === 'managers') {
            const users = await User.find({
              role: 'manager',
              isActive: true,
              isVerified: true
            }).select('_id');
            subscriberIds = users.map(u => u._id);
          }

          // Create notifications
          const notifications = subscriberIds.map(userId => ({
            type: 'announcement_created',
            title: 'New Announcement',
            message: `${announcement.createdBy.name} posted: ${announcement.title}`,
            user: userId,
            sender: announcement.createdBy._id,
            relatedAnnouncement: announcement._id,
            isRead: false
          }));

          await Notification.insertMany(notifications);

          // Emit real-time notification
          subscriberIds.forEach(userId => {
            io.to(`user-${userId}`).emit('announcement-created', {
              announcement: announcement.toJSON(),
              notification: {
                type: 'announcement_created',
                title: 'New Announcement',
                message: `${announcement.createdBy.name} posted: ${announcement.title}`
              }
            });
          });

          // Mark announcement as broadcasted
          announcement.scheduleBroadcasted = true;
          announcement.broadcastedAt = new Date();
          announcement.broadcastedTo = subscriberIds;
          await announcement.save();

          // Send background emails
          notificationService.sendAnnouncementEmails(announcement, subscriberIds);

          console.log(`Scheduled announcement ${announcement._id} broadcasted to ${subscriberIds.length} users`);
        } catch (error) {
          console.error(`Error broadcasting scheduled announcement ${announcement._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing scheduled announcements:', error);
    }
  });
};

// Archive expired announcements
export const archiveExpiredAnnouncements = () => {
  runBackground(async () => {
    try {
      const now = new Date();

      // Find expired announcements that are not archived
      const expiredAnnouncements = await Announcement.find({
        expiresAt: { $lte: now },
        isArchived: false
      });

      for (const announcement of expiredAnnouncements) {
        try {
          announcement.isArchived = true;
          announcement.archivedAt = now;

          // Unpin if pinned
          if (announcement.isPinned) {
            announcement.isPinned = false;
            announcement.pinPosition = undefined;
          }

          await announcement.save();

          // Emit real-time notification
          io.emit('announcement-archived', {
            announcementId: announcement._id,
            isArchived: true,
            reason: 'expired'
          });

          console.log(`Announcement ${announcement._id} archived due to expiry`);
        } catch (error) {
          console.error(`Error archiving announcement ${announcement._id}:`, error);
        }
      }

      if (expiredAnnouncements.length > 0) {
        console.log(`${expiredAnnouncements.length} announcements archived`);
      }
    } catch (error) {
      console.error('Error archiving expired announcements:', error);
    }
  });
};

// Cleanup trash - permanently delete attachments after 30 days
export const cleanupTrash = () => {
  setTimeout(async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const trashItems = await Attachment.find({
        isDeleted: true,
        deletedAt: { $lte: thirtyDaysAgo }
      }).lean();

      if (trashItems.length === 0) {
        console.log('[Trash Cleanup] No items to clean up');
        return;
      }

      console.log(`[Trash Cleanup] Found ${trashItems.length} items to permanently delete`);

      // Separate by resource type for batch deletion
      const imageIds = trashItems
        .filter(a => a.resourceType === 'image')
        .map(a => a.publicId);
      const rawIds = trashItems
        .filter(a => a.resourceType !== 'image')
        .map(a => a.publicId);

      // Delete from Cloudinary
      try {
        if (imageIds.length > 0) {
          await deleteMultipleFromCloudinary(imageIds, 'image');
          console.log(`[Trash Cleanup] Deleted ${imageIds.length} images from Cloudinary`);
        }
        if (rawIds.length > 0) {
          await deleteMultipleFromCloudinary(rawIds, 'raw');
          console.log(`[Trash Cleanup] Deleted ${rawIds.length} raw files from Cloudinary`);
        }
      } catch (error) {
        console.error('[Trash Cleanup] Cloudinary deletion error:', error.message);
      }

      // Delete from MongoDB
      const deleted = await Attachment.deleteMany({
        _id: { $in: trashItems.map(a => a._id) }
      });

      console.log(`[Trash Cleanup] Deleted ${deleted.deletedCount} attachments from database`);

      // Notify admins (optional)
      // Could send email to admins about cleanup
    } catch (error) {
      console.error('[Trash Cleanup] Error during cleanup:', error);
    }
  }, 5000); // Start after 5 seconds
};

// Start background jobs (call from server initialization)
export const startBackgroundJobs = () => {
  // Process scheduled announcements every 30 seconds
  setInterval(() => {
    processScheduledAnnouncements();
  }, 30000);

  // Archive expired announcements every 5 minutes
  setInterval(() => {
    archiveExpiredAnnouncements();
  }, 300000);

  // Cleanup trash every 6 hours (check for items older than 30 days)
  setInterval(() => {
    cleanupTrash();
  }, 6 * 60 * 60 * 1000);

  // Run cleanup immediately on startup
  cleanupTrash();

  console.log('Background jobs started: scheduled announcements, expiry handler, and trash cleanup');
};

export default {
  runBackground,
  sendEmailInBackground,
  createNotificationInBackground,
  notifyAdminsUserRegisteredInBackground,
  notifyAdminsUserCreatedInBackground,
  sendPushInBackground,
  processScheduledAnnouncements,
  archiveExpiredAnnouncements,
  cleanupTrash,
  startBackgroundJobs,
  notifyProjectCreatedInBackground,
  sendProjectEmailsInBackground,
  logProjectActivityInBackground,
  invalidateCacheInBackground
};

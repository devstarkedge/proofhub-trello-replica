import Notification from '../models/Notification.js';
import '../models/User.js';
import '../realtime/index.js';
import { publishInboxChange } from '../realtime/notificationEvents.js';
import notificationService from '../utils/notificationService.js';

// Get paginated notifications
export const getNotifications = async (req, res) => {
  try {
    const { 
      limit = 20, 
      skip = 0, 
      filter = 'all', 
      type,
      priority,
      includeArchived = false 
    } = req.query;
    
    const query = { user: req.user.id, workspaceId: req.workspaceId };
    
    // Filter by archived status
    if (!includeArchived || includeArchived === 'false') {
      query.isArchived = { $ne: true };
    }
    
    // Filter by read status
    if (filter === 'unread') {
      query.isRead = false;
    }
    
    // Filter by mentions (comment_mention type)
    if (filter === 'mentions') {
      query.type = 'comment_mention';
    }
    
    // Filter by tasks (all task-related types)
    if (filter === 'tasks') {
      query.type = { 
        $in: [
          'task_assigned', 
          'task_updated', 
          'task_due_soon', 
          'task_overdue', 
          'task_created', 
          'task_deleted', 
          'task_moved', 
          'task_completed'
        ] 
      };
    }
    
    // Filter by type (explicit type parameter)
    if (type) {
      query.type = type;
    }
    
    // Filter by priority
    if (priority) {
      query.priority = priority;
    }
    
    const pageLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const pageSkip = Math.min(10000, Math.max(0, Number.parseInt(skip, 10) || 0));
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('relatedCard', 'title')
        .populate('relatedBoard', 'name')
        .populate('relatedTeam', 'name')
        .populate('sender', 'name email avatar')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user.id, isRead: false, isArchived: { $ne: true } })
    ]);
    
    res.json({
      notifications,
      pagination: {
        total,
        limit: pageLimit,
        skip: pageSkip,
        hasMore: pageSkip + notifications.length < total
      },
      unreadCount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get unread count (fast endpoint)
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      user: req.user.id, 
      isRead: false,
      isArchived: { $ne: true }
    });
    res.json({ count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Mark single notification as read
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ msg: 'Notification not found' });
    if (notification.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    publishInboxChange(req.user.id, { action: 'read', notificationId: String(notification._id) });
    res.json(notification);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, isRead: false, isArchived: { $ne: true } }, 
      { isRead: true, readAt: new Date() }
    );
    publishInboxChange(req.user.id, { action: 'read-all' });
    res.json({ msg: 'All notifications marked as read', modified: result.modifiedCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Archive notification (soft delete)
export const archiveNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ msg: 'Notification not found' });
    if (notification.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    notification.isArchived = true;
    notification.archivedAt = new Date();
    await notification.save();
    publishInboxChange(req.user.id, { action: 'archive' });
    res.json({ msg: 'Notification archived', notification });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Bulk archive notifications
export const bulkArchive = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ msg: 'Invalid notification IDs' });
    }
    
    const result = await Notification.updateMany(
      { _id: { $in: ids }, user: req.user.id },
      { isArchived: true, archivedAt: new Date() }
    );
    
    publishInboxChange(req.user.id, { action: 'archive-many' });
    res.json({ msg: 'Notifications archived', modified: result.modifiedCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get archived notifications
export const getArchivedNotifications = async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    const pageLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const pageSkip = Math.min(10000, Math.max(0, Number.parseInt(skip, 10) || 0));
    
    const [notifications, total] = await Promise.all([
      Notification.find({ user: req.user.id, isArchived: true })
        .populate('relatedCard', 'title')
        .populate('relatedBoard', 'name')
        .populate('sender', 'name email avatar')
        .sort({ archivedAt: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      Notification.countDocuments({ user: req.user.id, isArchived: true })
    ]);
    
    res.json({
      notifications,
      pagination: {
        total,
        limit: pageLimit,
        skip: pageSkip,
        hasMore: pageSkip + notifications.length < total
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Restore archived notification
export const restoreNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ msg: 'Notification not found' });
    if (notification.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    notification.isArchived = false;
    notification.archivedAt = null;
    await notification.save();
    publishInboxChange(req.user.id, { action: 'restore' });
    res.json({ msg: 'Notification restored', notification });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Permanently delete notification
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ msg: 'Notification not found' });
    if (notification.user.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    await Notification.findByIdAndDelete(req.params.id);
    publishInboxChange(req.user.id, { action: 'delete' });
    res.json({ msg: 'Notification deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Bulk delete notifications
export const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ msg: 'Invalid notification IDs' });
    }
    
    const result = await Notification.deleteMany({
      _id: { $in: ids },
      user: req.user.id
    });
    
    publishInboxChange(req.user.id, { action: 'delete-many' });
    res.json({ msg: 'Notifications deleted', deleted: result.deletedCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Clear all notifications (archive all)
export const clearAll = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, isArchived: { $ne: true } },
      { isArchived: true, archivedAt: new Date() }
    );
    publishInboxChange(req.user.id, { action: 'clear' });
    res.json({ msg: 'All notifications cleared', modified: result.modifiedCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Test notification endpoint for settings verification
export const sendTestNotification = async (req, res) => {
  try {
    await notificationService.createNotification({
      type: 'test_notification',
      title: 'Test Notification',
      message: 'This is a test notification to verify your notification settings are working correctly.',
      user: req.user.id,
      sender: req.user.id,
      priority: 'low'
    });

    res.json({ message: 'Test notification sent successfully' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ message: 'Failed to send test notification' });
  }
};

// Subscribe to feature (Coming Soon)
export const subscribeToFeature = async (req, res) => {
  try {
    const { email, feature } = req.body;

    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: 'Invalid email format' });
    }

    // Send confirmation email
    const { sendComingSoonSubscriptionEmail } = await import('../utils/email.js');
    await sendComingSoonSubscriptionEmail(email, feature);

    res.json({ success: true, message: 'Subscription successful' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ msg: 'Server error during subscription' });
  }
};

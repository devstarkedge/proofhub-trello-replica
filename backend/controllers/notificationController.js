import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { emitNotification } from '../realtime/index.js';
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
    
    const query = { user: req.user.id };
    
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
    
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('relatedCard', 'title')
        .populate('relatedBoard', 'name')
        .populate('relatedTeam', 'name')
        .populate('sender', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user.id, isRead: false, isArchived: { $ne: true } })
    ]);
    
    res.json({
      notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + notifications.length < total
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
    
    const [notifications, total] = await Promise.all([
      Notification.find({ user: req.user.id, isArchived: true })
        .populate('relatedCard', 'title')
        .populate('relatedBoard', 'name')
        .populate('sender', 'name email avatar')
        .sort({ archivedAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments({ user: req.user.id, isArchived: true })
    ]);
    
    res.json({
      notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + notifications.length < total
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

    // Notify admins about the interest (optional but good for tracking)
    // We run this in background
    const { runBackground } = await import('../utils/backgroundTasks.js');
    runBackground(async () => {
      try {
        const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
        const adminIds = admins.map(a => a._id);
        
        await notificationService.createNotification({
          type: 'system_alert',
          title: 'New Feature Interest',
          message: `A user (${email}) is interested in the feature: "${feature || 'Coming Soon Page'}"`,
          user: adminIds[0], // Just notify first admin for now or usage a loop if needed, but 'createNotification' takes single user. 
                             // Ideally we use a bulk notify method or loop. Let's loop.
          sender: null,
          priority: 'low'
        });
        
        // Loop for other admins if any
        for (let i = 1; i < adminIds.length; i++) {
           await notificationService.createNotification({
            type: 'system_alert',
            title: 'New Feature Interest',
            message: `A user (${email}) is interested in the feature: "${feature || 'Coming Soon Page'}"`,
            user: adminIds[i],
            sender: null,
            priority: 'low'
          });
        }
      } catch (err) {
        console.error('Failed to notify admins of subscription:', err);
      }
    });

    res.json({ success: true, message: 'Subscription successful' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ msg: 'Server error during subscription' });
  }
};

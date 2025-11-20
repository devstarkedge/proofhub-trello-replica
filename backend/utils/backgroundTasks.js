import { sendEmail } from './email.js';
import notificationService from './notificationService.js';
import { sendPushNotification } from './pushNotification.js';

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

export default {
  runBackground,
  sendEmailInBackground,
  createNotificationInBackground,
  notifyAdminsUserRegisteredInBackground,
  notifyAdminsUserCreatedInBackground,
  sendPushInBackground
};

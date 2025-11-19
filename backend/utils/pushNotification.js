import webpush from 'web-push';
import User from '../models/User.js';

let vapidKeys = null;

// Initialize VAPID keys
const initVapidKeys = () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    if (process.env.NODE_ENV !== 'production') console.log('VAPID keys not configured - push notifications will not be sent');
    return null;
  }

  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };

  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_USER || 'noreply@flowtask.com'}`,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  return vapidKeys;
};

// Send push notification
export const sendPushNotification = async (notification, pushSubscription) => {
  if (!vapidKeys) {
    vapidKeys = initVapidKeys();
  }

  if (!vapidKeys || !pushSubscription) {
    console.log('Push notification not sent - VAPID keys or subscription missing');
    return;
  }

  try {
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.message,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        notificationId: notification._id,
        type: notification.type,
        url: getNotificationUrl(notification)
      },
      actions: [
        {
          action: 'view',
          title: 'View'
        },
        {
          action: 'reply',
          title: 'Reply'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    });

    await webpush.sendNotification(pushSubscription, payload);
    if (process.env.NODE_ENV !== 'production') console.log('Push notification sent successfully');
  } catch (error) {
    console.error('Error sending push notification:', error);

    // If subscription is invalid, remove it from the database
    if (error.statusCode === 410) {
      if (process.env.NODE_ENV !== 'production') console.log('Push subscription expired, removing from database');
      try {
        await User.findByIdAndUpdate(notification.user, { $unset: { pushSubscription: 1 } });
      } catch (cleanupError) {
        if (process.env.NODE_ENV !== 'production') console.error('Error removing expired push subscription:', cleanupError);
      }
    }
  }
};

// Get notification URL for click action
const getNotificationUrl = (notification) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  switch (notification.type) {
    case 'task_assigned':
    case 'task_updated':
    case 'task_deleted':
    case 'comment_added':
    case 'comment_mention':
      return `${baseUrl}/board/${notification.relatedBoard}?card=${notification.relatedCard}`;
    case 'project_created':
    case 'project_deleted':
    case 'project_updates':
      return `${baseUrl}/board/${notification.relatedBoard}`;
    case 'user_registered':
      return `${baseUrl}/admin/users`;
    default:
      return baseUrl;
  }
};

// Get VAPID keys for client-side subscription
export const getVapidKeys = () => {
  if (!vapidKeys) {
    vapidKeys = initVapidKeys();
  }
  return vapidKeys;
};

// Get VAPID public key for client-side subscription
export const getVapidPublicKey = () => {
  if (!vapidKeys) {
    vapidKeys = initVapidKeys();
  }
  return vapidKeys ? vapidKeys.publicKey : null;
};

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
    // WNS (Windows) limits payload to 5120 bytes, FCM to ~4KB.
    // Build a safe payload that fits within 4KB after JSON serialization.
    const MAX_PAYLOAD_BYTES = 4000; // Leave headroom for encryption overhead

    // Safely extract an ID string from a value that could be:
    // - a plain string
    // - a Mongoose ObjectId (has toHexString)
    // - a populated Mongoose document (has _id)
    const safeId = (val) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val.toHexString === 'function') return val.toHexString();
      if (val._id) return safeId(val._id);
      const str = String(val);
      return str.length <= 50 ? str : null;
    };

    const data = {
      notificationId: safeId(notification._id),
      type: notification.type,
      url: getNotificationUrl(notification)
    };

    // Only include IDs if present (saves bytes)
    const deptId = notification.departmentId || notification.metadata?.departmentId;
    const projId = notification.projectId || notification.relatedBoard || notification.metadata?.projectId;
    const tskId = notification.taskId || notification.relatedCard || notification.metadata?.taskId;
    if (deptId) data.departmentId = safeId(deptId);
    if (projId) data.projectId = safeId(projId);
    if (tskId) data.taskId = safeId(tskId);

    let title = notification.title || 'FlowTask';
    let body = notification.message || '';

    // Truncate title and body to ensure payload fits
    if (title.length > 80) title = title.slice(0, 77) + '...';
    if (body.length > 200) body = body.slice(0, 197) + '...';

    let payloadObj = {
      title,
      body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data,
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    let payload = JSON.stringify(payloadObj);

    // If still too large, progressively trim
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      // Remove actions
      delete payloadObj.actions;
      payload = JSON.stringify(payloadObj);
    }
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      // Aggressively truncate body
      payloadObj.body = body.slice(0, 80) + '...';
      payload = JSON.stringify(payloadObj);
    }

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

// Safely extract an ID string (handles ObjectId, populated docs, strings)
const extractId = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val.toHexString === 'function') return val.toHexString();
  if (val._id) return extractId(val._id);
  const str = String(val);
  return str.length <= 50 ? str : null;
};

// Get notification URL for click action
const getNotificationUrl = (notification) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const departmentId = extractId(notification.departmentId || notification.metadata?.departmentId);
  const projectId = extractId(notification.projectId || notification.relatedBoard || notification.metadata?.projectId);
  const taskId = extractId(notification.taskId || notification.relatedCard || notification.metadata?.taskId);

  if (departmentId && projectId && taskId) {
    return `${baseUrl}/workflow/${departmentId}/${projectId}/${taskId}`;
  }

  switch (notification.type) {
    case 'announcement_created':
    case 'announcement':
      const announcementId = extractId(notification.relatedAnnouncement || notification.metadata?.announcementId);
      return announcementId 
        ? `${baseUrl}/announcements?open=${announcementId}`
        : `${baseUrl}/announcements`;
    case 'task_assigned':
    case 'task_updated':
    case 'task_deleted':
    case 'comment_added':
    case 'comment_mention':
      if (projectId && taskId) {
        return `${baseUrl}/workflow/${projectId}?card=${taskId}`;
      }
      return `${baseUrl}`;
    case 'project_created':
    case 'project_deleted':
    case 'project_updates':
      return `${baseUrl}/workflow/${extractId(notification.relatedBoard)}`;
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

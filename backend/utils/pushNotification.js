import webpush from 'web-push';
import User from '../models/User.js';

let vapidKeys = null;

const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizePushSubscription = (subscription = {}, metadata = {}) => ({
  endpoint: subscription.endpoint,
  keys: subscription.keys,
  deviceId: metadata.deviceId || null,
  browser: metadata.browser || null,
  platform: metadata.platform || 'web',
  userAgent: metadata.userAgent || null,
  permissionState: metadata.permissionState || 'default',
  subscriptionStatus: metadata.subscriptionStatus || 'active',
  lastPromptedAt: normalizeDate(metadata.lastPromptedAt),
  lastDismissedAt: normalizeDate(metadata.lastDismissedAt),
  cooldownUntil: normalizeDate(metadata.cooldownUntil),
  dismissCount: Number.isFinite(metadata.dismissCount) ? metadata.dismissCount : 0,
  dontAskAgain: Boolean(metadata.dontAskAgain),
  lastValidatedAt: new Date(),
  lastSeenAt: new Date(),
  createdAt: normalizeDate(metadata.createdAt) || new Date(),
  updatedAt: new Date(),
});

const toPlainSubscription = (entry = {}) => (
  typeof entry?.toObject === 'function' ? entry.toObject() : entry
);

const getStoredPushDeviceStates = (user = {}) => {
  if (Array.isArray(user.pushSubscriptions) && user.pushSubscriptions.length > 0) {
    return user.pushSubscriptions;
  }

  if (user.pushSubscription?.endpoint && user.pushSubscription?.keys?.p256dh && user.pushSubscription?.keys?.auth) {
    return [normalizePushSubscription(user.pushSubscription, {
      permissionState: 'granted',
      subscriptionStatus: 'active',
    })];
  }

  return [];
};

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

export const getUserPushSubscriptions = (user = {}) => {
  return getStoredPushDeviceStates(user).filter((subscription) => (
    subscription?.subscriptionStatus === 'active'
    && subscription?.endpoint
    && subscription?.keys?.p256dh
    && subscription?.keys?.auth
  ));
};

export const saveUserPushSubscription = async (userId, payload = {}) => {
  const subscription = payload.subscription || payload;
  const user = await User.findById(userId);
  if (!user) return null;

  const currentDeviceStates = getStoredPushDeviceStates(user);
  const existingEntry = currentDeviceStates.find((entry) => {
    if (subscription?.endpoint && entry.endpoint === subscription.endpoint) return true;
    if (payload.deviceId && entry.deviceId === payload.deviceId) return true;
    return false;
  });
  const existingState = toPlainSubscription(existingEntry);
  const mergedSubscription = {
    endpoint: subscription?.endpoint || existingState?.endpoint,
    keys: subscription?.keys || existingState?.keys,
  };

  if (!mergedSubscription.endpoint && !payload.deviceId) {
    return user;
  }

  const normalized = normalizePushSubscription(mergedSubscription, {
    ...existingState,
    ...payload,
    permissionState: payload.permissionState || existingState?.permissionState || (mergedSubscription.endpoint ? 'granted' : 'default'),
    subscriptionStatus: payload.subscriptionStatus || existingState?.subscriptionStatus || (mergedSubscription.endpoint ? 'active' : 'missing'),
    lastPromptedAt: payload.lastPromptedAt || existingState?.lastPromptedAt,
    lastDismissedAt: payload.lastDismissedAt || existingState?.lastDismissedAt,
    cooldownUntil: payload.cooldownUntil || existingState?.cooldownUntil,
    dismissCount: Number.isFinite(payload.dismissCount) ? payload.dismissCount : (existingState?.dismissCount || 0),
    dontAskAgain: typeof payload.dontAskAgain === 'boolean' ? payload.dontAskAgain : existingState?.dontAskAgain,
    createdAt: existingState?.createdAt || payload.createdAt,
  });
  const nextSubscriptions = currentDeviceStates.filter((entry) => {
    if (entry.endpoint === normalized.endpoint) return false;
    if (normalized.deviceId && entry.deviceId === normalized.deviceId) return false;
    return true;
  });

  user.pushSubscriptions = [...nextSubscriptions, normalized];
  const nextActiveSubscription = user.pushSubscriptions.find((entry) => (
    entry?.subscriptionStatus === 'active'
    && entry?.endpoint
    && entry?.keys?.p256dh
    && entry?.keys?.auth
  ));
  user.pushSubscription = nextActiveSubscription
    ? {
      endpoint: nextActiveSubscription.endpoint,
      keys: nextActiveSubscription.keys,
    }
    : undefined;

  await user.save();
  return user;
};

export const removeUserPushSubscription = async (userId, { endpoint = null, deviceId = null } = {}) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const remaining = getStoredPushDeviceStates(user).filter((entry) => {
    if (endpoint && entry.endpoint === endpoint) return false;
    if (deviceId && entry.deviceId === deviceId) return false;
    if (!endpoint && !deviceId) return false;
    return true;
  });

  user.pushSubscriptions = remaining;
  user.pushSubscription = remaining[0]
    ? { endpoint: remaining[0].endpoint, keys: remaining[0].keys }
    : undefined;

  await user.save();
  return user;
};

export const getPushStatusForDevice = (user = {}, { deviceId = null, endpoint = null } = {}) => {
  const subscriptions = getStoredPushDeviceStates(user);
  const currentDevice = endpoint
    ? subscriptions.find((entry) => entry.endpoint === endpoint)
    : deviceId
      ? subscriptions.find((entry) => entry.deviceId && entry.deviceId === deviceId)
      : null;
  const cooldownUntil = normalizeDate(currentDevice?.cooldownUntil);

  return {
    userPushEnabled: user.settings?.notifications?.push !== false,
    currentDevice: {
      deviceId,
      endpoint,
      hasSubscription: Boolean(currentDevice),
      isValid: Boolean(currentDevice && currentDevice.subscriptionStatus === 'active' && currentDevice.endpoint),
      permissionState: currentDevice?.permissionState || 'default',
      subscriptionStatus: currentDevice?.subscriptionStatus || 'missing',
      browser: currentDevice?.browser || null,
      platform: currentDevice?.platform || 'web',
      cooldownUntil,
      dismissCount: currentDevice?.dismissCount || 0,
      dontAskAgain: Boolean(currentDevice?.dontAskAgain),
      lastSeenAt: currentDevice?.lastSeenAt || null,
      lastValidatedAt: currentDevice?.lastValidatedAt || null,
    },
    prompt: {
      canPrompt: !currentDevice?.dontAskAgain && (!cooldownUntil || cooldownUntil.getTime() <= Date.now()),
      cooldownUntil,
    },
  };
};

// Send push notification
export const sendPushNotification = async (notification, pushSubscription) => {
  if (!vapidKeys) {
    vapidKeys = initVapidKeys();
  }

  const subscriptions = Array.isArray(pushSubscription)
    ? pushSubscription
    : pushSubscription
      ? [pushSubscription]
      : [];

  if (!vapidKeys || subscriptions.length === 0) {
    console.log('Push notification not sent - VAPID keys or subscription missing');
    return { sent: 0 };
  }

  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      const MAX_PAYLOAD_BYTES = 4000;

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

      const deptId = notification.departmentId || notification.metadata?.departmentId;
      const projId = notification.projectId || notification.relatedBoard || notification.metadata?.projectId;
      const tskId = notification.taskId || notification.relatedCard || notification.metadata?.taskId;
      if (deptId) data.departmentId = safeId(deptId);
      if (projId) data.projectId = safeId(projId);
      if (tskId) data.taskId = safeId(tskId);

      let title = notification.title || 'FlowTask';
      let body = notification.message || '';

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
      if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
        delete payloadObj.actions;
        payload = JSON.stringify(payloadObj);
      }
      if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
        payloadObj.body = body.slice(0, 80) + '...';
        payload = JSON.stringify(payloadObj);
      }

      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
      sent += 1;
      if (process.env.NODE_ENV !== 'production') console.log('Push notification sent successfully');
    } catch (error) {
      console.error('Error sending push notification:', error);
      if (error.statusCode === 404 || error.statusCode === 410) {
        if (process.env.NODE_ENV !== 'production') console.log('Push subscription expired, removing from database');
        try {
          await removeUserPushSubscription(notification.user, { endpoint: subscription.endpoint, deviceId: subscription.deviceId || null });
        } catch (cleanupError) {
          if (process.env.NODE_ENV !== 'production') console.error('Error removing expired push subscription:', cleanupError);
        }
      }
    }
  }

  return { sent };
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
    const baseUrl = process.env.FRONTEND_URL || '';
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
    case 'sales_tab_approval':
    case 'sales_tab_result': {
      const tabId = extractId(notification.metadata?.tabId || notification.entityId);
      return tabId ? `${baseUrl}/sales?openApproval=${tabId}` : `${baseUrl}/sales`;
    }
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

/**
 * SalesTab Service
 *
 * Business logic for custom saved tabs — CRUD, approval workflow,
 * unread badge management, and limit enforcement.
 */
import SalesTab from './salesTab.model.js';

const MAX_TABS_PER_USER = 10;
const MAX_WATCH_TABS_PER_USER = 5;

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createTab(userId, userName, data) {
  // Enforce tab limit
  const tabCount = await SalesTab.countDocuments({ ownerId: userId });
  if (tabCount >= MAX_TABS_PER_USER) {
    const err = new Error(`Maximum ${MAX_TABS_PER_USER} custom tabs allowed`);
    err.status = 400;
    throw err;
  }

  // Enforce watch tab limit
  if (data.isWatchTab) {
    const watchCount = await SalesTab.countDocuments({ ownerId: userId, isWatchTab: true });
    if (watchCount >= MAX_WATCH_TABS_PER_USER) {
      const err = new Error(`Maximum ${MAX_WATCH_TABS_PER_USER} watch tabs allowed`);
      err.status = 400;
      throw err;
    }
  }

  const tab = new SalesTab({
    ...data,
    ownerId: userId,
    ownerName: userName,
    // Private tabs auto-approved (pre-save hook also handles this)
    approvalStatus: data.visibility === 'private' ? 'approved' : 'pending',
  });

  await tab.save();
  return tab.toObject();
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Get tabs visible to a user:
 * - Own tabs (all statuses)
 * - Approved shared/public tabs from others
 * - For admin: also pending shared/public tabs
 */
export async function getUserTabs(userId, role) {
  const isAdmin = role === 'admin';

  const query = {
    $or: [
      // User's own tabs
      { ownerId: userId },
      // Approved shared/public from anyone
      { visibility: { $in: ['team', 'public'] }, approvalStatus: 'approved' },
    ],
  };

  // Admins also see pending shared/public tabs
  if (isAdmin) {
    query.$or.push({
      visibility: { $in: ['team', 'public'] },
      approvalStatus: 'pending',
    });
  }

  const tabs = await SalesTab.find(query)
    .sort({ isPinned: -1, displayOrder: 1, createdAt: -1 })
    .lean();

  return tabs;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateTab(tabId, userId, role, data) {
  const tab = await SalesTab.findById(tabId);
  if (!tab) {
    const err = new Error('Tab not found');
    err.status = 404;
    throw err;
  }

  const isAdmin = role === 'admin';
  const isOwner = tab.ownerId.toString() === userId.toString();

  if (!isAdmin && !isOwner) {
    const err = new Error('Not authorized to edit this tab');
    err.status = 403;
    throw err;
  }

  // Enforce watch tab limit on upgrade
  if (data.isWatchTab && !tab.isWatchTab) {
    const watchCount = await SalesTab.countDocuments({ ownerId: tab.ownerId, isWatchTab: true });
    if (watchCount >= MAX_WATCH_TABS_PER_USER) {
      const err = new Error(`Maximum ${MAX_WATCH_TABS_PER_USER} watch tabs allowed`);
      err.status = 400;
      throw err;
    }
  }

  // If visibility changed to shared/public, reset approval
  if (data.visibility && data.visibility !== 'private' && data.visibility !== tab.visibility) {
    data.approvalStatus = 'pending';
    data.approvedBy = undefined;
  }

  Object.assign(tab, data);
  await tab.save();
  return tab.toObject();
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteTab(tabId, userId, role) {
  const tab = await SalesTab.findById(tabId);
  if (!tab) {
    const err = new Error('Tab not found');
    err.status = 404;
    throw err;
  }

  const isAdmin = role === 'admin';
  const isOwner = tab.ownerId.toString() === userId.toString();

  if (!isAdmin && !isOwner) {
    const err = new Error('Not authorized to delete this tab');
    err.status = 403;
    throw err;
  }

  await SalesTab.findByIdAndDelete(tabId);
  return { id: tabId };
}

// ─── Approval ───────────────────────────────────────────────────────────────

export async function approveTab(tabId, adminId) {
  const tab = await SalesTab.findById(tabId);
  if (!tab) {
    const err = new Error('Tab not found');
    err.status = 404;
    throw err;
  }
  tab.approvalStatus = 'approved';
  tab.approvedBy = adminId;
  await tab.save();
  await tab.populate('approvedBy', 'name');
  return tab.toObject();
}

export async function ignoreTab(tabId, adminId) {
  const tab = await SalesTab.findById(tabId);
  if (!tab) {
    const err = new Error('Tab not found');
    err.status = 404;
    throw err;
  }
  tab.approvalStatus = 'ignored';
  tab.approvedBy = adminId;
  await tab.save();
  await tab.populate('approvedBy', 'name');
  return tab.toObject();
}

// ─── Badge / Unread ─────────────────────────────────────────────────────────

export async function markRead(tabId, userId) {
  const tab = await SalesTab.findById(tabId);
  if (!tab) {
    const err = new Error('Tab not found');
    err.status = 404;
    throw err;
  }
  if (tab.ownerId.toString() !== userId.toString()) {
    const err = new Error('Not authorized');
    err.status = 403;
    throw err;
  }
  tab.unreadMatches = 0;
  await tab.save();
  return tab.toObject();
}

export async function incrementUnread(tabId, count = 1) {
  return SalesTab.findByIdAndUpdate(
    tabId,
    { $inc: { unreadMatches: count }, lastAlertAt: new Date() },
    { returnDocument: 'after' }
  ).lean();
}

// ─── Watch Tab Queries ──────────────────────────────────────────────────────

/**
 * Get all active watch tabs (approved and watch-enabled).
 */
export async function getActiveWatchTabs() {
  return SalesTab.find({
    isWatchTab: true,
    approvalStatus: 'approved',
    alertRules: { $exists: true, $ne: [] },
  }).lean();
}

/**
 * SalesTab Service
 *
 * Business logic for custom saved tabs — CRUD, approval workflow,
 * unread badge management, and limit enforcement.
 */
import SalesTab from './salesTab.model.js';
import SalesTabWatchState from './salesTabWatchState.model.js';
import SalesTabAlertEvent from './salesTabAlertEvent.model.js';
import { enqueueSalesTabReconcile } from '../../queues/index.js';

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

  // A brand-new watch tab needs its baseline established so pre-existing
  // matching rows don't all fire "new matching row" the moment it's
  // evaluated — see salesTab.watchState.service.js#reconcileWatchBaseline.
  if (tab.isWatchTab) {
    enqueueSalesTabReconcile(tab._id).catch((err) =>
      console.error('[SalesTab] Failed to enqueue baseline reconciliation:', err.message)
    );
  }

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
      // Approved public tabs from anyone (the model's visibility enum is
      // only ['private','public'] — there is no 'team' tier)
      { visibility: 'public', approvalStatus: 'approved' },
    ],
  };

  // Admins also see pending public tabs
  if (isAdmin) {
    query.$or.push({
      visibility: 'public',
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
  const watchJustEnabled = data.isWatchTab && !tab.isWatchTab;
  if (watchJustEnabled) {
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

  const oldFilterHash = tab.filterHash;

  Object.assign(tab, data);
  await tab.save(); // pre-save hook recomputes filterHash if `filters` changed

  const willBeWatching = data.isWatchTab !== undefined ? data.isWatchTab : tab.isWatchTab;
  const filtersChanged = tab.filterHash !== oldFilterHash;
  if (willBeWatching && (watchJustEnabled || filtersChanged)) {
    // Watch just turned on, or filters changed on an already-active watch
    // tab — either way the matching-row set may have shifted, so the
    // baseline must be re-established to avoid a false "new matching row"
    // flood for rows that already matched under the new/just-enabled filters.
    enqueueSalesTabReconcile(tab._id).catch((err) =>
      console.error('[SalesTab] Failed to enqueue baseline reconciliation:', err.message)
    );
  }

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

  // Stop all future watch processing for this tab: drop its baseline state
  // entirely, and cancel any not-yet-delivered alert events (leave
  // delivered/skipped ones in place for audit history).
  await Promise.all([
    SalesTabWatchState.deleteMany({ savedTabId: tabId }),
    SalesTabAlertEvent.updateMany(
      { savedTabId: tabId, status: 'pending' },
      { $set: { status: 'skipped', skipReason: 'TAB_DELETED' } }
    ),
  ]);

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

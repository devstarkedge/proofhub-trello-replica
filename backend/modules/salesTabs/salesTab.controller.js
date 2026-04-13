/**
 * SalesTab Controller
 *
 * REST handlers for custom saved tab CRUD, approval workflow,
 * and badge management.
 */
import * as tabService from './salesTab.service.js';
import { validateTabBody, sanitizeTabBody } from './salesTab.validation.js';
import SalesTab from './salesTab.model.js';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';
import notificationService from '../../utils/notificationService.js';
import {
  emitSalesTabCreated,
  emitSalesTabUpdated,
  emitSalesTabDeleted,
  emitSalesTabApproved,
  emitSalesTabIgnored,
  emitSalesTabApprovalPending,
} from '../../realtime/emitters.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Persist a notification for every admin user when a tab enters pending approval.
 * Runs fire-and-forget so it never blocks the response.
 */
async function notifyAdminsOfPendingTab(tab, senderId) {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(
      admins.map(async (admin) => {
        // Dedup: skip if an unread approval notification already exists for this tab
        const existing = await Notification.findOne({
          type: 'sales_tab_approval',
          entityId: tab._id,
          user: admin._id,
          isRead: false,
        }).lean();
        if (existing) return;

        return notificationService.createNotification({
          type: 'sales_tab_approval',
          title: 'Sales Tab Approval Request',
          message: `${tab.ownerName} wants to share "${tab.name}"${tab.isWatchTab ? ' (Watch Tab)' : ''}`,
          user: admin._id,
          sender: senderId,
          entityId: tab._id,
          entityType: 'SalesTab',
          priority: 'high',
          metadata: {
            tabId: tab._id,
            tabName: tab.name,
            ownerName: tab.ownerName,
            isWatchTab: !!tab.isWatchTab,
            visibility: tab.visibility,
          },
        });
      })
    );
  } catch (err) {
    console.error('[SalesTab] Failed to notify admins of pending tab:', err.message);
  }
}

/**
 * Mark all admin approval notifications for a tab as read,
 * then notify the tab creator of the result.
 */
async function handlePostApprovalNotifications(tab, adminId, action) {
  try {
    // Mark all admin approval notifications for this tab as read
    await Notification.updateMany(
      { type: 'sales_tab_approval', entityId: tab._id, isRead: false },
      { $set: { isRead: true } }
    );

    // Notify the tab creator of the result (skip if admin is the owner)
    if (tab.ownerId.toString() !== adminId.toString()) {
      const adminName = tab.approvedBy?.name || 'An admin';
      const statusText = action === 'approved' ? 'approved' : 'declined';
      await notificationService.createNotification({
        type: 'sales_tab_result',
        title: `Tab ${action === 'approved' ? 'Approved' : 'Declined'}`,
        message: `${adminName} has ${statusText} your tab "${tab.name}"`,
        user: tab.ownerId,
        sender: adminId,
        entityId: tab._id,
        entityType: 'SalesTab',
        priority: 'medium',
        metadata: {
          tabId: tab._id,
          tabName: tab.name,
          action,
          adminName,
        },
      });
    }
  } catch (err) {
    console.error('[SalesTab] Post-approval notification error:', err.message);
  }
}

// ─── POST /api/sales-tabs ───────────────────────────────────────────────────
export const createSalesTab = async (req, res) => {
  try {
    const userId = req.user._id;
    const userName = req.user.name;
    const body = sanitizeTabBody(req.body);

    // Validate uniqueness context
    const existingTabs = await SalesTab.find({ ownerId: userId }).select('name').lean();
    const namesForValidation = existingTabs.map((t) => ({ name: t.name, id: t._id }));

    const { valid, errors } = validateTabBody(body, namesForValidation);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const tab = await tabService.createTab(userId, userName, body);

    // Real-time events
    emitSalesTabCreated(tab);
    if (tab.visibility !== 'private' && tab.approvalStatus === 'pending') {
      emitSalesTabApprovalPending(tab);
      notifyAdminsOfPendingTab(tab, userId); // fire-and-forget
    }

    res.status(201).json({ success: true, data: tab });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── GET /api/sales-tabs ────────────────────────────────────────────────────
export const getSalesTabs = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = (req.user.role || '').toLowerCase();
    const tabs = await tabService.getUserTabs(userId, role);
    res.json({ success: true, data: tabs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /api/sales-tabs/:id ──────────────────────────────────────────────
export const updateSalesTab = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = (req.user.role || '').toLowerCase();
    const body = sanitizeTabBody(req.body);

    // Validate uniqueness context (exclude current tab)
    const tabId = req.params.id;
    const existingTabs = await SalesTab.find({ ownerId: userId }).select('name').lean();
    const namesForValidation = existingTabs.map((t) => ({ name: t.name, id: t._id }));

    const { valid, errors } = validateTabBody(body, namesForValidation, tabId);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const tab = await tabService.updateTab(tabId, userId, role, body);

    emitSalesTabUpdated(tab);
    if (tab.visibility !== 'private' && tab.approvalStatus === 'pending') {
      emitSalesTabApprovalPending(tab);
      notifyAdminsOfPendingTab(tab, userId); // fire-and-forget
    }

    res.json({ success: true, data: tab });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── DELETE /api/sales-tabs/:id ─────────────────────────────────────────────
export const deleteSalesTab = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = (req.user.role || '').toLowerCase();
    const result = await tabService.deleteTab(req.params.id, userId, role);

    emitSalesTabDeleted(result.id);

    res.json({ success: true, message: 'Tab deleted' });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── POST /api/sales-tabs/:id/approve ───────────────────────────────────────
export const approveSalesTab = async (req, res) => {
  try {
    const role = (req.user.role || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const tab = await tabService.approveTab(req.params.id, req.user._id);

    emitSalesTabApproved(tab);
    handlePostApprovalNotifications(tab, req.user._id, 'approved'); // fire-and-forget

    res.json({ success: true, data: tab });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── POST /api/sales-tabs/:id/ignore ────────────────────────────────────────
export const ignoreSalesTab = async (req, res) => {
  try {
    const role = (req.user.role || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const tab = await tabService.ignoreTab(req.params.id, req.user._id);

    emitSalesTabIgnored(tab);
    handlePostApprovalNotifications(tab, req.user._id, 'ignored'); // fire-and-forget

    res.json({ success: true, data: tab });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── POST /api/sales-tabs/:id/mark-read ─────────────────────────────────────
export const markSalesTabRead = async (req, res) => {
  try {
    const tab = await tabService.markRead(req.params.id, req.user._id);
    res.json({ success: true, data: tab });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

import SalesPermission from '../models/SalesPermission.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import slackNotificationService from '../services/slack/SlackNotificationService.js';
import notificationService from '../utils/notificationService.js';

// @desc    Get sales permission for a user
// @route   GET /api/sales-permissions/:id
// @access  Private/Admin
export const getSalesPermission = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;
  const perm = await SalesPermission.findOne({ user: userId }).lean();

  if (!perm) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({ success: true, data: perm });
});

// @desc    Create or update sales permission for a user
// @route   PUT /api/sales-permissions/:id
// @access  Private/Admin
export const setSalesPermission = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;
  const payload = {
    moduleVisible: req.body.moduleVisible === true,
    canCreate: !!req.body.canCreate,
    canUpdate: !!req.body.canUpdate,
    canDelete: !!req.body.canDelete,
    canExport: !!req.body.canExport,
    canImport: !!req.body.canImport,
    canManageDropdowns: !!req.body.canManageDropdowns,
    canViewActivityLog: req.body.canViewActivityLog !== undefined ? !!req.body.canViewActivityLog : true,
    notes: req.body.notes || ''
  };

  let permission = await SalesPermission.findOne({ user: userId });

  if (!permission) {
    permission = new SalesPermission({ ...payload, user: userId, grantedBy: req.user._id });
  } else {
    Object.assign(permission, payload);
    permission.grantedBy = req.user._id;
  }

  await permission.save();

  // If access granted, send Slack notification to the user (non-blocking)
  if (permission.moduleVisible) {
    try {
      slackNotificationService.sendNotification({
        userId,
        type: 'module_access',
        moduleName: 'Sales',
        triggeredBy: { name: req.user.name, _id: req.user._id },
        notes: permission.notes,
        priority: 'high',
        forceImmediate: true
      }).catch(err => console.error('Slack notification error:', err));
    } catch (err) {
      console.error('Failed to enqueue Slack module access notification:', err);
    }
    // Create in-app notification so user sees it in the app notification center
    try {
      await notificationService.createNotification({
        type: 'module_access',
        title: 'Sales Access Granted',
        message: `You have been granted access to the Sales module by ${req.user.name}`,
        user: userId,
        sender: req.user._id,
        priority: 'high',
        metadata: { module: 'Sales', url: '/sales' }
      });
    } catch (err) {
      console.error('Failed to create in-app module access notification:', err);
    }
  }

  res.status(200).json({ success: true, data: permission });
});

export default { getSalesPermission, setSalesPermission };

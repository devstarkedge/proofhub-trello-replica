import asyncHandler from '../middleware/asyncHandler.js';
import { resolveResourceAccess } from '../modules/permissions/permissionEngine.js';
import { setResourceOverride } from '../modules/permissions/accessControlService.js';
import { toLegacyShape, fromLegacyShape } from '../config/permissionRegistry.js';
import User from '../models/User.js';
import slackNotificationService from '../services/slack/SlackNotificationService.js';
import notificationService from '../utils/notificationService.js';
import { shouldNotifyOnModuleGrant } from '../utils/permissionNotificationGuards.js';

// @desc    Get sales permission for a user
// @route   GET /api/sales-permissions/:id
// @access  Private/Admin
export const getSalesPermission = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const targetUser = await User.findById(userId).select('role');

  if (!targetUser) {
    return res.status(200).json({ success: true, data: null });
  }

  // Delegates to the same engine as GET /api/sales/permissions/:userId and
  // PUT /api/access-control/users/:userId/overrides/sales — one resolver,
  // not a second parallel read path.
  const result = await resolveResourceAccess(targetUser, 'sales');
  res.status(200).json({ success: true, data: toLegacyShape('sales', result.actions) });
});

// @desc    Create or update sales permission for a user
// @route   PUT /api/sales-permissions/:id
// @access  Private/Admin
export const setSalesPermission = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const targetUser = await User.findById(userId).select('role');

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const previousResult = await resolveResourceAccess(targetUser, 'sales');
  const previousModuleVisible = previousResult.actions?.view === true;

  const actions = fromLegacyShape('sales', {
    moduleVisible: req.body.moduleVisible === true,
    canCreate: !!req.body.canCreate,
    canUpdate: !!req.body.canUpdate,
    canDelete: !!req.body.canDelete,
    canExport: !!req.body.canExport,
    canImport: !!req.body.canImport,
    canManageDropdowns: !!req.body.canManageDropdowns,
    canViewActivityLog: req.body.canViewActivityLog !== undefined ? !!req.body.canViewActivityLog : true
  });

  // Same write path as salesController.updateUserPermissions — this used to
  // be an independently-maintained duplicate of that function's payload
  // sanitization and save logic; both endpoints now call one function.
  const { legacyPermissions } = await setResourceOverride(
    userId,
    'sales',
    { actions, effect: 'grant', reason: req.body.notes || '' },
    req.user,
    { ip: req.ip, userAgent: req.headers['user-agent'] }
  );

  const shouldNotifyModuleAccess = shouldNotifyOnModuleGrant({
    previousAccess: previousModuleVisible,
    nextAccess: legacyPermissions.moduleVisible === true
  });

  res.status(200).json({ success: true, data: legacyPermissions });

  if (shouldNotifyModuleAccess) {
    try {
      slackNotificationService.sendNotification({
        userId,
        type: 'module_access',
        moduleName: 'Sales',
        triggeredBy: { name: req.user.name, _id: req.user._id },
        notes: req.body.notes || '',
        priority: 'high',
        forceImmediate: true
      }).catch(err => console.error('Slack notification error:', err));
    } catch (err) {
      console.error('Failed to enqueue Slack module access notification:', err);
    }
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
});

export default { getSalesPermission, setSalesPermission };

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireAccessControlManage } from '../middleware/requireAccessControl.js';
import {
  getRegistry,
  getMyEffectivePermissions,
  getUserEffectivePermissions,
  putUserResourceOverride,
  deleteUserResourceOverride,
  getAuditLog,
  getAuditLogEntryDetail
} from '../controllers/accessControlController.js';

const router = express.Router();

// Any authenticated user can read the registry (to render permission
// pickers) and their own resolved permissions (to drive sidebar/route guards).
router.get('/registry', protect, getRegistry);
router.get('/my-permissions', protect, getMyEffectivePermissions);

// Everything that reads/writes another user's access requires the delegated
// access_control.manage permission — Admin always has it; anyone else needs
// an explicit grant (role-level or personal). See requireAccessControlManage.
router.get('/audit-log', protect, requireAccessControlManage, getAuditLog);
router.get('/audit-log/:id', protect, requireAccessControlManage, getAuditLogEntryDetail);
router.get('/users/:userId/effective', protect, requireAccessControlManage, getUserEffectivePermissions);
router.put('/users/:userId/overrides/:resource', protect, requireAccessControlManage, putUserResourceOverride);
router.delete('/users/:userId/overrides/:resource', protect, requireAccessControlManage, deleteUserResourceOverride);

export default router;

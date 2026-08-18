import express from 'express';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { getOverview } from '../controllers/superAdminOverviewController.js';
import {
  getWorkspaces,
  getWorkspace,
  getMembers,
  getProjects,
  getUsage,
  getBilling,
  getActivity,
  patchStatus
} from '../controllers/superAdminWorkspaceController.js';
import { getPlans, patchBilling } from '../controllers/superAdminPlanController.js';
import { getAuditLog, getAuditLogEntry } from '../controllers/superAdminAuditController.js';

const router = express.Router();

// Every route below is platform-level — independent of the normal
// protect/authorize workspace-scoped gate (see requireSuperAdmin.js).
router.use(requireSuperAdmin);
router.use(rateLimiter({ windowMs: 60 * 1000, maxRequests: 120, keyFn: (req) => req.user?.id || req.ip }));

router.get('/overview', getOverview);

router.get('/workspaces', getWorkspaces);
router.get('/workspaces/:id', getWorkspace);
router.get('/workspaces/:id/members', getMembers);
router.get('/workspaces/:id/projects', getProjects);
router.get('/workspaces/:id/usage', getUsage);
router.get('/workspaces/:id/billing', getBilling);
router.patch('/workspaces/:id/billing', patchBilling);
router.get('/workspaces/:id/activity', getActivity);
router.patch('/workspaces/:id/status', patchStatus);

router.get('/plans', getPlans);

router.get('/audit-log', getAuditLog);
router.get('/audit-log/:id', getAuditLogEntry);

export default router;

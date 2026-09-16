import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './leavePolicy.controller.js';

const router = express.Router();
router.use(protect);

router.get('/types', requireResourcePermission('leave', 'view_policy'), controller.listLeaveTypes);
router.post(
  '/types',
  requireResourcePermission('leave', 'manage_policy'),
  [body('key').trim().notEmpty(), body('name').trim().notEmpty(), validate],
  controller.createLeaveType
);

router.get('/policies', requireResourcePermission('leave', 'view_policy'), controller.listPolicies);
router.post(
  '/policies',
  requireResourcePermission('leave', 'manage_policy'),
  [body('name').trim().notEmpty(), validate],
  controller.createPolicy
);

// Default (workspace-wide, single-active) policy — the full-configuration
// lifecycle the Policies settings page manages. Kept distinct from the
// bare-name POST /policies above (still available for the advanced
// department/role/employee override-assignment workflow).
router.get('/policies/default', requireResourcePermission('leave', 'view_policy'), controller.listDefaultPolicies);
router.post(
  '/policies/default',
  requireResourcePermission('leave', 'manage_policy'),
  [
    body('name').trim().notEmpty(),
    body('effectiveYear').isInt({ min: 2000, max: 2200 }),
    body('effectiveMonth').isInt({ min: 1, max: 12 }),
    body('leaveTypeRules').isArray({ min: 1 }),
    validate
  ],
  controller.createDefaultPolicy
);
router.patch(
  '/policies/default/:policyId',
  requireResourcePermission('leave', 'manage_policy'),
  [
    body('effectiveYear').optional().isInt({ min: 2000, max: 2200 }),
    body('effectiveMonth').optional().isInt({ min: 1, max: 12 }),
    body('leaveTypeRules').optional().isArray(),
    validate
  ],
  controller.editDefaultPolicy
);
router.post(
  '/policies/default/:policyId/activate',
  requireResourcePermission('leave', 'manage_policy'),
  controller.activateDefaultPolicy
);
router.post(
  '/policies/default/:policyId/archive',
  requireResourcePermission('leave', 'manage_policy'),
  controller.archiveDefaultPolicy
);

// Override policies — department/role/employee-specific, fully UI-driven
// (create/version/publish/assign orchestrated as one call each). Kept
// before the generic :policyId routes below for the same reason as
// /policies/default.
router.get('/policies/overrides', requireResourcePermission('leave', 'view_policy'), controller.listOverridePolicies);
router.post(
  '/policies/overrides',
  requireResourcePermission('leave', 'manage_policy'),
  [
    body('name').trim().notEmpty(),
    body('scope').isIn(['department', 'role', 'employee']),
    body('scopeRef').notEmpty(),
    body('effectiveYear').isInt({ min: 2000, max: 2200 }),
    body('effectiveMonth').isInt({ min: 1, max: 12 }),
    body('leaveTypeRules').isArray({ min: 1 }),
    validate
  ],
  controller.createOverridePolicy
);
router.patch(
  '/policies/overrides/:policyId',
  requireResourcePermission('leave', 'manage_policy'),
  [
    body('effectiveYear').optional().isInt({ min: 2000, max: 2200 }),
    body('effectiveMonth').optional().isInt({ min: 1, max: 12 }),
    body('leaveTypeRules').optional().isArray(),
    validate
  ],
  controller.editOverridePolicy
);
router.post(
  '/policies/overrides/:policyId/archive',
  requireResourcePermission('leave', 'manage_policy'),
  controller.archiveOverridePolicy
);
router.post(
  '/policies/overrides/assignments/:assignmentId/remove',
  requireResourcePermission('leave', 'manage_policy'),
  controller.removeOverrideAssignment
);

router.get('/policies/:policyId', requireResourcePermission('leave', 'view_policy'), controller.getPolicy);
router.post(
  '/policies/:policyId/versions',
  requireResourcePermission('leave', 'manage_policy'),
  [body('effectiveFrom').notEmpty(), validate],
  controller.createPolicyVersion
);
router.post(
  '/policies/:policyId/versions/:versionId/publish',
  requireResourcePermission('leave', 'manage_policy'),
  controller.publishPolicyVersion
);
router.post(
  '/policies/:policyId/assignments',
  requireResourcePermission('leave', 'manage_policy'),
  [body('scope').isIn(['workspace', 'department', 'role', 'employee']), body('effectiveFrom').notEmpty(), validate],
  controller.assignPolicy
);
router.get('/assignments', requireResourcePermission('leave', 'view_policy'), controller.listAssignments);

export default router;

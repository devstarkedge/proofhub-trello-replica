import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getProjectTrash } from '../controllers/trashController.js';
import {
  createMilestoneApproval,
  getMilestonesForProject
} from '../controllers/milestoneController.js';
import { managerOrAdmin } from '../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(protect);

// Project trash
router.get('/:id/trash', getProjectTrash);
router.get('/:id/milestones', getMilestonesForProject);
router.post('/:id/milestones/:milestoneId/approvals', managerOrAdmin, createMilestoneApproval);

export default router;

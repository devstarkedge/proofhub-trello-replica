/**
 * SalesTab Routes
 *
 * All routes are protected by authentication + sales module permission.
 */
import { Router } from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { checkSalesPermission } from '../../middleware/salesPermissionMiddleware.js';
import {
  createSalesTab,
  getSalesTabs,
  updateSalesTab,
  deleteSalesTab,
  approveSalesTab,
  ignoreSalesTab,
  markSalesTabRead,
} from './salesTab.controller.js';

const router = Router();

// All routes require authentication + sales module access
router.use(protect, checkSalesPermission);

router.post('/', createSalesTab);
router.get('/', getSalesTabs);
router.patch('/:id', updateSalesTab);
router.delete('/:id', deleteSalesTab);
router.post('/:id/approve', approveSalesTab);
router.post('/:id/ignore', ignoreSalesTab);
router.post('/:id/mark-read', markSalesTabRead);

export default router;

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getVersionHistory,
  getSpecificVersion,
  rollbackToVersion,
  compareVersions,
  getVersionCount,
  getLatestVersion
} from '../controllers/versionController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get version history
router.get('/:entityType/:entityId', getVersionHistory);

// Get version count
router.get('/:entityType/:entityId/count', getVersionCount);

// Get latest version
router.get('/:entityType/:entityId/latest', getLatestVersion);

// Get specific version
router.get('/:entityType/:entityId/version/:versionNumber', getSpecificVersion);

// Compare two versions
router.get('/:entityType/:entityId/compare/:v1/:v2', compareVersions);

// Rollback to a specific version
router.post('/:entityType/:entityId/rollback/:versionNumber', rollbackToVersion);

export default router;

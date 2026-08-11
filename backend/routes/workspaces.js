import express from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import {
  getMyWorkspaces,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  switchWorkspace,
  getWorkspaceMembers,
  getAvailableWorkspaceUsers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  leaveWorkspace,
  transferWorkspaceOwnership,
  deactivateWorkspace,
  uploadWorkspaceIcon,
  removeWorkspaceIcon
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

// Memory storage, matching the avatar-upload pattern — buffered straight
// through to Cloudinary, never written to disk.
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

router.use(protect);

router.get('/', getMyWorkspaces);

router.post('/', [
  body('name')
    .trim()
    .notEmpty().withMessage('Workspace name is required')
    .isLength({ max: 100 }).withMessage('Workspace name cannot exceed 100 characters'),
  validate
], createWorkspace);

router.get('/:id', getWorkspace);
router.patch('/:id', updateWorkspace);
router.delete('/:id', deactivateWorkspace);
router.post('/:id/icon', iconUpload.single('icon'), uploadWorkspaceIcon);
router.delete('/:id/icon', removeWorkspaceIcon);
router.post('/:id/switch', switchWorkspace);
router.post('/:id/leave', leaveWorkspace);
router.patch('/:id/owner', [
  body('newOwnerId').notEmpty().withMessage('newOwnerId is required'),
  validate
], transferWorkspaceOwnership);

router.get('/:id/members', getWorkspaceMembers);
router.get('/:id/available-users', getAvailableWorkspaceUsers);
router.post('/:id/members', [
  body('userId').notEmpty().withMessage('userId is required'),
  body('role').trim().notEmpty().withMessage('role is required'),
  validate
], addWorkspaceMember);
router.patch('/:id/members/:userId', [
  body('role').trim().notEmpty().withMessage('role is required'),
  validate
], updateWorkspaceMemberRole);
router.delete('/:id/members/:userId', removeWorkspaceMember);

export default router;

import express from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import {
  getMyWorkspaces,
  createWorkspace,
  checkWorkspaceSlug,
  getWorkspace,
  updateWorkspace,
  switchWorkspace,
  getWorkspaceMembers,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  leaveWorkspace,
  transferWorkspaceOwnership,
  deactivateWorkspace,
  uploadWorkspaceIcon,
  removeWorkspaceIcon,
  inviteWorkspaceMembers,
  getWorkspaceSetupStatus
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Memory storage, matching the avatar-upload pattern — buffered straight
// through to Cloudinary, never written to disk.
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

router.use(protect);

router.get('/', getMyWorkspaces);

// Must be registered before GET /:id — otherwise Express would match
// "check-slug" as an :id param instead.
router.get('/check-slug', rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many availability checks — please slow down'
}), checkWorkspaceSlug);

router.post('/', [
  body('name')
    .trim()
    .notEmpty().withMessage('Workspace name is required')
    .isLength({ max: 100 }).withMessage('Workspace name cannot exceed 100 characters'),
  body('slug').optional({ checkFalsy: true }).trim().isLength({ max: 60 }).withMessage('Workspace URL cannot exceed 60 characters'),
  body('type').trim().notEmpty().withMessage('Workspace type is required'),
  body('industry').optional({ checkFalsy: true }).trim(),
  body('companySize').optional({ checkFalsy: true }).trim(),
  body('department.name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('Department name cannot exceed 50 characters'),
  // Requiredness of type/industry/companySize/department beyond this point
  // is conditional on workspace type — enforced in the controller itself
  // (see WORKSPACE_TYPE_RULES), matching this file's existing pattern of
  // handling cross-field rules outside express-validator (updateWorkspace).
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

router.get('/:id/setup-status', getWorkspaceSetupStatus);
router.post('/:id/invite', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many invite requests — please try again later'
}), [
  body('emails').isArray({ min: 1, max: 20 }).withMessage('Provide between 1 and 20 email addresses'),
  body('emails.*').isEmail().withMessage('One or more email addresses are invalid'),
  validate
], inviteWorkspaceMembers);

router.get('/:id/members', getWorkspaceMembers);
// GET /:id/available-users and POST /:id/members (the old existing-user-
// picker flow) were retired — adding a member now happens exclusively
// through the centralized Invite Member system (routes/workspaceMembers.js).
router.patch('/:id/members/:userId', [
  body('role').trim().notEmpty().withMessage('role is required'),
  validate
], updateWorkspaceMemberRole);
router.delete('/:id/members/:userId', removeWorkspaceMember);

export default router;

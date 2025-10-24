import express from 'express';
import { 
  getUsers, 
  getUser, 
  updateUser, 
  deleteUser, 
  verifyUser, 
  getProfile, 
  assignUser, 
  declineUser 
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { userValidation } from '../middleware/validation.js';
import { hrOrAdmin, managerHrOrAdmin, ownerOrAdminManager } from '../middleware/rbacMiddleware.js';

const router = express.Router();

// Get current user profile (all authenticated users)
router.get('/profile', protect, getProfile);

// Get all users (HR/Admin only)
router.get('/', protect, hrOrAdmin, getUsers);

// Get single user (all authenticated users)
router.get('/:id', protect, getUser);

// Update user (Owner/Manager/Admin only)
router.put('/:id', protect, ownerOrAdminManager, updateUser);

// Verify user (Admin only)
router.put('/:id/verify', protect, authorize('admin'), userValidation.verify, verifyUser);

// Decline user registration (Admin only)
router.delete('/:id/decline', protect, authorize('admin'), declineUser);

// Assign user to department/team (Manager/HR/Admin)
router.put('/:id/assign', protect, managerHrOrAdmin, assignUser);

// Delete user (Admin only)
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;
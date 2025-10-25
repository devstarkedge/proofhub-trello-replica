import express from 'express';
import { getUsers, getUser, updateUser, deleteUser, verifyUser, getProfile, assignUser, declineUser } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { hrOrAdmin, managerHrOrAdmin, ownerOrAdminManager } from '../middleware/rbacMiddleware.js';

const router = express.Router();

router.get('/profile', protect, getProfile);

// Admin and HR can view all users, Manager can view users in their department/team
router.get('/', protect, hrOrAdmin, getUsers);

// All authenticated users can view individual user profiles
router.get('/:id', protect, getUser);

// Admin can update any user, users can update their own profile
router.put('/:id', protect, ownerOrAdminManager, updateUser);

// Only admin can verify users
router.put('/:id/verify', protect, authorize('admin'), verifyUser);

// Only admin can decline user registrations
router.delete('/:id/decline', protect, authorize('admin'), declineUser);

// Admin and Manager can assign Employee to departments/teams
router.put('/:id/assign', protect, managerHrOrAdmin, assignUser);

// Only admin can delete users
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;

import { authorize } from './authMiddleware.js';

/**
 * Role-Based Access Control Middleware
 * Defines permissions for different user roles
 */

// Manager or Admin access
export const managerOrAdmin = authorize('admin', 'manager');

// HR or Admin access
export const hrOrAdmin = authorize('admin', 'hr');

// Check if user owns the resource or is admin/manager
export const ownerOrAdminManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userRole = req.user.role.toLowerCase();
  const isAdminOrManager = ['admin', 'manager'].includes(userRole);

  // Allow if admin or manager, or if user owns the resource
  if (isAdminOrManager || req.user._id.toString() === req.params.id) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Insufficient permissions.'
  });
};

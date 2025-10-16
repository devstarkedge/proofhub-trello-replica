import { protect, authorize } from './authMiddleware.js';

/**
 * Role-Based Access Control Middleware
 * Defines permissions for different user roles
 */

// Admin only access
export const adminOnly = authorize('admin');

// Manager or Admin access
export const managerOrAdmin = authorize('admin', 'manager');

// HR or Admin access
export const hrOrAdmin = authorize('admin', 'hr');

// Employee and above access (all roles)
export const employeeOrHigher = authorize('admin', 'manager', 'hr', 'employee');

// Manager, HR, or Admin access
export const managerHrOrAdmin = authorize('admin', 'manager', 'hr');

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

// Project-based permissions (user must be assigned to project or be admin/manager)
export const projectAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userRole = req.user.role.toLowerCase();
  const isAdminOrManager = ['admin', 'manager'].includes(userRole);

  if (isAdminOrManager) {
    return next();
  }

  // For employees, check if they're assigned to the project
  // This would need to be implemented based on project assignment logic
  // For now, allow access (implement project assignment check later)
  next();
};

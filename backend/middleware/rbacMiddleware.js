import authMiddleware from './authMiddleware.js';

export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Ensure auth middleware ran first
    if (!req.user) {
      return res.status(401).json({ msg: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

export const adminOnly = requireRole(['Admin']);
export const managerOrAdmin = requireRole(['Admin', 'Manager']);
export const memberOrHigher = requireRole(['Admin', 'Manager', 'Member']);

export default requireRole;

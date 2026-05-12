/**
 * Capability Middleware
 *
 * Provides route-level guards based on the capability engine in permissionService.js.
 * Use `requireCapability(CAPABILITIES.X)` on any route that needs access-scope enforcement.
 *
 * This replaces scattered `if (role === 'employee')` hardcoded checks with a
 * scalable, role-agnostic permission model.
 */

import { computeUserCapabilities, userHasCapability, CAPABILITIES } from '../services/permissionService.js';

/**
 * Route middleware factory.
 * Usage: router.get('/...', protect, requireCapability(CAPABILITIES.MANAGE_PROJECT), handler)
 */
export const requireCapability = (capability) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!userHasCapability(req.user, capability)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have the required access level for this action'
      });
    }

    next();
  };
};

/**
 * Attach computed capabilities to req.capabilities so controllers can inspect
 * without additional DB lookups.
 * Usage: add `attachCapabilities` AFTER `protect` in middleware chain.
 */
export const attachCapabilities = (req, res, next) => {
  if (req.user) {
    req.capabilities = computeUserCapabilities(req.user);
  }
  next();
};

/**
 * Inline helper for controllers — avoids re-importing permissionService everywhere.
 */
export { userHasCapability, CAPABILITIES } from '../services/permissionService.js';

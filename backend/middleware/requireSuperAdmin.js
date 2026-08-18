import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * SUPER_ADMIN_EMAILS is a defense-in-depth allowlist, deliberately checked
 * on every request/login rather than used to grant the role (see
 * utils/seed.js#bootstrapSuperAdmin — that's the only place isSuperAdmin
 * gets set automatically, and it never reads this var). Both the database
 * role AND this allowlist must be valid — an isSuperAdmin:true account
 * whose email isn't currently listed here is denied, e.g. immediately after
 * an operator removes them from the list, without needing a separate
 * "revoke" step.
 *
 * Fails closed: if the var is unset/empty, nobody passes this check,
 * regardless of their isSuperAdmin flag — this is a security allowlist, not
 * an optional nicety, so an unconfigured deployment must not silently
 * behave as "allow everyone."
 */
export const isSuperAdminEmailAllowed = (email) => {
  const allowed = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length > 0 && allowed.includes(String(email || '').trim().toLowerCase());
};

/**
 * Gate for every /api/super-admin/* route. Fully independent of
 * middleware/authMiddleware.js's `protect`/`authorize` — those resolve
 * "which workspace is active + what's my role in it," a concept that
 * doesn't apply here. Deliberately:
 *
 *  - Never reads x-workspace-id, never sets req.workspaceId, never calls
 *    workspaceContext.run(). Any Super Admin controller that forgets to
 *    opt a plugin-wrapped model query into workspaceContext.runUnscoped()/
 *    run() throws loudly (see workspaceScopePlugin.js) instead of silently
 *    leaking or mis-scoping — the plugin's fail-closed design working in
 *    our favor.
 *  - Skips authMiddleware.js's LRU auth cache. Super admin traffic is tiny,
 *    and a freshly-granted admin gets access on their very next request
 *    instead of waiting out a cache TTL.
 *  - Does NOT reuse `authorize('admin')` — that checks a *workspace-scoped*
 *    role and is not a platform-level concept (see routes/admin.js, which
 *    is exactly the kind of accidental cross-tenant surface this route
 *    family must not repeat).
 */
export const requireSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }

    let decoded;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], config.jwt.secret);
    } catch {
      return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
    }

    const userId = decoded?.id || decoded?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    // User is exempt from workspaceScopePlugin — no context wrapper needed.
    const user = await User.findById(userId).select('name email isSuperAdmin isActive').lean();
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }
    if (user.isSuperAdmin !== true) {
      logger.warn('Super Admin access denied: role not granted', { userId, path: req.originalUrl });
      return res.status(403).json({ success: false, message: 'Super Admin access required' });
    }
    if (!isSuperAdminEmailAllowed(user.email)) {
      logger.warn('Super Admin access denied: email not on allowlist', { userId, email: user.email, path: req.originalUrl });
      return res.status(403).json({ success: false, message: 'Super Admin access required' });
    }

    req.user = { id: user._id.toString(), _id: user._id, name: user.name, email: user.email, isSuperAdmin: true };
    next();
  } catch (error) {
    logger.error('requireSuperAdmin error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Server error in Super Admin authentication' });
  }
};

export default requireSuperAdmin;

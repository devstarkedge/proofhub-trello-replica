import CacheService from '../services/cacheService.js';
import PolicyEngine from '../services/policyEngine.js';

/**
 * Enterprise Authorization Middleware
 * @param {string} resource - e.g. 'task'
 * @param {string} action - e.g. 'update'
 */
const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const workspaceId = req.headers['x-workspace-id'] || req.query.workspace || req.body.workspace; // Ensure multi-tenant context

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required for authorization' });
      }

      // 1. Fetch capabilities from Redis (Zero DB queries if cached)
      const cache = await CacheService.getUserCapabilities(userId, workspaceId);
      
      if (!cache) {
        return res.status(403).json({ error: 'Access denied: Not a member of this workspace' });
      }

      // 2. Token Version Sync (Prevents stale JWT exploits)
      // If token roleVersion < cache.version, reject and force UI to refresh token
      if (req.user.roleVersion && req.user.roleVersion < cache.version) {
        return res.status(401).json({ error: 'TOKEN_EXPIRED', requiresRefresh: true });
      }

      // 3. Build Runtime Context (ABAC)
      // Note: resourceOwnerId and resourceTeamId usually must be fetched dynamically
      // For highly optimized paths, req.params.id is used to pull the resource and inject it
      const context = {
        userId: userId,
        workspaceId: workspaceId,
        userWorkspaceId: workspaceId,
        userTeamId: req.user.team ? req.user.team.toString() : null
        // resourceOwnerId: We could pre-fetch it here or defer to the controller via req.authz
      };

      // 4. Evaluate Policy
      const result = PolicyEngine.evaluate(cache.capabilities, resource, action, context);

      if (!result.allowed) {
        return res.status(403).json({ 
           error: 'Insufficient permissions', 
           reason: result.reason 
        });
      }

      // 5. Inject allowed fields into request for the controller to sanitize inputs
      req.authz = {
        allowedFields: result.fields,
        scope: result.scope
      };

      next();
    } catch (err) {
      console.error('Authorization Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};

export default requirePermission;

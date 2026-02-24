import CacheService from '../services/cacheService.js';

export const getMyCapabilities = async (req, res) => {
  const userId = req.user.id;
  const workspaceId = req.headers['x-workspace-id'];

  if (!workspaceId) {
    return res.status(400).json({ success: false, message: 'Workspace ID header required' });
  }

  const cache = await CacheService.getUserCapabilities(userId, workspaceId);

  // Send a simplified map to the frontend:
  // e.g. { "task:create": ["all"], "task:update": ["own"], "billing:read": [] }
  const capabilityMap = {};
  
  if (cache && cache.capabilities) {
      cache.capabilities.forEach(c => {
        const key = `${c.resource}:${c.action}`;
        if (!capabilityMap[key]) capabilityMap[key] = [];
        if (!capabilityMap[key].includes(c.scope)) {
            capabilityMap[key].push(c.scope);
        }
      });
  }

  res.json({
    success: true,
    data: {
      version: cache ? cache.version : 0,
      capabilities: capabilityMap
    }
  });
};

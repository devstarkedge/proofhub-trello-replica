import PolicyEngine from '../services/policyEngine.js';
import CacheService from '../services/cacheService.js';

/**
 * Admins can test "What if User X tries to do Y on Resource Z?"
 */
export const simulateAccess = async (req, res) => {
  const { simulatedUserId, workspaceId, resource, action, mockContext } = req.body;
  
  // Hard admin check
  // Depending on the existing req.user setup, isSystemAdmin or similar check is required here
  if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required for simulation' });
  }

  try {
      const cache = await CacheService.getUserCapabilities(simulatedUserId, workspaceId);
      
      if (!cache) {
          return res.status(404).json({ success: false, message: 'User capabilities not found in workspace' });
      }

      const result = PolicyEngine.evaluate(cache.capabilities, resource, action, mockContext || {
          userId: simulatedUserId,
          workspaceId: workspaceId,
          userWorkspaceId: workspaceId
      });

      res.json({
        success: true,
        simulationResult: result,
        capabilitiesUsed: cache.capabilities.filter(c => c.resource === resource && c.action === action)
      });
  } catch (error) {
      console.error('Simulation error:', error);
      res.status(500).json({ success: false, message: 'Simulation failed' });
  }
};

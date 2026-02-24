import { getSharedConnection } from '../../../queues/connection.js';
import WorkspaceMember from '../models/WorkspaceMember.js';

// Lazy redis access — connection is only created when first cache operation runs
function getRedis() {
  try {
    return getSharedConnection();
  } catch {
    return null;
  }
}

class CacheService {
  /**
   * Compiles and caches all resolved permissions for a user in a specific workspace
   */
  static async compileUserCapabilities(userId, workspaceId) {
    const member = await WorkspaceMember.findOne({ user: userId, workspace: workspaceId })
      .populate({
        path: 'roles',
        populate: [
          { path: 'permissionGroups' },
          { path: 'parentRole' },
          { path: 'policies' }
        ]
      });

    if (!member || !member.isActive) return null;

    // 1. Flatten all capabilities (supporting inheritance)
    const capabilities = this._flattenCapabilities(member.roles);
    
    // 2. Compute max version (for JWT sync)
    const version = Math.max(...member.roles.map(r => r.version || 1), 1);

    const cachePayload = {
      capabilities,
      version,
      metadata: member.metadata
    };

    // Store in Redis (TTL: 24h, refreshed organically or invalidated)
    const cacheKey = `authz:usr:${userId}:ws:${workspaceId}`;
    try {
      const redis = getRedis();
      if (redis) {
          await redis.set(cacheKey, JSON.stringify(cachePayload), 'EX', 86400);
      }
    } catch (err) {
      console.warn('Redis cache failed to set, skipping...', err);
    }

    return cachePayload;
  }

  /**
   * Retrieve from cache (Ultra fast O(1) read)
   */
  static async getUserCapabilities(userId, workspaceId) {
    const cacheKey = `authz:usr:${userId}:ws:${workspaceId}`;
    try {
        const redis = getRedis();
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }
    } catch (err) {
        console.warn('Redis cache read failed, falling back to DB...', err);
    }
    return await this.compileUserCapabilities(userId, workspaceId);
  }

  /**
   * Invalidate specific user (Triggered on role/membership update)
   */
  static async invalidateUser(userId, workspaceId) {
    try {
        const redis = getRedis();
        if (redis) {
            await redis.del(`authz:usr:${userId}:ws:${workspaceId}`);
        }
    } catch (err) {
        console.warn('Redis cache invalidate failed...', err);
    }
  }

  static _flattenCapabilities(roles) {
    // Logic to merge permissions from roles + parent roles
    // Merges scopes (e.g. if one role grants 'own' and another 'all', user gets 'all')
    const finalPerms = [];
    
    // Helper to traverse roles
    const traverseRoles = (roleList) => {
        roleList.forEach(role => {
            if (role.permissionGroups && role.permissionGroups.length > 0) {
                role.permissionGroups.forEach(pg => {
                    if (pg && pg.permissions) {
                        pg.permissions.forEach(p => finalPerms.push(p));
                    }
                });
            }
            // If parent role exists and is populated
            if (role.parentRole && typeof role.parentRole === 'object') {
                traverseRoles([role.parentRole]);
            }
        });
    }

    traverseRoles(roles);
    return finalPerms;
  }
}

export default CacheService;

import { businessCaches } from '../services/businessReadCache.js';
import { getActiveContext } from '../modules/workspaces/workspaceContext.js';
import { moduleReadPolicies } from '../../shared/moduleReadPolicies.mjs';

export function businessReadFreshness(req, _res, next) {
  const context = getActiveContext();
  if (context && /no-cache/.test(req.get?.('Cache-Control') || req.headers?.['cache-control'] || '')) context.bypassBusinessReadCache = true;
  next();
}

function readHeaders(domain, { metrics, durationMs }) {
  const state = metrics.hit ? 'hit' : metrics.coalesced ? 'coalesced' : metrics.miss ? 'miss' : 'bypass';
  return { 'Cache-Control': 'private, no-store', 'X-Read-Cache': state,
    // Relative lifetime avoids requiring synchronized browser/server clocks.
    'X-Read-Fresh-For': String(Math.max(0, Math.floor((metrics.freshUntil || 0) - Date.now()))),
    'Server-Timing': `${domain}-read;dur=${durationMs.toFixed(1)}` };
}

export async function observedBusinessRead(domain, res, load) {
  const { data, metrics, durationMs } = await businessCaches[domain].observe(load);
  res.set(readHeaders(domain, { metrics, durationMs }));
  return data;
}

// Install AFTER authentication and route-specific permission middleware.
// Only explicitly selected, side-effect-free JSON handlers are eligible.
export function cachedBusinessJson(domain, kind, handler) {
  return async (req, res, next) => {
    try {
      businessReadFreshness(req, res, () => {});
      const cache = businessCaches[domain];
      const { data, metrics, durationMs } = await cache.observe(() => cache.read({
        workspaceId: req.workspaceId, viewerId: req.user._id || req.user.id, kind,
        query: { params: req.params, query: req.query, body: req.body },
        access: { permissions: req.salesPermissions || req.financePermissions, role: req.user.role, roleId: req.user.roleId },
        ttlMs: moduleReadPolicies[domain].serverTtl(kind)
      }, () => new Promise((resolve, reject) => {
        let status = 200;
        const response = { status(code) { status = code; return response; }, json(value) {
          if (status !== 200 || !value || value.success === false) reject({ displayResponse: value, status });
          else resolve(value);
          return response;
        } };
        // Supports both native async controllers and the existing asyncHandler.
        try { Promise.resolve(handler(req, response, reject)).catch(reject); } catch (error) { reject(error); }
      })));
      res.set(readHeaders(domain, { metrics, durationMs }));
      res.json(data);
    } catch (error) {
      if (error.displayResponse) return res.status(error.status).json(error.displayResponse);
      next(error);
    }
  };
}

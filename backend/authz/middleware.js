import { buildContext } from './context.js';
import { can, explain } from './engine.js';
import { loadResource, loadAssignments } from './loaders.js';
import { CATALOG } from './catalog.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

const declared = (handler, declaration) => Object.assign(handler, { authzDeclaration: declaration });
async function context(req) {
  if (!req.authz) req.authz = await buildContext(req.user?._id || req.user?.id, req.workspaceId, { allowLegacy: process.env.AUTHZ_V2 !== 'enforce' });
  return req.authz;
}
export function requirePermission(permission, { load, param = 'id' } = {}) {
  if (!CATALOG[permission]) throw new Error(`Unknown route permission: ${permission}`);
  return declared(async (req, res, next) => {
    try {
      const ctx = await context(req);
      let resource;
      if (load) {
        if (ctx.restriction?.type === 'assigned_only') await loadAssignments(ctx);
        resource = req.resource || await loadResource(ctx, load, req.params[param]);
        if (!resource) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Resource not found' });
      }
      const decision = explain(ctx, permission, resource);
      if (!decision.allowed) {
        const hidden = ['not_visible', 'wrong_workspace'].includes(decision.reason);
        return res.status(hidden ? 404 : 403).json({ success: false, code: hidden ? 'NOT_FOUND' : 'FORBIDDEN', ...(hidden ? {} : { permission, reason: decision.reason }), message: hidden ? 'Resource not found' : 'Permission denied' });
      }
      req.resource = resource;
      next();
    } catch (error) { next(error); }
  }, { kind: 'permission', permission, load, param });
}
export function authenticated() { return declared(async (req, res, next) => { try { const ctx = await context(req); if (ctx.status !== 'active') return res.status(403).json({ code: 'FORBIDDEN', reason: 'no_membership' }); next(); } catch (error) { next(error); } }, { kind: 'authenticated' }); }
export function self() { return declared(async (req, res, next) => { try { const ctx = await context(req); if (ctx.status !== 'active' || ctx.kind === 'guest') return res.status(403).json({ code: 'FORBIDDEN' }); next(); } catch (error) { next(error); } }, { kind: 'self' }); }
export const platform = () => declared(requireSuperAdmin, { kind: 'platform' });
// Public and signed routes keep their real rate limiter/signature verifier.
export const publicRoute = ({ rateLimit }) => { if (typeof rateLimit !== 'function') throw new Error('Public route requires a rate limiter'); return declared(rateLimit, { kind: 'public' }); };
export const signed = (name, verifier) => { if (typeof verifier !== 'function') throw new Error('Signed route requires a verifier'); return declared(verifier, { kind: 'signed', name }); };
export function resourcePermissions(ctx, resource, permissions) { return Object.fromEntries(permissions.map(p => [p, can(ctx, p, resource)])); }
export default { require: requirePermission, authenticated, self, platform, public: publicRoute, signed };

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import authz from './middleware.js';
import { CATALOG, CATALOG_VERSION, SCOPE_RANK } from './catalog.js';
import { can, explain, id } from './engine.js';
import { canGrant } from './ceiling.js';
import { buildContext } from './context.js';
import { loadResource } from './loaders.js';
import { assertDeclaredRoutes } from './routeRegistry.js';
import Role from '../models/Role.js';
import PermissionOverride from '../models/PermissionOverride.js';
import AccessAuditLog from '../models/AccessAuditLog.js';
import { workspacePeople } from '../services/workspaceAudience.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { strictUpdate } from '../utils/strictUpdate.js';

const router = express.Router();
router.use(protect);
export function permissionPayload(ctx) {
  const permissions = {};
  for (const key of Object.keys(CATALOG)) if (can(ctx, key)) {
    const grants = ctx.grants[key] || [{ scope: 'workspace', sources: ['owner'] }];
    permissions[key] = { scope: [...grants].sort((a,b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope])[0].scope, sources: [...new Set(grants.flatMap(g => g.sources || []))] };
  }
  return { workspaceId: ctx.workspaceId, userId: ctx.userId, kind: ctx.kind, isOwner: ctx.isOwner, role: ctx.role, versions: { ...ctx.versions, catalog: CATALOG_VERSION }, departments: ctx.departments, managedDepartments: ctx.managedDepartments, restriction: ctx.restriction, permissions, denied: ctx.denies, grantable: Object.fromEntries(Object.entries(CATALOG).map(([p,v]) => [p,v.allowedScopes.filter(s => canGrant(ctx,p,s))])), guestsEnabled: process.env.GUESTS_ENABLED === 'true', rollout: process.env.AUTHZ_V2 || 'off' };
}
router.get('/catalog', authz.authenticated(), (req,res) => res.json({ success: true, data: { version: CATALOG_VERSION, permissions: CATALOG } }));
router.get('/me', authz.authenticated(), (req,res) => res.json({ success: true, data: permissionPayload(req.authz) }));
router.post('/check', authz.require('access.view'), asyncHandler(async (req,res) => {
  strictUpdate(req.body, ['userId', 'permission', 'resourceType', 'resourceId']);
  const ctx = await buildContext(req.body.userId, req.workspaceId, { allowLegacy: process.env.AUTHZ_V2 !== 'enforce' });
  if (ctx.status !== 'active') throw new ErrorResponse('Member not found', 404);
  const resource = req.body.resourceId ? await loadResource(ctx, req.body.resourceType, req.body.resourceId) : undefined;
  if (req.body.resourceId && !resource) throw new ErrorResponse('Resource not found', 404);
  res.json({ success: true, data: explain(ctx, req.body.permission, resource) });
}));
router.get('/roles', authz.require('access.view'), asyncHandler(async (req,res) => {
  const roles = await Role.find({ workspaceId: req.workspaceId }).lean();
  res.json({ success: true, data: roles });
}));
router.get('/roles/:id', authz.require('access.view'), asyncHandler(async (req,res) => {
  const role = await Role.findOne({ _id: req.params.id, workspaceId: req.workspaceId }).lean();
  if (!role) throw new ErrorResponse('Role not found', 404);
  res.json({ success: true, data: role });
}));
router.get('/members', authz.require('member.view_directory'), asyncHandler(async (req,res) => {
  const data = (await workspacePeople({}, req.workspaceId)).filter(member => can(req.authz, 'member.view_directory', { ...member, user: member._id, departments: member.department }));
  res.json({ success: true, data });
}));
router.get('/members/:userId/effective', authz.require('access.view'), asyncHandler(async (req,res) => {
  const ctx = await buildContext(req.params.userId, req.workspaceId, { allowLegacy: process.env.AUTHZ_V2 !== 'enforce' });
  if (ctx.status !== 'active') throw new ErrorResponse('Member not found', 404);
  res.json({ success: true, data: permissionPayload(ctx) });
}));
router.get('/overrides', authz.require('access.view'), asyncHandler(async (req,res) => res.json({ success: true, data: await PermissionOverride.find({ workspace: req.workspaceId }).sort({ createdAt: -1 }).limit(500).lean() })));
router.get('/audit', authz.require('audit.view'), asyncHandler(async (req,res) => {
  const filter = { workspace: req.workspaceId };
  if (req.query.userId) filter.targetUser = req.query.userId;
  if (req.query.cursor) filter._id = { $lt: req.query.cursor };
  const data = await AccessAuditLog.find(filter).sort({ _id: -1 }).limit(50).lean();
  res.json({ success: true, data, nextCursor: data.length === 50 ? id(data.at(-1)._id) : null });
}));
if (process.env.NODE_ENV !== 'production') assertDeclaredRoutes(router);
export default router;

import { loadAssignments } from '../authz/loaders.js';

// Legacy routes already authenticate the active workspace membership. Their
// read model has no grant evaluator; keep its existing reads, intersected with
// the same assignment restriction and tenant predicates as the v2 engine.
export async function legacyAssignedWorkContext(req) {
  if (!req.assignedWorkContext) {
    const user = req.user;
    req.assignedWorkContext = {
      userId: String(user._id || user.id), workspaceId: req.workspaceId,
      status: 'active', kind: user.kind || 'member', role: { key: user.role },
      restriction: { type: 'assigned_only' }, departments: user.department || [],
      grants: { 'project.view': [{ scope: 'workspace' }], 'task.view': [{ scope: 'workspace' }] }, denies: {},
    };
    await loadAssignments(req.assignedWorkContext);
  }
  return req.assignedWorkContext;
}

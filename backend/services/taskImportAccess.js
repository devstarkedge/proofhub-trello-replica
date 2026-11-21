import Department from '../models/Department.js';
import Role from '../models/Role.js';
import { authorizeProjectResource, requireProjectPermission } from './projectAuthorization.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// Imports require task creation plus a management identity. Custom roles must
// also be allowed to manage this project; ordinary task contributors cannot import.
export async function authorizeTaskImport(req, projectId, departmentId, resolvedProject) {
  const project = resolvedProject || await authorizeProjectResource(req, 'project', projectId, 'task.create');
  if (resolvedProject) await requireProjectPermission(req, 'task.create', project);
  if (req.user.kind === 'guest' || ['employee', 'hr', 'guest'].includes(req.user.role)) throw new ErrorResponse('Task import requires project management access', 403);
  if (!['admin', 'manager'].includes(req.user.role)) {
    const role = await Role.findById(req.user.roleId?._id || req.user.roleId).lean();
    if (!role || role.isSystem || !role.isActive) throw new ErrorResponse('Task import requires project management access', 403);
    await requireProjectPermission(req, 'project.manage_members', project);
  }
  if (project.isArchived || project.isDeleted || departmentId && String(project.department) !== String(departmentId)) throw new ErrorResponse('Project is not available in this department', 404);
  if (!await Department.exists({ _id: project.department, workspaceId: req.workspaceId, isActive: { $ne: false } })) throw new ErrorResponse('Department not found', 404);
  return project;
}

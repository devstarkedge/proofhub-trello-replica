import { requireProjectPermission, authorizeProjectResource } from './projectAuthorization.js';
import Department from '../models/Department.js';
import { workspacePeople } from './workspaceAudience.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';

export async function projectManagers(req, departmentId) {
  if (!mongoose.isValidObjectId(departmentId)) throw new ErrorResponse('Department not found', 404);
  const department = await Department.findOne({ _id: departmentId, workspaceId: req.workspaceId, isActive: { $ne: false } }).lean();
  if (!department) throw new ErrorResponse('Department not found', 404);
  const assigned = new Set((department.managers || []).map(String));
  if (req.query?.projectId) {
    const project = await authorizeProjectResource(req,'project',req.query.projectId,'project.update');
    if (String(project.department) !== String(department._id)) throw new ErrorResponse('Project department does not match',403);
  } else {
    await requireProjectPermission(req,'project.create');
    if (req.user.role === 'manager' && !assigned.has(String(req.user.id || req.user._id))) throw new ErrorResponse('Department access required',403);
  }
  const people = await workspacePeople({ role: { $in: ['admin', 'manager'] } }, req.workspaceId);
  return people.filter(person => person.role === 'admin' || assigned.has(String(person._id))).sort((a, b) => a.name.localeCompare(b.name));
}

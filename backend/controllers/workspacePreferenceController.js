import asyncHandler from '../middleware/asyncHandler.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Department from '../models/Department.js';
import { isProjectSort, normalizePreferences } from '../../shared/projectView.mjs';

const scope = req => ({ user: req.user._id, workspace: req.workspaceId, status: 'active' });
const denied = res => res.status(403).json({ success: false, message: 'An active workspace membership is required.' });
const serialize = membership => normalizePreferences({
  ...membership.preferences,
  departmentOrder: membership.preferences?.departmentOrder?.map(String),
});

export const getWorkspacePreferences = asyncHandler(async (req, res) => {
  if (!req.workspaceId) return denied(res);
  const membership = await WorkspaceMembership.findOne(scope(req)).select('preferences').lean();
  if (!membership) return denied(res);
  res.json({ success: true, data: serialize(membership) });
});

export const updateWorkspacePreferences = asyncHandler(async (req, res) => {
  if (!req.workspaceId) return denied(res);
  const body = req.body;
  const invalid = () => res.status(400).json({ success: false, message: 'Please provide valid display preferences.' });
  if (!body || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !['departmentOrder', 'projectSort'].includes(key))) return invalid();
  const update = {};
  if (Object.hasOwn(body, 'projectSort')) {
    if (!isProjectSort(body.projectSort)) return invalid();
    update['preferences.projectSort'] = body.projectSort;
  }
  if (Object.hasOwn(body, 'departmentOrder')) {
    if (!Array.isArray(body.departmentOrder) || body.departmentOrder.length > 5000 || body.departmentOrder.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) return invalid();
    // Ignore removed or foreign IDs. Preference data never grants department access.
    const departments = await Department.find({ workspaceId: req.workspaceId, isActive: true, _id: { $in: body.departmentOrder } }).select('_id').lean();
    const allowed = new Set(departments.map(department => String(department._id)));
    update['preferences.departmentOrder'] = [...new Set(body.departmentOrder.map(id => id.toLowerCase()))].filter(id => allowed.has(id));
  }
  // No upsert: a preference request cannot manufacture membership. Patch only supplied fields.
  const membership = await WorkspaceMembership.findOneAndUpdate(scope(req), { $set: update }, { new: true, runValidators: true }).select('preferences').lean();
  if (!membership) return denied(res);
  res.json({ success: true, data: serialize(membership) });
});

import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as policyService from './attendancePolicy.service.js';

export const getPolicyConfig = asyncHandler(async (req, res) => {
  const config = await policyService.getPolicyConfiguration({ workspaceId: req.workspaceId });
  res.json({ success: true, data: config });
});

export const createPolicy = asyncHandler(async (req, res) => {
  const { name, description, effectiveDate, content } = req.body;
  if (!name || !effectiveDate || !content) throw new ErrorResponse('name, effectiveDate and content are required', 400);

  const { policy, version } = await policyService.createPolicy({
    workspaceId: req.workspaceId, name, description, effectiveDate, content, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_POLICY_CREATED', targetType: 'AttendancePolicy', targetId: policy._id,
    resourceLabel: `Attendance Policy: ${policy.name}`, summary: `${req.user.name} created attendance policy "${policy.name}"`,
    before: null, after: { policy: policy.toObject(), version: version.toObject() }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: { policy, version } });
});

export const editPolicy = asyncHandler(async (req, res) => {
  const { name, description, effectiveDate, content } = req.body;
  const before = await policyService.getPolicyConfiguration({ workspaceId: req.workspaceId });

  const { policy, version } = await policyService.editPolicy({
    workspaceId: req.workspaceId, policyId: req.params.policyId, name, description, effectiveDate, content, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_POLICY_UPDATED', targetType: 'AttendancePolicy', targetId: policy._id,
    resourceLabel: `Attendance Policy: ${policy.name}`, summary: `${req.user.name} updated attendance policy "${policy.name}"`,
    before, after: { policy: policy.toObject(), version: version?.toObject() || null }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: { policy, version } });
});

export const activatePolicy = asyncHandler(async (req, res) => {
  const { policy, version } = await policyService.activatePolicyManually({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_POLICY_ACTIVATED', targetType: 'AttendancePolicy', targetId: policy._id,
    resourceLabel: `Attendance Policy: ${policy.name}`, summary: `${req.user.name} activated attendance policy "${policy.name}"`,
    before: null, after: { versionNumber: version.versionNumber }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: { policy, version } });
});

export const archivePolicy = asyncHandler(async (req, res) => {
  const policy = await policyService.archivePolicy({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_POLICY_ARCHIVED', targetType: 'AttendancePolicy', targetId: policy._id,
    resourceLabel: `Attendance Policy: ${policy.name}`, summary: `${req.user.name} archived attendance policy "${policy.name}"`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: policy });
});

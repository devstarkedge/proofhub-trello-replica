import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import * as leavePolicyService from './leavePolicy.service.js';
import { onPolicyActivated } from './leaveHooks.js';

export const listLeaveTypes = asyncHandler(async (req, res) => {
  const types = await leavePolicyService.listLeaveTypes({ workspaceId: req.workspaceId, includeInactive: req.query.includeInactive === 'true' });
  res.json({ success: true, data: types });
});

export const createLeaveType = asyncHandler(async (req, res) => {
  const { key, name, description, color, icon, category, supportsHalfDay, displayOrder } = req.body;
  if (!key || !name) throw new ErrorResponse('key and name are required', 400);
  const leaveType = await leavePolicyService.createLeaveType({
    workspaceId: req.workspaceId, key, name, description, color, icon, category, supportsHalfDay, displayOrder,
    createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_TYPE_CREATED', targetType: 'LeaveType', targetId: leaveType._id,
    resourceLabel: `Leave Type: ${leaveType.name}`, summary: `${req.user.name} created leave type "${leaveType.name}"`,
    before: null, after: leaveType.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: leaveType });
});

export const listPolicies = asyncHandler(async (req, res) => {
  const policies = await leavePolicyService.listPolicies({ workspaceId: req.workspaceId, includeArchived: req.query.includeArchived === 'true' });
  res.json({ success: true, data: policies });
});

export const createPolicy = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) throw new ErrorResponse('Policy name is required', 400);
  const policy = await leavePolicyService.createPolicy({ workspaceId: req.workspaceId, name, description, createdBy: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_CREATED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy: ${policy.name}`, summary: `${req.user.name} created leave policy "${policy.name}"`,
    before: null, after: policy.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: policy });
});

export const getPolicy = asyncHandler(async (req, res) => {
  const detail = await leavePolicyService.getPolicyWithVersions({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  res.json({ success: true, data: detail });
});

export const createPolicyVersion = asyncHandler(async (req, res) => {
  const { effectiveFrom, effectiveUntil, leaveTypeRules, blackout } = req.body;
  if (!effectiveFrom) throw new ErrorResponse('effectiveFrom is required', 400);
  const version = await leavePolicyService.createDraftVersion({
    workspaceId: req.workspaceId, policyId: req.params.policyId, effectiveFrom, effectiveUntil,
    leaveTypeRules, blackout, createdBy: req.user.id
  });
  res.status(201).json({ success: true, data: version });
});

export const publishPolicyVersion = asyncHandler(async (req, res) => {
  const version = await leavePolicyService.publishVersion({
    workspaceId: req.workspaceId, policyId: req.params.policyId, versionId: req.params.versionId, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_VERSION_PUBLISHED', targetType: 'LeavePolicyVersion', targetId: version._id,
    resourceLabel: `Leave Policy Version v${version.versionNumber}`,
    summary: `${req.user.name} published policy version ${version.versionNumber}`,
    before: null, after: { status: version.status, publishedAt: version.publishedAt },
    category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: version });
});

export const assignPolicy = asyncHandler(async (req, res) => {
  const { scope, scopeRef, priority, effectiveFrom, effectiveUntil } = req.body;
  if (!scope || !effectiveFrom) throw new ErrorResponse('scope and effectiveFrom are required', 400);
  const assignment = await leavePolicyService.assignPolicy({
    workspaceId: req.workspaceId, policyId: req.params.policyId, scope, scopeRef, priority, effectiveFrom, effectiveUntil,
    createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_ASSIGNED', targetType: 'LeavePolicyAssignment', targetId: assignment._id,
    resourceLabel: 'Leave Policy Assignment', summary: `${req.user.name} assigned a leave policy (${scope})`,
    before: null, after: assignment.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: assignment });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const assignments = await leavePolicyService.listAssignments({ workspaceId: req.workspaceId, policyId: req.query.policyId });
  res.json({ success: true, data: assignments });
});

// ─── Default (workspace-wide, single-active) policy lifecycle ─────────────

export const listDefaultPolicies = asyncHandler(async (req, res) => {
  const policies = await leavePolicyService.listDefaultPolicies({
    workspaceId: req.workspaceId, includeArchived: req.query.includeArchived !== 'false'
  });
  res.json({ success: true, data: policies });
});

export const createDefaultPolicy = asyncHandler(async (req, res) => {
  const { name, description, effectiveYear, effectiveMonth, leaveTypeRules, approvalWorkflow, blackout } = req.body;
  const { policy, version } = await leavePolicyService.createDefaultPolicy({
    workspaceId: req.workspaceId, name, description, effectiveYear, effectiveMonth,
    leaveTypeRules, approvalWorkflow, blackout, createdBy: req.user.id, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_CREATED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy: ${policy.name}`,
    summary: `${req.user.name} created leave policy "${policy.name}" (${policy.status})`,
    before: null, after: policy.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  if (policy.status === 'active') onPolicyActivated(req.workspaceId, policy).catch(() => {});
  res.status(201).json({ success: true, data: { policy, version } });
});

export const editDefaultPolicy = asyncHandler(async (req, res) => {
  const { name, description, effectiveYear, effectiveMonth, leaveTypeRules, approvalWorkflow, blackout } = req.body;
  const before = await leavePolicyService.getPolicyWithVersions({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  const { policy, version } = await leavePolicyService.editDefaultPolicy({
    workspaceId: req.workspaceId, policyId: req.params.policyId, name, description, effectiveYear, effectiveMonth,
    leaveTypeRules, approvalWorkflow, blackout, createdBy: req.user.id, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_EDITED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy: ${policy.name}`,
    summary: `${req.user.name} edited leave policy "${policy.name}"${version ? ` (new version v${version.versionNumber}, ${version.status})` : ''}`,
    before: before.policy, after: policy.toObject(), category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  if (version && version.status === 'published') onPolicyActivated(req.workspaceId, policy).catch(() => {});
  res.json({ success: true, data: { policy, version } });
});

export const activateDefaultPolicy = asyncHandler(async (req, res) => {
  const { policy, version } = await leavePolicyService.activateDefaultPolicyManually({
    workspaceId: req.workspaceId, policyId: req.params.policyId, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_ACTIVATED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy: ${policy.name}`, summary: `${req.user.name} activated leave policy "${policy.name}"`,
    before: null, after: { status: policy.status, effectiveDate: policy.effectiveDate },
    category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onPolicyActivated(req.workspaceId, policy).catch(() => {});
  res.json({ success: true, data: { policy, version } });
});

export const archiveDefaultPolicy = asyncHandler(async (req, res) => {
  const policy = await leavePolicyService.archiveDefaultPolicy({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_ARCHIVED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy: ${policy.name}`, summary: `${req.user.name} archived leave policy "${policy.name}"`,
    before: null, after: { status: policy.status }, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: policy });
});

// ─── Override policies (department/role/employee-specific) ────────────────

export const listOverridePolicies = asyncHandler(async (req, res) => {
  const policies = await leavePolicyService.listOverridePolicies({ workspaceId: req.workspaceId });
  res.json({ success: true, data: policies });
});

export const createOverridePolicy = asyncHandler(async (req, res) => {
  const { name, description, scope, scopeRef, priority, effectiveYear, effectiveMonth, leaveTypeRules } = req.body;
  const result = await leavePolicyService.createOverridePolicy({
    workspaceId: req.workspaceId, name, description, scope, scopeRef, priority,
    effectiveYear, effectiveMonth, leaveTypeRules, createdBy: req.user.id, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_OVERRIDE_CREATED', targetType: 'LeavePolicy', targetId: result.policy._id,
    resourceLabel: `Leave Policy Override: ${result.policy.name}`,
    summary: `${req.user.name} created a leave policy override "${result.policy.name}" for ${scope} scope`,
    before: null, after: result, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onPolicyActivated(req.workspaceId, result.policy).catch(() => {});
  res.status(201).json({ success: true, data: result });
});

export const editOverridePolicy = asyncHandler(async (req, res) => {
  const { name, description, effectiveYear, effectiveMonth, leaveTypeRules } = req.body;
  const result = await leavePolicyService.editOverridePolicy({
    workspaceId: req.workspaceId, policyId: req.params.policyId, name, description,
    effectiveYear, effectiveMonth, leaveTypeRules, createdBy: req.user.id, actor: req.user
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_OVERRIDE_EDITED', targetType: 'LeavePolicy', targetId: result.policy._id,
    resourceLabel: `Leave Policy Override: ${result.policy.name}`,
    summary: `${req.user.name} edited leave policy override "${result.policy.name}"`,
    before: null, after: result, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onPolicyActivated(req.workspaceId, result.policy).catch(() => {});
  res.json({ success: true, data: result });
});

export const archiveOverridePolicy = asyncHandler(async (req, res) => {
  const policy = await leavePolicyService.archiveOverridePolicy({ workspaceId: req.workspaceId, policyId: req.params.policyId });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_OVERRIDE_ARCHIVED', targetType: 'LeavePolicy', targetId: policy._id,
    resourceLabel: `Leave Policy Override: ${policy.name}`,
    summary: `${req.user.name} archived leave policy override "${policy.name}"`,
    before: null, after: { status: policy.status }, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onPolicyActivated(req.workspaceId, policy).catch(() => {});
  res.json({ success: true, data: policy });
});

export const removeOverrideAssignment = asyncHandler(async (req, res) => {
  const assignment = await leavePolicyService.removeOverrideAssignment({
    workspaceId: req.workspaceId, assignmentId: req.params.assignmentId
  });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_POLICY_OVERRIDE_ASSIGNMENT_REMOVED', targetType: 'LeavePolicyAssignment', targetId: assignment._id,
    resourceLabel: 'Leave Policy Override Assignment',
    summary: `${req.user.name} removed a leave policy override assignment (${assignment.scope})`,
    before: null, after: { isActive: assignment.isActive }, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  onPolicyActivated(req.workspaceId, { _id: assignment.policy, status: 'inactive' }).catch(() => {});
  res.json({ success: true, data: assignment });
});

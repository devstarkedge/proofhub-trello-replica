import mongoose from 'mongoose';
import { normalizeOwner } from './contactProperties.js';
import { randomBytes } from 'node:crypto';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import User from '../../models/User.js';
import Board from '../../models/Board.js';
import { HubSpotConnection, HubSpotApproval, HubSpotAudit } from './models.js';
import { HubSpotApi, validateServiceKey } from './api.js';
import { encryptCredential, decryptCredential, encryptionReady } from './crypto.js';
import { digest, SyncError } from './domain.js';
import { withHubSpotLock } from './locks.js';
import { assertHubSpotIndexes } from './readiness.js';

export async function requireConfigAdmin(workspaceId, userId) {
  const [workspace, membership, user] = await Promise.all([
    Workspace.findOne({ _id: workspaceId, isActive: true }).lean(),
    WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active', kind: { $ne: 'guest' } }).lean(),
    User.findOne({ _id: userId, isActive: true }).select('_id').lean(),
  ]);
  if (!workspace || !membership || !user || (String(workspace.owner) !== String(userId) && membership.role !== 'admin')) {
    throw new SyncError('FORBIDDEN', 'Only active workspace Owners and Admins can manage configurations.', { status: 403 });
  }
  return workspace;
}
export function publicConnection(connection) {
  if (!connection) return null;
  const { name, portalId, version, enabled, status, readVerified, writeCapability, createdAt, updatedAt, lastSuccessfulSync, lastError } = connection;
  return { contactOwnerId: connection.contactOwnerId || '', contactOwnerName: connection.contactOwnerName || '', ownerMissingScopes: connection.ownerMissingScopes || [], ownerValidation: connection.ownerValidation || 'not_configured', name, portalId, version, enabled, status, readVerified, writeCapability, createdAt, updatedAt, lastSuccessfulSync, lastError, maskedKey: '••••••••••••', configured: true };
}
async function refreshOwnerDetails(connection) {
  if (!connection.contactOwnerId || (connection.ownerCheckedAt && Date.now() - +connection.ownerCheckedAt < 300_000)) return connection;
  let details;
  try {
    const api = new HubSpotApi(decryptCredential(connection.credential, connection.workspaceId, connection.portalId));
    details = await api.getOwnerDetails(connection.contactOwnerId);
  } catch (error) {
    // Owner lookup failure must not hide the rest of Configs or expose provider errors.
    details = { ownerValidation: error.code === 'INVALID_OWNER' ? 'invalid' : 'unverified', contactOwnerName: '', ownerMissingScopes: [] };
  }
  const metadata = { ...details, ownerCheckedAt: new Date() };
  const updated = await HubSpotConnection.updateOne({ _id: connection._id, workspaceId: connection.workspaceId, version: connection.version, contactOwnerId: connection.contactOwnerId, ownerCheckedAt: connection.ownerCheckedAt ?? null }, { $set: metadata }, { timestamps: false });
  if (updated.matchedCount) return { ...connection, ...metadata };
  // A concurrent owner/key replacement must not receive stale lookup results.
  return HubSpotConnection.findOne({ workspaceId: connection.workspaceId }).lean();
}
export async function getConnectionDetails({ workspaceId, userId, issuePage = 1 }) {
  await requireConfigAdmin(workspaceId, userId);
  if (!Number.isInteger(issuePage) || issuePage < 1 || issuePage > 1_000_000) throw new SyncError('INVALID_REQUEST', 'Choose a valid project error page.', { status: 400 });
  let connection = await HubSpotConnection.findOne({ workspaceId }).select('+credential').lean();
  if (connection) connection = await refreshOwnerDetails(connection);
  if (!connection) return null;
  const filter = {
    workspaceId, projectType: 'Hired Client', isDeleted: { $ne: true },
    'hubspotSync.portalId': connection.portalId,
    'hubspotSync.status': { $in: ['blocked', 'failed', 'retrying'] },
    'hubspotSync.error': { $type: 'string', $ne: '' },
  };
  const pageSize = 25;
  const total = await Board.countDocuments(filter);
  const page = Math.min(issuePage, Math.max(1, Math.ceil(total / pageSize)));
  const projects = await Board.find(filter).select('name +hubspotSync').sort({ name: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
  // Project errors are derived from current source state so correcting/deleting
  // a project cannot leave a stale connection-wide warning behind.
  return { ...publicConnection(connection), lastError: connection.status === 'error' ? connection.lastError : '', projectSyncIssues: {
    total, page, pageSize,
    projects: projects.map(project => ({ id: String(project._id), name: project.name, message: project.hubspotSync.error, code: project.hubspotSync.errorCode })),
  } };
}
export async function approveChange({ workspaceId, userId, sessionToken, password, action, version }) {
  await requireConfigAdmin(workspaceId, userId);
  await assertHubSpotIndexes();
  if (!['configure', 'toggle'].includes(action) || !Number.isInteger(version) || version < 0) throw new SyncError('INVALID_REQUEST', 'Invalid verification action.', { status: 400 });
  const current = await HubSpotConnection.findOne({ workspaceId }).lean();
  if ((current?.version || 0) !== version) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
  const user = await User.findById(userId).select('+password');
  if (typeof password !== 'string' || password.length > 1024 || !user?.password || !(await user.comparePassword(password))) {
    await HubSpotAudit.create({ workspaceId, actorId: userId, action: 'verification_rejected', code: 'IDENTITY_VERIFICATION_FAILED' });
    throw new SyncError('IDENTITY_VERIFICATION_FAILED', 'Your FlowTask password could not be verified.', { status: 401 });
  }
  const approval = randomBytes(32).toString('base64url');
  await HubSpotApproval.create({ workspaceId, userId, tokenHash: digest(approval), sessionHash: digest(sessionToken), action, binding: String(version), expiresAt: new Date(Date.now() + 180_000) });
  return { approval, expiresIn: 180, connection: publicConnection(current) };
}
function resolveServiceKey(serviceKey, previous, workspaceId) {
  const key = (serviceKey === undefined || serviceKey === '') && previous
    ? decryptCredential(previous.credential, workspaceId, previous.portalId)
    : serviceKey;
  validateServiceKey(key);
  return key;
}
export async function validateConnection({ workspaceId, userId, serviceKey, version, contactOwnerId }) {
  await requireConfigAdmin(workspaceId, userId);
  return withHubSpotLock(`workspace:${workspaceId}`, async lease => {
    const current = await HubSpotConnection.findOne({ workspaceId }).select('+credential').lean();
    if (!Number.isInteger(version) || (current?.version || 0) !== version) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
    const api = new HubSpotApi(resolveServiceKey(serviceKey, current, workspaceId), { beforeRequest: () => lease.assertOwned() });
    const validation = await api.validate();
    if (current && !serviceKey && validation.portalId !== current.portalId) throw new SyncError('ACCOUNT_MISMATCH', 'The key account no longer matches this connection. Replace the key and reconnect safely.', { status: 409 });
    const ownerId = normalizeOwner(contactOwnerId ?? (current?.portalId === validation.portalId ? current.contactOwnerId : '') ?? '');
    const ownerDetails = await api.getOwnerDetails(ownerId);
    return { ...validation, contactOwnerId: ownerId, ...ownerDetails };
  });
}
async function consumeApproval({ workspaceId, userId, sessionToken, approval, version }, action, session) {
  if (typeof approval !== 'string' || approval.length > 100) throw new SyncError('STEP_UP_REQUIRED', 'Verify your FlowTask password again.', { status: 401 });
  const used = await HubSpotApproval.findOneAndDelete({
    workspaceId, userId, tokenHash: digest(approval), sessionHash: digest(sessionToken), action, binding: String(version), expiresAt: { $gt: new Date() },
  }, { session });
  if (!used) throw new SyncError('STEP_UP_REQUIRED', 'Verification expired or was already used. Verify your password again.', { status: 401 });
}
export async function saveConnection(input) {
  const { workspaceId, userId, serviceKey, reconnect = false, version, name = '' } = input;
  await requireConfigAdmin(workspaceId, userId);
  encryptionReady();
  await assertHubSpotIndexes();
  return withHubSpotLock(`workspace:${workspaceId}`, async lease => {
    const previous = await HubSpotConnection.findOne({ workspaceId }).select('+credential').lean();
    if (!Number.isInteger(version) || (previous?.version || 0) !== version) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
    if (typeof name !== 'string' || name.trim().length > 100 || typeof reconnect !== 'boolean') throw new SyncError('INVALID_REQUEST', 'Enter a connection name of at most 100 characters.', { status: 400 });
    const replacingKey = serviceKey !== undefined && serviceKey !== '';
    const key = resolveServiceKey(serviceKey, previous, workspaceId);
    const api = new HubSpotApi(key, { beforeRequest: () => lease.assertOwned() });
    const validation = await api.validate();
    const contactOwnerId = normalizeOwner(input.contactOwnerId ?? (previous?.portalId === validation.portalId ? previous.contactOwnerId : '') ?? '');
    const ownerDetails = await api.getOwnerDetails(contactOwnerId);
    const changedAccount = previous && previous.portalId !== validation.portalId;
    if (changedAccount && !replacingKey) throw new SyncError('ACCOUNT_MISMATCH', 'The key account no longer matches this connection. Replace the key and reconnect safely.', { status: 409 });
    if (changedAccount && (!reconnect || previous.enabled)) {
      throw new SyncError('RECONNECTION_REQUIRED', 'Disable sync, then explicitly confirm reconnecting to a different HubSpot account. Old account mappings will remain separate.', { status: 409 });
    }
    const credential = previous && !replacingKey ? previous.credential : encryptCredential(key, workspaceId, validation.portalId);
    await requireConfigAdmin(workspaceId, userId);
    await lease.assertOwned();
    const session = await mongoose.startSession();
    let saved;
    try {
      await session.withTransaction(async () => {
        await consumeApproval(input, 'configure', session);
        const values = {
          ...validation, credential, contactOwnerId, ...ownerDetails, ownerCheckedAt: new Date(), name: name.trim(), version: version + 1, status: 'connected', lastError: '',
          enabled: changedAccount ? false : (previous?.enabled || false),
          backfillPending: changedAccount ? false : (previous?.enabled || false), backfillCursor: null,
          ...(changedAccount ? { lastSuccessfulSync: null } : {}),
        };
        if (previous) {
          saved = await HubSpotConnection.findOneAndUpdate({ _id: previous._id, version }, { $set: values }, { session, new: true, runValidators: true }).lean();
        } else {
          [saved] = await HubSpotConnection.create([{ workspaceId, ...values }], { session });
        }
        if (!saved) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
        await HubSpotAudit.create([{ workspaceId, actorId: userId, action: changedAccount ? 'account_reconnected' : previous ? (replacingKey ? 'credential_replaced' : 'configuration_updated') : 'configured', portalId: validation.portalId, configVersion: version + 1 }], { session });
      });
    } finally { await session.endSession(); }
    return publicConnection(saved);
  });
}
export async function toggleConnection(input) {
  const { workspaceId, userId, version, enabled } = input;
  await requireConfigAdmin(workspaceId, userId);
  if (typeof enabled !== 'boolean' || !Number.isInteger(version)) throw new SyncError('INVALID_REQUEST', 'Choose whether synchronization is enabled.', { status: 400 });
  return withHubSpotLock(`workspace:${workspaceId}`, async lease => {
    const previous = await HubSpotConnection.findOne({ workspaceId, version }).select('+credential').lean();
    if (!previous) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
    let validation = {};
    if (enabled) {
      if (input.confirmed !== true) throw new SyncError('CONFIRM_REQUIRED', 'Confirm that existing Hired Client records will synchronize.', { status: 400 });
      validation = await new HubSpotApi(decryptCredential(previous.credential, workspaceId, previous.portalId), { beforeRequest: () => lease.assertOwned() }).validate();
      if (validation.portalId !== previous.portalId) throw new SyncError('ACCOUNT_MISMATCH', 'The key account no longer matches this connection. Reconnect safely.', { status: 409 });
    }
    await requireConfigAdmin(workspaceId, userId);
    await lease.assertOwned();
    const session = await mongoose.startSession();
    let saved;
    try {
      await session.withTransaction(async () => {
        await consumeApproval(input, 'toggle', session);
        saved = await HubSpotConnection.findOneAndUpdate({ workspaceId, version }, { $set: {
          ...validation, enabled, version: version + 1,
          ...(enabled ? { status: 'connected', lastError: '' } : {}),
          backfillPending: enabled, backfillCursor: null,
        } }, { session, new: true }).lean();
        if (!saved) throw new SyncError('CONFIG_CHANGED', 'Configuration changed. Refresh this page.', { status: 409 });
        await HubSpotAudit.create([{ workspaceId, actorId: userId, action: enabled ? 'enabled' : 'disabled', portalId: saved.portalId, configVersion: saved.version }], { session });
      });
    } finally { await session.endSession(); }
    return publicConnection(saved);
  });
}

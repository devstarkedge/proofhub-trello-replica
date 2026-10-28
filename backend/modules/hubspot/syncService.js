import { clientSnapshot, enrichPayload } from './enrichedPayload.js';
import mongoose from 'mongoose';
import Board from '../../models/Board.js';
import Workspace from '../../models/Workspace.js';
import { run } from '../workspaces/workspaceContext.js';
import { HubSpotConnection, HubSpotMapping, HubSpotClaim, HubSpotAudit, HubSpotLock } from './models.js';
import { HubSpotApi } from './api.js';
import { decryptCredential } from './crypto.js';
import { withHubSpotLock, paceAccount } from './locks.js';
import { assertHubSpotIndexes } from './readiness.js';
import { payloadFor, sourceHash, digest, eligible, validatePayload, retryState, MAX_ATTEMPTS, RETRY_MS, SyncError } from './domain.js';

const safety = (code, message) => new SyncError(code, message, { permanent: true });
export async function claimIdentity(portalId, kind, value, workspaceId, clientKey) {
  const filter = { portalId, kind, value: digest(String(value)) };
  try {
    await HubSpotClaim.updateOne(filter, { $setOnInsert: { workspaceId, clientKey } }, { upsert: true, runValidators: true });
  } catch (error) { if (error.code !== 11000) throw error; }
  const claim = await HubSpotClaim.findOne(filter).lean();
  if (!claim || String(claim.workspaceId) !== String(workspaceId) || claim.clientKey !== clientKey) {
    throw safety('IDENTITY_OWNED', 'This contact identity is already owned by a different client or workspace.');
  }
}
function validJob(job) {
  return job && mongoose.isValidObjectId(job.workspaceId) && mongoose.isValidObjectId(job.projectId)
    && typeof job.sourceVersion === 'string' && typeof job.portalId === 'string' && Number.isInteger(job.configVersion);
}

export async function processHubSpotJob(job, { apiFactory = (key, options) => new HubSpotApi(key, options), now = () => Date.now() } = {}) {
  if (!validJob(job)) return { skipped: 'invalid_job' };
  return run({ workspaceId: job.workspaceId }, async () => {
    try {
      return await withHubSpotLock(`workspace:${job.workspaceId}`, workspaceLease => withHubSpotLock(`portal:${job.portalId}`, lease => execute(job, {
        ...lease, assertOwned: async () => { await workspaceLease.assertOwned(); await lease.assertOwned(); },
      }, apiFactory, now)));
    } catch (error) {
      if (['BUSY', 'STALE_JOB', 'ACCOUNT_COOLDOWN'].includes(error.code)) return { skipped: error.code };
      // Uncaught infrastructure faults leave the durable source pending; no
      // raw exception is attached to a BullMQ failure record.
      throw new Error('HubSpot background processing is temporarily unavailable');
    }
  });
}
async function execute(job, lease, apiFactory, now) {
  const { workspaceId, projectId, sourceVersion, portalId, configVersion } = job;
  let connection = await HubSpotConnection.findOne({ workspaceId, portalId, version: configVersion, enabled: true, status: 'connected' }).select('+credential').lean();
  let board = await Board.findOne({ _id: projectId, workspaceId }).select('+hubspotSync').lean();
  if (!connection || !board || board.hubspotSync?.version !== sourceVersion || !eligible(board)
    || !['pending', 'retrying'].includes(board.hubspotSync.status) || +board.hubspotSync.nextAttemptAt > now()) return { skipped: 'stale_or_ineligible' };
  const workspace = await Workspace.exists({ _id: workspaceId, isActive: true });
  if (!workspace) return { skipped: 'inactive_workspace' };
  await assertHubSpotIndexes();
  const cooldown = await HubSpotLock.findById(lease.key).lean();
  if (+cooldown?.cooldownUntil > now()) return { skipped: 'account_cooldown' };
  let payload = payloadFor(board); const hash = sourceHash(board);
  const state = board.hubspotSync;
  const sourceFilter = { _id: projectId, workspaceId, 'hubspotSync.version': sourceVersion };
  if (hash !== state.hash) {
    // Concurrent partial project patches can combine fields. Repair the
    // embedded intent before any external request, without syncing stale data.
    const { sourceState } = await import('./domain.js');
    await Board.updateOne(sourceFilter, { $set: { hubspotSync: sourceState(board, state) } });
    return { skipped: 'source_repaired' };
  }
  if (state.attempts >= MAX_ATTEMPTS) {
    await Board.updateOne(sourceFilter, { $set: { 'hubspotSync.status': 'failed', 'hubspotSync.nextAttemptAt': null } });
    return { skipped: 'exhausted' };
  }
  let attempt = state.attempts;
  const startedAt = Date.now();
  let operation = 'validate', api;
  try {
    validatePayload(payload);
    // Every source that shares a logical identity must agree. We cannot
    // safely infer a winner for conflicting embedded client records.
    const snapshot = await clientSnapshot(board, workspaceId);
    let clientKey = state.clientKey;
    // A new project with the CURRENT exact client details may reuse an
    // established identity even after its original email/name changed.
    const emailClaim = await HubSpotClaim.findOne({ portalId, kind: 'email', value: digest(payload.email) }).lean();
    if (emailClaim && String(emailClaim.workspaceId) === String(workspaceId) && emailClaim.clientKey !== clientKey) {
      const existing = await HubSpotMapping.findOne({ workspaceId, portalId, clientKey: emailClaim.clientKey }).lean();
      if (state.lastSyncedAt || !existing || (existing.identityHash || existing.lastSyncedHash) !== digest(payload)) throw safety('CLIENT_CONFLICT', 'This email is already mapped to a different FlowTask client.');
      clientKey = emailClaim.clientKey;
      await Board.updateOne(sourceFilter, { $set: { 'hubspotSync.clientKey': clientKey } });
    }
    await claimIdentity(portalId, 'email', payload.email, workspaceId, clientKey);
    // workspaceScopePlugin injects workspaceId. Repeating it in an upsert
    // predicate produces ambiguous equality paths in MongoDB.
    let mapping = await HubSpotMapping.findOneAndUpdate({ portalId, clientKey }, { $setOnInsert: { workspaceId, portalId, clientKey } }, { upsert: true, new: true, runValidators: true }).lean();

    // Recheck source/config/lease before EVERY outbound request, including
    // writes after contact searches. Disable/replacement shares workspace lock.
    const assertCurrent = async () => {
      await lease.assertOwned();
      const [active, current, activeWorkspace] = await Promise.all([
        HubSpotConnection.exists({ workspaceId, portalId, version: configVersion, enabled: true, status: 'connected' }),
        Board.findOne(sourceFilter).select('projectType isDeleted clientDetails technologies hubspotSync').lean(),
        Workspace.exists({ _id: workspaceId, isActive: true }),
      ]);
      if (!active || !current || !activeWorkspace || !eligible(current) || sourceHash(current) !== hash) throw new SyncError('STALE_JOB', 'The project or connection changed before the request.');
      if ((await clientSnapshot(current, workspaceId)).fingerprint !== snapshot.fingerprint) throw new SyncError('STALE_JOB', 'Shared client projects changed before the request.');
    };
    await assertCurrent();
    // Reserve attempts BEFORE HTTP. A crash cannot reset the counter. The
    // next due time also acts as recovery delay after a process interruption.
    attempt += 1;
    const reserved = await Board.updateOne({ ...sourceFilter, 'hubspotSync.attempts': state.attempts }, { $set: {
      'hubspotSync.attempts': attempt, 'hubspotSync.portalId': portalId, 'hubspotSync.configVersion': configVersion,
      'hubspotSync.nextAttemptAt': new Date(now() + RETRY_MS), 'hubspotSync.status': 'retrying',
      'hubspotSync.lastAttemptAt': new Date(now()),
    } });
    if (!reserved.modifiedCount) return { skipped: 'already_reserved' };
    api = apiFactory(decryptCredential(connection.credential, workspaceId, portalId), {
      beforeRequest: async () => { await assertCurrent(); await paceAccount(lease); },
    });
    payload = await enrichPayload(snapshot, connection, api);
    let contact = mapping.hubspotContactId ? await api.getContact(mapping.hubspotContactId) : null;
    operation = 'match';
    if (mapping.hubspotContactId && (!contact || contact.archived || String(contact.id) !== mapping.hubspotContactId)) {
      throw safety('MAPPED_CONTACT_MISSING', 'The saved HubSpot contact is missing or archived. Automatic replacement is blocked.');
    }
    if (contact) await claimIdentity(portalId, 'contact', contact.id, workspaceId, clientKey);
    // A crash/timeout after create is never followed by another blind create.
    if (mapping.pendingCreateEmail) {
      const recovered = await api.findByEmail(mapping.pendingCreateEmail);
      if (!recovered) throw safety('CREATE_UNCERTAIN', 'A previous contact creation has an uncertain result. Automatic creation is blocked to prevent duplicates.');
      if (contact && String(contact.id) !== String(recovered.id)) throw safety('CONTACT_CONFLICT', 'The uncertain contact does not match the saved mapping.');
      contact = recovered;
    }
    const match = await api.findByEmail(payload.email);
    if (contact && match && String(contact.id) !== String(match.id)) throw safety('EMAIL_CONFLICT', 'The new email belongs to a different HubSpot contact.');
    contact ||= match;
    if (contact) {
      if (!contact.id) throw safety('INVALID_CONTACT', 'HubSpot returned a contact without a valid identity.');
      await claimIdentity(portalId, 'contact', contact.id, workspaceId, clientKey);
      // Persist mapping before patch: a patch timeout still reuses this ID.
      mapping = await HubSpotMapping.findOneAndUpdate({ _id: mapping._id, workspaceId, portalId, clientKey }, {
        $set: { hubspotContactId: String(contact.id) }, $unset: { pendingCreateEmail: 1, createStartedAt: 1 },
      }, { new: true }).lean();
      const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) => String(contact.properties?.[key] || '') !== value));
      if (Object.keys(changes).length) {
        operation = 'update';
        await assertCurrent();
        await api.update(contact.id, changes);
      }
    } else {
      operation = 'create';
      await assertCurrent();
      await HubSpotMapping.updateOne({ _id: mapping._id, workspaceId, portalId, clientKey }, { $set: { pendingCreateEmail: payload.email, createStartedAt: new Date(now()) } });
      try { contact = await api.create(payload); }
      catch (error) {
        if (['STALE_JOB', 'ACCOUNT_COOLDOWN'].includes(error.code) || [400, 401, 403, 422, 429].includes(error.status)) {
          await HubSpotMapping.updateOne({ _id: mapping._id, workspaceId, portalId, clientKey }, { $unset: { pendingCreateEmail: 1, createStartedAt: 1 } });
        }
        throw error;
      }
      if (!contact?.id) throw safety('CREATE_UNCERTAIN', 'Contact creation returned no verifiable contact ID. Automatic creation is blocked.');
      await claimIdentity(portalId, 'contact', contact.id, workspaceId, clientKey);
      await HubSpotMapping.updateOne({ _id: mapping._id, workspaceId, portalId, clientKey }, {
        $set: { hubspotContactId: String(contact.id) }, $unset: { pendingCreateEmail: 1, createStartedAt: 1 },
      });
    }
    const syncedAt = new Date(now());
    // The remote write may have completed while source data changed. Keep
    // its contact ID, but never mark the newer source version synchronized.
    await HubSpotMapping.updateOne({ _id: mapping._id, workspaceId, portalId, clientKey }, { $set: { identityHash: digest(snapshot.identity), lastSyncedHash: digest(payload), lastSyncedAt: syncedAt } });
    await Board.updateOne(sourceFilter, { $set: {
      'hubspotSync.status': 'synced', 'hubspotSync.lastSyncedHash': hash, 'hubspotSync.lastSyncedAt': syncedAt,
      'hubspotSync.nextAttemptAt': null, 'hubspotSync.error': '', 'hubspotSync.errorCode': '',
    } });
    await HubSpotConnection.updateOne({ workspaceId, portalId, version: configVersion }, { $set: { lastSuccessfulSync: syncedAt, lastError: '' } });
    await HubSpotAudit.create({ workspaceId, action: 'contact_synced', portalId, configVersion, projectId, sourceVersion, attempt,
      operation, outcome: 'succeeded', durationMs: Date.now() - startedAt, correlationId: api?.correlationId });
    return { synced: true };
  } catch (error) {
    if (error.code === 'STALE_JOB') {
      // A cancellation consumes no retry. If the source changed its new
      // version was already persisted atomically by the Board middleware.
      if (attempt > state.attempts) await Board.updateOne(sourceFilter, { $set: { 'hubspotSync.attempts': state.attempts, 'hubspotSync.status': 'pending', 'hubspotSync.nextAttemptAt': new Date(now()) } });
      return { skipped: 'stale_job' };
    }
    const safe = error instanceof SyncError;
    const code = safe ? error.code : 'INTERNAL_ERROR';
    const message = safe ? error.message : 'Synchronization could not complete safely.';
    const authorizationFailure = [401, 403].includes(error.status);
    const next = error.permanent || authorizationFailure ? { status: 'blocked', nextAttemptAt: null } : retryState(attempt, now(), error.retryAfter);
    await Board.updateOne(sourceFilter, { $set: {
      'hubspotSync.status': next.status, 'hubspotSync.nextAttemptAt': next.nextAttemptAt,
      'hubspotSync.errorCode': code, 'hubspotSync.error': message,
      'hubspotSync.configVersion': configVersion, 'hubspotSync.portalId': portalId,
    } });
    await HubSpotConnection.updateOne({ workspaceId, portalId, version: configVersion }, { $set: { lastError: message, ...(authorizationFailure ? { status: 'error' } : {}) } });
    if (error.status === 429) await HubSpotLock.updateOne({ _id: lease.key, owner: lease.owner }, { $set: { cooldownUntil: new Date(Math.max(now() + RETRY_MS, error.retryAfter || 0)) } });
    await HubSpotAudit.create({ workspaceId, action: 'contact_sync_error', portalId, configVersion, projectId, sourceVersion, attempt, code,
      operation, outcome: 'failed', durationMs: Date.now() - startedAt, correlationId: api?.correlationId });
    return { status: next.status, code };
  }
}

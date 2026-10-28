import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { startTestDatabase, stopTestDatabase, clearTestDatabase, createUser, createWorkspace, createMembership, createDepartment, withWorkspace } from '../../tests/leave/testUtils.js';
import Board from '../../models/Board.js';
import Option from '../../models/ProjectDropdownOption.js';
import { HUBSPOT_MODELS, HubSpotConnection, HubSpotMapping } from './models.js';
import { encryptCredential } from './crypto.js';
import { processHubSpotJob } from './syncService.js';
import { sourceState, sourceHash, payloadFor, digest } from './domain.js';
import { normalizeOwner, technologyValues } from './contactProperties.js';
import { HubSpotApi } from './api.js';
import { runHubSpotContactFieldsMigration } from '../../scripts/migrateHubSpotContactFields.js';
import { approveChange, saveConnection } from './configService.js';

let user, workspace, department, connection, react, node, contact, api, writes;
const scoped = fn => withWorkspace(workspace._id, fn);
const techProperty = { type: 'enumeration', fieldType: 'checkbox', options: [{ value: 'react', label: 'React' }, { value: 'nodejs', label: 'Node.js' }] };
beforeAll(async () => { await startTestDatabase(); for (const model of HUBSPOT_MODELS) await model.createIndexes(); }, 60000);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  process.env.HUBSPOT_ENCRYPTION_KEY_VERSION = 'test'; process.env.HUBSPOT_ENCRYPTION_KEYS = JSON.stringify({ test: randomBytes(32).toString('base64') });
  user = await createUser(); workspace = await createWorkspace({ owner: user._id });
  await createMembership({ workspace: workspace._id, user: user._id, role: 'admin' });
  department = await createDepartment({ workspaceId: workspace._id, name: 'Projects', managers: [user._id] });
  await scoped(async () => {
    [react, node] = await Option.create([{ type: 'technology', value: 'react', label: 'React', createdBy: user._id }, { type: 'technology', value: 'node', label: 'Node.js', createdBy: user._id }]);
    connection = await HubSpotConnection.create({ portalId: '111', enabled: true, contactOwnerId: '123', credential: encryptCredential('test-service-key-for-hubspot', workspace._id, '111') });
  });
  contact = null; writes = [];
  api = {
    getProperty: vi.fn(async name => name === 'technology' ? techProperty : { type: 'bool', modificationMetadata: { readOnlyValue: false } }),
    validateOwner: vi.fn(async () => 'verified'),
    getContact: vi.fn(async () => contact), findByEmail: vi.fn(async () => contact),
    create: vi.fn(async properties => { writes.push(properties); contact = { id: '88', properties: { ...properties, hs_marketable_status: 'false' } }; return contact; }),
    update: vi.fn(async (id, properties) => { writes.push(properties); Object.assign(contact.properties, properties); return contact; }),
  };
});
async function project(technologies = [], marketingContact = false) { return scoped(() => Board.create({ name: 'Project', department: department._id, owner: user._id, projectType: 'Hired Client', technologies, clientDetails: { clientName: 'John Doe', clientEmail: 'john@example.com', clientWhatsappNumber: '+919876543210', marketingContact } })); }
async function job(board) { const current = await scoped(() => Board.findById(board._id).select('+hubspotSync').lean()); const config = await scoped(() => HubSpotConnection.findById(connection._id).lean()); return { workspaceId: String(workspace._id), projectId: String(board._id), portalId: config.portalId, configVersion: config.version, sourceVersion: current.hubspotSync.version }; }
async function sync(board) { return processHubSpotJob(await job(board), { apiFactory: (key, options) => Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, async (...args) => { await options.beforeRequest(); return fn(...args); }])) }); }

it('maps actual option internal values, sorts and clears selections', () => {
  expect(technologyValues([{ value: 'node', label: 'Node.js' }, { value: 'react', label: 'React' }], techProperty)).toBe('nodejs;react');
  expect(technologyValues([], techProperty)).toBe('');
  expect(() => technologyValues([{ value: 'bad', label: 'Bad' }], techProperty)).toThrow();
});
it.each(['0', '-1', '1.5', '12x', ' 123', 123])('rejects unsafe owner %s', value => expect(() => normalizeOwner(value)).toThrow());
it('versions technology and marketing edits without changing client identity or reviving unrelated failures', () => {
  const base = { clientDetails: { clientEmail: 'a@b.com' }, projectType: 'Hired Client', technologies: [] };
  const old = { ...sourceState(base), status: 'failed', attempts: 4 };
  expect(sourceState({ ...base, name: 'Changed' }, old)).toBe(old);
  const changed = sourceState({ ...base, technologies: ['abc'] }, old);
  expect(changed.version).not.toBe(old.version); expect(changed.clientKey).toBe(old.clientKey); expect(changed.attempts).toBe(0);
  expect(sourceHash({ ...base, clientDetails: { ...base.clientDetails, marketingContact: true } })).not.toBe(sourceHash(base));
});
it('combines technologies across eligible projects and reuses the same contact on removal', async () => {
  const a = await project([react._id]), b = await project([node._id]);
  expect(await sync(a)).toEqual({ synced: true }); expect(contact.properties).toMatchObject({ technology: 'nodejs;react', hubspot_owner_id: '123', hs_marketable_status: 'false' });
  expect(writes[0]).not.toHaveProperty('flowtask_marketing_requested');
  await sync(b); expect(api.create).toHaveBeenCalledTimes(1);
  await scoped(() => Board.updateOne({ _id: a._id }, { $set: { technologies: [] } })); await sync(a);
  expect(contact.properties.technology).toBe('nodejs'); expect(api.create).toHaveBeenCalledTimes(1);
  expect(await scoped(() => HubSpotMapping.countDocuments({}))).toBe(1);
});
it('blocks conflicting marketing preferences before writing', async () => {
  const a = await project([], false); await project([], true);
  expect(await sync(a)).toMatchObject({ status: 'blocked', code: 'CLIENT_CONFLICT' }); expect(writes).toHaveLength(0);
});
it('uses latest owner on the next source edit and omits missing owner without clearing remote ownership', async () => {
  const a = await project(); await sync(a);
  await scoped(() => HubSpotConnection.updateOne({}, { $set: { contactOwnerId: '456' }, $inc: { version: 1 } }));
  expect((await sync(a)).skipped).toBe('stale_or_ineligible'); expect(contact.properties.hubspot_owner_id).toBe('123');
  await scoped(() => Board.updateOne({ _id: a._id }, { $set: { 'clientDetails.clientName': 'Jane Doe' } })); await sync(a); expect(contact.properties.hubspot_owner_id).toBe('456');
  await scoped(() => HubSpotConnection.updateOne({}, { $set: { contactOwnerId: '' }, $inc: { version: 1 } }));
  await scoped(() => Board.updateOne({ _id: a._id }, { $set: { 'clientDetails.clientName': 'Jane Smith' } })); await sync(a); expect(writes.at(-1)).not.toHaveProperty('hubspot_owner_id');
});
it('requires a valid editable marketing property and never writes a read-only status', async () => {
  const a = await project(); api.getProperty.mockImplementation(async name => name === 'technology' ? techProperty : { type: 'bool', modificationMetadata: { readOnlyValue: true } });
  expect(await sync(a)).toMatchObject({ status: 'blocked', code: 'MARKETING_STATUS_READ_ONLY' }); expect(writes).toHaveLength(0);
});
it('verifies Owner ID against the connected account, flags permission limits and rejects archived owners', async () => {
  const api = new HubSpotApi('secret', { transport: { request: vi.fn(async () => ({ data: { id: '123', archived: false } })) } });
  expect(await api.validateOwner('123')).toBe('verified');
  api.transport.request.mockRejectedValue({ response: { status: 403 } }); expect(await api.validateOwner('123')).toBe('unverified');
  api.transport.request.mockResolvedValue({ data: { id: '123', archived: true } }); await expect(api.validateOwner('123')).rejects.toMatchObject({ code: 'INVALID_OWNER' });
});
it('baselines legacy failed hashes without resetting attempts or source version', async () => {
  const a = await project(); const old = digest(payloadFor(a));
  await Board.collection.updateOne({ _id: a._id }, { $set: { 'hubspotSync.hash': old, 'hubspotSync.status': 'failed', 'hubspotSync.attempts': 4 }, $unset: { 'hubspotSync.identityHash': 1 } });
  await runHubSpotContactFieldsMigration();
  const current = await scoped(() => Board.findById(a._id).select('+hubspotSync').lean());
  expect(current.hubspotSync).toMatchObject({ status: 'failed', attempts: 4, version: a.hubspotSync.version, hash: sourceHash(current) });
});
it('saves owner updates only after password step-up and rejects replay', async () => {
  const validation = vi.spyOn(HubSpotApi.prototype, 'validate').mockResolvedValue({ portalId: '111', readVerified: true, writeCapability: 'verified' });
  const ownerValidation = vi.spyOn(HubSpotApi.prototype, 'validateOwner').mockResolvedValue('verified');
  const input = { workspaceId: workspace._id, userId: user._id, sessionToken: 'session', action: 'configure', version: 1 };
  try {
    await expect(scoped(() => approveChange({ ...input, password: 'wrong' }))).rejects.toMatchObject({ status: 401 });
    const { approval } = await scoped(() => approveChange({ ...input, password: 'LeaveTestOnly1' }));
    const saved = await scoped(() => saveConnection({ ...input, approval, contactOwnerId: '777', serviceKey: 'a-test-service-key-only' }));
    expect(saved).toMatchObject({ contactOwnerId: '777', ownerValidation: 'verified', version: 2 });
    await expect(scoped(() => saveConnection({ ...input, approval, version: 2, contactOwnerId: '888', serviceKey: 'a-test-service-key-only' }))).rejects.toMatchObject({ status: 401 });
  } finally { validation.mockRestore(); ownerValidation.mockRestore(); }
});

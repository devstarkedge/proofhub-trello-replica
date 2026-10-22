import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
vi.mock('../../utils/chatHooks.js', () => ({ chatHooks: { onTaskCreated: vi.fn(async () => {}) } }));
import router from '../../modules/tracking/tracking.routes.js';
import { clearAuthCache } from '../../middleware/authMiddleware.js';
import config from '../../config/index.js';
import { TEMPLATES } from '../../authz/templates.js';
import Board from '../../models/Board.js';
import List from '../../models/List.js';
import Card from '../../models/Card.js';
import Activity from '../../models/Activity.js';
import Role from '../../models/Role.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import PermissionOverride from '../../models/PermissionOverride.js';
import { TrackingPolicy } from '../../modules/tracking/tracking.models.js';
import cardService from '../../services/domain/cardService.js';
import { startTestDatabase, stopTestDatabase, clearTestDatabase, withWorkspace, createWorkspace, createUser, createMembership, createDepartment } from '../leave/testUtils.js';

let server, origin;
beforeAll(async () => {
  await startTestDatabase();
  const app = express(); app.use(express.json()); app.use('/api/tracking', router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message, code: error.code }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}/api/tracking`;
}, 120000);
beforeEach(async () => {
  process.env.AUTHZ_V2 = 'enforce'; clearAuthCache(); await clearTestDatabase();
  vi.spyOn(cardService, '_notifyAssignees').mockResolvedValue();
  vi.spyOn(cardService, '_notifyMembers').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopTestDatabase(); }, 60000);

async function fixture(role = 'manager') {
  const user = await createUser({ role: 'admin' }), workspace = await createWorkspace(), foreignWorkspace = await createWorkspace();
  const department = await createDepartment({ workspaceId: workspace._id, name: 'Managed', managers: [user._id] });
  const roleDoc = await withWorkspace(workspace._id, () => Role.create({ ...TEMPLATES[role], workspaceId: workspace._id }));
  const member = await createMembership({ workspace: workspace._id, user: user._id, role, department: [department._id] });
  await WorkspaceMembership.updateOne({ _id: member._id }, { $set: { roleId: roleDoc._id } });
  const project = await withWorkspace(workspace._id, async () => {
    await TrackingPolicy.create({ workspaceId: workspace._id, configuredAt: new Date(), enabled: true });
    return Board.create({ workspaceId: workspace._id, name: 'Managed project', department: department._id, owner: user._id, visibility: 'department' });
  });
  const list = await withWorkspace(workspace._id, () => List.create({ workspaceId: workspace._id, board: project._id, title: 'To Do' }));
  const foreign = await withWorkspace(foreignWorkspace._id, () => Board.create({ workspaceId: foreignWorkspace._id, name: 'Foreign', department: department._id, owner: user._id }));
  const headers = { Authorization: `Bearer ${jwt.sign({ id: String(user._id) }, config.jwt.secret, { expiresIn: '1h' })}`, 'x-workspace-id': String(workspace._id), 'Content-Type': 'application/json' };
  return { user, workspace, department, project, list, foreign, headers };
}
const request = async (f, url, payload) => {
  const response = await fetch(origin + url, { headers: f.headers, ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}) });
  return { status: response.status, body: await response.json() };
};

it.each(['off', 'enforce'])('loads the manager CREATE first page without an empty ObjectId filter (%s)', async mode => {
  process.env.AUTHZ_V2 = mode;
  const f = await fixture(); process.env.AUTHZ_V2 = mode;
  const outsideDepartment = await createDepartment({ workspaceId: f.workspace._id, name: 'Outside managed scope' });
  await withWorkspace(f.workspace._id, () => Board.create({ workspaceId: f.workspace._id, name: 'Restricted private project', department: outsideDepartment._id, owner: f.workspace.owner, visibility: 'private' }));
  const result = await request(f, '/options?mode=CREATE');
  expect(result.status).toBe(200);
  expect(result.body.data.canCreateTasks).toBe(true);
  expect(result.body.data.projects).toEqual([expect.objectContaining({ _id: String(f.project._id), canCreate: true })]);
  expect(result.body.data.lists.map(list => list._id)).toContain(String(f.list._id));
  expect(result.body.data.tasks).toEqual([]);
}, 30000);

it('returns an empty CREATE page when there are no projects, and ASSIGNED remains assignment-only', async () => {
  const f = await fixture();
  expect((await request(f, '/options?mode=ASSIGNED')).body.data.projects).toEqual([]);
  await withWorkspace(f.workspace._id, () => Board.deleteOne({ _id: f.project._id }));
  const empty = await request(f, '/options?mode=CREATE');
  expect(empty.status).toBe(200); expect(empty.body.data.projects).toEqual([]);
}, 30000);

it('paginates CREATE projects without duplicates or tenant leakage', async () => {
  const f = await fixture();
  await withWorkspace(f.workspace._id, () => Board.insertMany(Array.from({ length: 51 }, (_, i) => ({ workspaceId: f.workspace._id, name: `Project ${i}`, department: f.department._id, owner: f.user._id, visibility: 'department' }))));
  const first = (await request(f, '/options?mode=CREATE')).body.data;
  expect(first.projects).toHaveLength(50); expect(first.nextProjectCursor).toBeTruthy();
  const second = (await request(f, `/options?mode=CREATE&cursor=${first.nextProjectCursor}`)).body.data;
  const ids = [...first.projects, ...second.projects].map(p => p._id);
  expect(new Set(ids).size).toBe(52); expect(ids).not.toContain(String(f.foreign._id));
  expect(second.nextProjectCursor).toBeNull();
}, 30000);

it.each(['projectId[$ne]=x', 'projectId[]=x', 'projectId=123456789012', 'cursor[$gt]=x', 'cursor=bad', 'taskCursor[]=x'])('rejects malformed identifiers before any project query: %s', async query => {
  const f = await fixture(), find = vi.spyOn(Board, 'find');
  const result = await request(f, `/options?mode=CREATE&${query}`);
  expect(result.status).toBe(400); expect(result.body.code).toBe('TRACKING_INVALID'); expect(find).not.toHaveBeenCalled();
}, 30000);

it('creates and self-assigns the selected task once, then returns it in assigned options', async () => {
  const f = await fixture();
  const options = (await request(f, '/options?mode=CREATE')).body.data;
  const payload = { projectId: options.projectId, listId: options.lists[0]._id, title: 'Manager task', description: 'Created from check-in', operationId: 'manager-create-operation' };
  const created = await request(f, '/tasks', payload), replay = await request(f, '/tasks', payload);
  expect(created.status).toBe(200); expect(replay.status).toBe(200); expect(replay.body.data._id).toBe(created.body.data._id);
  expect(created.body.data.assignees.map(u => u._id)).toContain(String(f.user._id));
  const assigned = (await request(f, `/options?projectId=${f.project._id}`)).body.data;
  expect(assigned.tasks.map(t => t._id)).toContain(created.body.data._id);
  await withWorkspace(f.workspace._id, async () => { expect(await Card.countDocuments({ trackingCreationId: payload.operationId })).toBe(1); expect(await Activity.countDocuments({ card: created.body.data._id, type: 'card_created' })).toBe(1); });
}, 30000);

it('preserves employee, project visibility and permission boundaries', async () => {
  const f = await fixture('employee');
  expect((await request(f, '/options?mode=CREATE')).body.data.canCreateTasks).toBe(false);
  expect((await request(f, '/tasks', { projectId: String(f.project._id), listId: String(f.list._id), title: 'No', operationId: 'employee-operation' })).status).toBe(403);
  expect((await request(f, `/options?projectId=${f.foreign._id}`)).status).toBe(404);
}, 30000);

it('rechecks task assignment permission before offering projects or creating a task', async () => {
  const f = await fixture();
  await PermissionOverride.create({ workspace: f.workspace._id, user: f.user._id, permission: 'task.assign', effect: 'deny', scope: 'workspace', scopeKey: '*', reason: 'Task assignment permission revoked' });
  expect((await request(f, '/options?mode=CREATE')).body.data.projects).toEqual([]);
  expect((await request(f, '/tasks', { projectId: String(f.project._id), listId: String(f.list._id), title: 'No', operationId: 'denied-operation' })).status).toBe(403);
}, 30000);

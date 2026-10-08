import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
vi.mock('../../utils/slackHooks.js', () => ({ slackHooks: {} }));
vi.mock('../../utils/chatHooks.js', () => ({ chatHooks: {} }));
vi.mock('../../utils/notificationService.js', () => ({ default: {} }));
vi.mock('../../schedulers/cardDueDateScheduler.js', () => ({ scheduleDueDateJobs: vi.fn(), cancelDueDateJobs: vi.fn() }));
vi.mock('../../utils/recurrenceScheduler.js', () => ({ handleTaskCompletion: vi.fn() }));
vi.mock('../../utils/backgroundTasks.js', () => ({ runBackground: vi.fn(), sendEmailInBackground: vi.fn(), createNotificationInBackground: vi.fn() }));
vi.mock('../../utils/email.js', () => ({ sendEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock('../../modules/workspaces/invitationService.js', () => ({ findValidInvitationByToken: vi.fn(), acceptInvitation: vi.fn() }));
import { authorize, protect, invalidateAuthCache } from '../../middleware/authMiddleware.js';
import { updateCard, createCard } from '../../controllers/cardController.js';
import { updateList } from '../../controllers/listController.js';
import { updateSubtask } from '../../controllers/subtaskController.js';
import { updateNano } from '../../controllers/subtaskNanoController.js';
import { checkEmail } from '../../controllers/authController.js';
import { updateUser } from '../../controllers/userController.js';
import { getSystemStats } from '../../controllers/adminController.js';
import { syncMembershipFromUser } from '../../modules/workspaces/membershipSyncService.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { literalSearch } from '../../utils/literalSearch.js';
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import Card from '../../models/Card.js';
import List from '../../models/List.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';

let server, url, actingUser;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.user = actingUser; req.workspaceId = 'workspace-a'; next(); });
  app.get('/roles/multi', authorize('manager','hr'), (req,res) => res.json({ ok: true }));
  app.get('/roles/admin', authorize('admin'), (req,res) => res.json({ ok: true }));
  app.get('/protected-twice', protect, protect, (req,res) => res.json({ ok: true }));
  app.put('/cards/:id', updateCard); app.post('/cards', createCard);
  app.put('/lists/:id', updateList); app.put('/subtasks/:id', updateSubtask); app.put('/nanos/:id', updateNano);
  app.put('/users/:id', updateUser);
  app.post('/check-email', rateLimiter({ maxRequests: 3 }), checkEmail);
  app.get('/stats', getSystemStats);
  app.get('/search', (req,res,next) => { try { const re = literalSearch(req.query.q); res.json({ match: re.test('literal.*value'), wildcard: re.test('literalZZvalue') }); } catch (e) { next(e); } });
  app.post('/sync-mirror', async (req,res,next) => { try { await syncMembershipFromUser('u','workspace-a'); res.json({ ok: true }); } catch (e) { next(e); } });
  app.use((e,req,res,next) => res.status(e.statusCode || 500).json({ message: e.message }));
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve)); url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { actingUser = { id: 'u', _id: 'u', role: 'employee', workspaceId: 'workspace-a' }; invalidateAuthCache('u'); });
afterEach(() => vi.restoreAllMocks());
const request = (path,body,method='PUT') => fetch(url+path,{ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('Phase 0 HTTP regressions', () => {
  it('C1 denies an existing custom role on multi-role endpoints', async () => {
    const lookup = vi.spyOn(Role,'findResolvable').mockResolvedValue({ isActive: true, permissions: { canManageSystem: true } });
    actingUser.role = 'custom-role';
    expect((await fetch(url+'/roles/multi')).status).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
    actingUser.role = 'manager'; expect((await fetch(url+'/roles/multi')).status).toBe(200);
    actingUser.role = 'admin'; expect((await fetch(url+'/roles/multi')).status).toBe(200);
  });
  it('C1 inactive custom roles cannot use the transitional admin capability', async () => {
    actingUser.role = 'custom-role'; vi.spyOn(Role,'findResolvable').mockResolvedValue({ isActive: false, permissions: { canManageSystem: true } });
    expect((await fetch(url+'/roles/admin')).status).toBe(403);
  });
  it('C2 mirror synchronization cannot create or overwrite memberships', async () => {
    const read = vi.spyOn(User,'findById'), write = vi.spyOn(WorkspaceMembership,'findOneAndUpdate');
    expect((await request('/sync-mirror',{},'POST')).status).toBe(200);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it.each(['/cards/t','/lists/l','/subtasks/s','/nanos/n'])('C3 rejects tenant and owner changes before touching records on %s', async path => {
    const writes = [vi.spyOn(Card,'findByIdAndUpdate'),vi.spyOn(List,'findByIdAndUpdate'),vi.spyOn(Subtask,'findByIdAndUpdate'),vi.spyOn(SubtaskNano,'findByIdAndUpdate')];
    for (const body of [{ workspaceId: 'foreign' },{ board: 'foreign' },{ createdBy: 'other' },{ $set: { title: 'injected' } }]) expect((await request(path,body)).status).toBe(400);
    writes.forEach(write => expect(write).not.toHaveBeenCalled());
  });
  it('C3 refuses creating a task with a list from another project', async () => {
    vi.spyOn(List,'findById').mockReturnValue({ lean: async () => ({ board: 'other', title: 'Todo' }) });
    vi.spyOn(Card,'countDocuments').mockResolvedValue(0); const create = vi.spyOn(Card,'create');
    expect((await request('/cards',{ title: 'task', board: 'requested', list: 'list' },'POST')).status).toBe(400); expect(create).not.toHaveBeenCalled();
  });
  it('C5 system statistics query identities only from the selected workspace', async () => {
    const membership = vi.spyOn(WorkspaceMembership,'find').mockReturnValue({ select: () => ({ lean: async () => [{ user: 'member-a',role: 'employee' }] }) });
    const users = vi.spyOn(User,'countDocuments').mockResolvedValue(1);
    const response = await fetch(url+'/stats'); expect(response.status).toBe(200);
    expect(membership).toHaveBeenCalledWith({ workspace: 'workspace-a', status: 'active' });
    for (const [filter] of users.mock.calls) expect(filter._id).toEqual({ $in: ['member-a'] });
  });
  it.each(['email','role','roleId','isActive','isVerified','department','allowedProjects'])('C6 disallows changing another member identity/access field %s', async field => {
    const save = vi.spyOn(User,'findById'); expect((await request('/users/other',{ [field]: 'injected' })).status).toBe(400); expect(save).not.toHaveBeenCalled();
  });
  it('L7 email lookup has a uniform response and is rate limited', async () => {
    const lookup = vi.spyOn(User,'findOne');
    const a = await request('/check-email',{ email: 'known@example.com' },'POST'); const b = await request('/check-email',{ email: 'unknown@example.com',excludeUserId: 'u' },'POST');
    expect(a.status).toBe(200); expect(await a.json()).toEqual(await b.json()); expect(lookup).not.toHaveBeenCalled();
    await request('/check-email',{ email: 'x@example.com' },'POST'); expect((await request('/check-email',{ email: 'x@example.com' },'POST')).status).toBe(429);
  });
  it('M11 treats metacharacters literally and rejects unbounded search', async () => {
    expect(await (await fetch(url+'/search?q='+encodeURIComponent('.*'))).json()).toEqual({ match: true, wildcard: false });
    expect((await fetch(url+'/search?q='+'a'.repeat(101))).status).toBe(400);
  });
  it('nested protection reuses a verified request context', async () => {
    const read = vi.spyOn(User,'findById'); expect((await fetch(url+'/protected-twice')).status).toBe(200); expect(read).not.toHaveBeenCalled();
  });
});

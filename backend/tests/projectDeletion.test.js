import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';

const mocks = vi.hoisted(() => ({
  findBoard: vi.fn(), deleteBoard: vi.fn(), deleteRelated: vi.fn(), hook: vi.fn(),
  emptyFind: vi.fn(), cards: vi.fn(), notify: vi.fn(),
}));
vi.mock('../models/Board.js', () => ({ default: { findById: mocks.findBoard } }));
vi.mock('../models/Card.js', () => ({ default: { find: mocks.cards, deleteMany: mocks.deleteRelated } }));
vi.mock('../models/List.js', () => ({ default: { find: mocks.emptyFind, deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Subtask.js', () => ({ default: { find: mocks.emptyFind, deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Attachment.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Label.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Activity.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Department.js', () => ({ default: { findByIdAndUpdate: mocks.deleteRelated } }));
vi.mock('../models/Notification.js', () => ({ default: {} }));
vi.mock('../models/RecurringTask.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Reminder.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/SubtaskNano.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/Comment.js', () => ({ default: { deleteMany: mocks.deleteRelated } }));
vi.mock('../models/User.js', () => ({ default: {} }));
vi.mock('../services/permissionService.js', () => ({ getAssignmentBasedBoardIds: vi.fn(), userHasCapability: vi.fn(), CAPABILITIES: {} }));
vi.mock('../realtime/index.js', () => ({ emitNotification: vi.fn(), emitToAll: vi.fn() }));
vi.mock('../utils/notificationService.js', () => ({ default: { notifyTaskDeleted: mocks.notify } }));
vi.mock('../utils/slackHooks.js', () => ({ slackHooks: {} }));
vi.mock('../utils/chatHooks.js', () => ({ chatHooks: { onProjectDeleted: mocks.hook } }));
vi.mock('../utils/backgroundTasks.js', () => ({ notifyProjectCreatedInBackground: vi.fn(), sendProjectEmailsInBackground: vi.fn(), logProjectActivityInBackground: vi.fn() }));
vi.mock('../utils/cloudinary.js', () => ({ uploadProjectCover: vi.fn(), validateCoverImage: vi.fn(), deleteProjectCover: vi.fn() }));
vi.mock('../services/milestone/milestoneService.js', () => ({
  MILESTONE_BILLING_TYPE: {}, createMilestonesForProject: vi.fn(), getProjectMilestones: vi.fn(),
  normalizeMilestoneSchedule: vi.fn(), removeUnapprovedMilestoneSchedule: vi.fn(), syncMilestoneSchedule: vi.fn(),
}));

import { deleteBoard } from '../controllers/boardController.js';

const board = { _id: 'project-1', owner: 'owner-1', deleteOne: mocks.deleteBoard };
let user, server, url;
beforeAll(async () => {
  const app = express();
  app.delete('/boards/:id', (req, res, next) => { req.user = user; next(); }, deleteBoard);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/boards/project-1`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
const requestDelete = () => fetch(url, { method: 'DELETE' });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBoard.mockResolvedValue(board);
  mocks.cards.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mocks.emptyFind.mockResolvedValue([]);
  mocks.deleteRelated.mockResolvedValue({});
  mocks.deleteBoard.mockResolvedValue({});
  mocks.notify.mockResolvedValue({});
  mocks.hook.mockResolvedValue({});
  user = { id: 'owner-1', role: 'admin' };
});

describe('project deletion ChatApp event', () => {
  it('dispatches removal only after the project has been deleted successfully', async () => {
    const response = await requestDelete();
    expect(response.status).toBe(200);
    expect(mocks.hook).toHaveBeenCalledWith(board, user);
    expect(mocks.deleteBoard.mock.invocationCallOrder[0]).toBeLessThan(mocks.hook.mock.invocationCallOrder[0]);
  });
  it('keeps ChatApp intact when a cascade delete fails', async () => {
    mocks.deleteRelated.mockRejectedValueOnce(new Error('Cascade failed'));
    const response = await requestDelete();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Cascade failed' });
    expect(mocks.hook).not.toHaveBeenCalled();
    expect(mocks.deleteBoard).not.toHaveBeenCalled();
  });
  it('keeps ChatApp intact when deleting the project itself fails', async () => {
    mocks.deleteBoard.mockRejectedValueOnce(new Error('Delete failed'));
    const response = await requestDelete();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Delete failed' });
    expect(mocks.hook).not.toHaveBeenCalled();
  });
  it('does not send an event for an unauthorized deletion', async () => {
    user = { id: 'other-user', role: 'employee' };
    const response = await requestDelete();
    expect(response.status).toBe(403);
    expect(mocks.hook).not.toHaveBeenCalled();
  });
});

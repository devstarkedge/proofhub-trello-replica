import mongoose from 'mongoose';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import { getIO } from '../realtime/emitters.js';
import { ROOM } from '../realtime/events.js';
const id = value => String(value?._id || value || '');
const canManage = (team, user) => user.role === 'admin' || id(team.owner) === id(user.id || user._id);
async function refreshMembers(ids, workspaceId) {
  for (const userId of ids || []) {
    invalidateAuthCache(userId);
    try { getIO().in(ROOM.user(userId, workspaceId)).disconnectSockets(true); } catch { /* HTTP checks remain authoritative. */ }
  }
}
async function syncRoster(team, previous, session) {
  const members = [...new Set([id(team.owner), ...team.members.map(id)])];
  const active = await WorkspaceMembership.countDocuments({ workspace: team.workspaceId, user: { $in: members }, status: 'active', kind: { $ne: 'guest' } }).session(session);
  const accounts = await User.countDocuments({ _id: { $in: members }, isActive: true }).session(session);
  if (active !== members.length || accounts !== members.length) throw new ErrorResponse('Team members must be active members of this workspace', 400);
  team.members = members;
  await Team.updateMany({ _id: { $ne: team._id }, members: { $in: members } }, { $pull: { members: { $in: members } } }, { session });
  await WorkspaceMembership.updateMany({ workspace: team.workspaceId, user: { $in: members }, status: 'active' }, { $set: { team: team._id }, $inc: { permVersion: 1 } }, { session });
  await WorkspaceMembership.updateMany({ workspace: team.workspaceId, user: { $in: previous.filter(user => !members.includes(id(user))) }, team: team._id }, { $unset: { team: 1 }, $inc: { permVersion: 1 } }, { session });
  await team.save({ session });
  return [...new Set([...members, ...previous.map(id)])];
}
async function mutate(req, teamId, change) {
  const session = await mongoose.startSession();
  let team, affected;
  try {
    await session.withTransaction(async () => {
      team = await Team.findOne({ _id: teamId, isActive: true }).session(session);
      if (!team) throw new ErrorResponse('Team not found', 404);
      if (!canManage(team, req.user)) throw new ErrorResponse('Not authorized to manage this team', 403);
      const previous = team.members.map(id);
      await change(team, session);
      affected = await syncRoster(team, previous, session);
    });
  } finally { await session.endSession(); }
  await refreshMembers(affected, req.workspaceId);
  return team;
}
export const getTeams = asyncHandler(async (req, res) => {
  const query = { isActive: true, members: req.user.id };
  if (req.query.department) query.department = req.query.department;
  const teams = await Team.find(query).populate('owner', 'name email').populate('members', 'name email').populate('department', 'name').sort('name');
  res.json({ success: true, count: teams.length, data: teams });
});
export const getTeam = asyncHandler(async (req, res) => {
  const team = await Team.findOne({ _id: req.params.id, isActive: true });
  if (!team || !canManage(team, req.user) && !team.members.some(member => id(member) === id(req.user.id))) throw new ErrorResponse('Team not found', 404);
  await team.populate([{ path: 'owner', select: 'name email' }, { path: 'members', select: 'name email' }, { path: 'department', select: 'name' }]);
  res.json({ success: true, data: team });
});
export const createTeam = asyncHandler(async (req, res) => {
  const { name, description, department } = req.body;
  const dept = await Department.findById(department).lean();
  if (!dept) throw new ErrorResponse('Department not found', 404);
  if (req.user.role !== 'admin' && !(dept.managers || []).some(user => id(user) === id(req.user.id)) && !(req.user.department || []).some(value => id(value) === id(department))) throw new ErrorResponse('Not authorized for this department', 403);
  const session = await mongoose.startSession();
  let team, affected;
  try {
    await session.withTransaction(async () => {
      if (await Team.exists({ name, department, isActive: true }).session(session)) throw new ErrorResponse('Team already exists', 409);
      team = new Team({ workspaceId: req.workspaceId, name, description, department, owner: req.user.id, members: [req.user.id] });
      affected = await syncRoster(team, [], session);
    });
  } finally { await session.endSession(); }
  await refreshMembers(affected, req.workspaceId);
  res.status(201).json({ success: true, data: team });
});
export const updateTeam = asyncHandler(async (req, res) => {
  const team = await mutate(req, req.params.id, async team => {
    if (req.body.name !== undefined) team.name = req.body.name;
    if (req.body.description !== undefined) team.description = req.body.description;
    if (req.body.members !== undefined) {
      if (!Array.isArray(req.body.members) || req.body.members.length > 1000) throw new ErrorResponse('Invalid team members', 400);
      team.members = req.body.members;
    }
  });
  res.json({ success: true, data: team });
});
export const addMember = asyncHandler(async (req, res) => {
  const team = await mutate(req, req.params.id, async team => { team.members.addToSet(req.body.userId); });
  res.json({ success: true, data: team });
});
export const inviteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase(), isActive: true }).select('_id');
  if (!user) throw new ErrorResponse('Active workspace member not found; use a workspace invitation for a new member', 404);
  const team = await mutate(req, req.params.teamId, async team => { team.members.addToSet(user._id); });
  res.json({ success: true, msg: 'Member added to team', data: team });
});
// A Team ID was never an invitation credential. Retire these enumerable links.
export const joinTeam = asyncHandler(async (_req, res) => {
  res.status(410).json({ success: false, message: 'Legacy team links have expired. Ask the team owner to add you through member management.' });
});
export const removeMember = asyncHandler(async (req, res) => {
  const team = await mutate(req, req.params.teamId, async team => {
    if (id(team.owner) === id(req.params.userId)) throw new ErrorResponse('The team owner cannot be removed', 400);
    if (!team.members.some(value => id(value) === id(req.params.userId))) throw new ErrorResponse('Team member not found', 404);
    team.members = team.members.filter(value => id(value) !== id(req.params.userId));
  });
  res.json({ success: true, msg: 'Member removed', data: team });
});
export const deleteTeam = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let affected;
  try {
    await session.withTransaction(async () => {
      const team = await Team.findOne({ _id: req.params.id, isActive: true }).session(session);
      if (!team) throw new ErrorResponse('Team not found', 404);
      if (!canManage(team, req.user)) throw new ErrorResponse('Not authorized to delete this team', 403);
      affected = team.members.map(id);
      team.isActive = false;
      await team.save({ session });
      await WorkspaceMembership.updateMany({ workspace: req.workspaceId, team: team._id }, { $unset: { team: 1 }, $inc: { permVersion: 1 } }, { session });
    });
  } finally { await session.endSession(); }
  await refreshMembers(affected, req.workspaceId);
  res.json({ success: true, message: 'Team deactivated successfully' });
});

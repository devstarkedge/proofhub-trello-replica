import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import User from '../../models/User.js';

function toId(value) {
  if (!value) return null;
  return (value._id || value.id || value).toString();
}

function addSource(sourceMap, values, source) {
  for (const value of values || []) {
    const id = toId(value);
    if (!id) continue;
    if (!sourceMap.has(id)) sourceMap.set(id, new Set());
    sourceMap.get(id).add(source);
  }
}

export function buildProjectParticipantRecords(groups, users) {
  const sources = new Map();
  addSource(sources, [groups.owner], 'project_owner');
  addSource(sources, groups.members, 'project');
  addSource(sources, groups.taskAssignees, 'task');
  addSource(sources, groups.taskMembers, 'task_member');
  addSource(sources, groups.subtaskAssignees, 'subtask');
  addSource(sources, groups.nanoAssignees, 'nano_subtask');

  return (users || [])
    .map((user) => {
      const flowTaskUserId = toId(user);
      if (!flowTaskUserId || !sources.has(flowTaskUserId)) return null;
      return {
        flowTaskUserId,
        name: user.name,
        email: user.email?.trim().toLowerCase() || '',
        avatar: user.avatar || null,
        role: user.role || 'employee',
        isActive: user.isActive !== false,
        isVerified: user.isVerified === true,
        sources: [...sources.get(flowTaskUserId)].sort(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.flowTaskUserId.localeCompare(b.flowTaskUserId));
}

/**
 * Calculate the exact user union for one project. This is intentionally used
 * only for membership-changing operations and explicit reconciliation; normal
 * task edits do not trigger hierarchy scans.
 */
export async function getProjectMembershipSnapshot(
  boardId,
  { incrementVersion = false } = {},
) {
  const boardQuery = incrementVersion
    ? Board.findOneAndUpdate(
        { _id: boardId, isDeleted: { $ne: true } },
        { $inc: { chatMembershipVersion: 1 } },
        { new: true },
      )
    : Board.findOne({ _id: boardId, isDeleted: { $ne: true } });

  const board = await boardQuery
    .select('name description department owner members visibility isArchived chatMembershipVersion updatedAt')
    .lean();

  if (!board) return null;

  const [taskAssignees, taskMembers, subtaskAssignees, nanoAssignees] = await Promise.all([
    Card.distinct('assignees', { board: board._id, isArchived: { $ne: true } }),
    Card.distinct('members', { board: board._id, isArchived: { $ne: true } }),
    Subtask.distinct('assignees', { board: board._id }),
    SubtaskNano.distinct('assignees', { board: board._id }),
  ]);

  const groups = {
    owner: board.owner,
    members: board.members,
    taskAssignees,
    taskMembers,
    subtaskAssignees,
    nanoAssignees,
  };
  const participantIds = new Set();
  for (const values of [
    [groups.owner],
    groups.members,
    groups.taskAssignees,
    groups.taskMembers,
    groups.subtaskAssignees,
    groups.nanoAssignees,
  ]) {
    for (const value of values || []) {
      const id = toId(value);
      if (id) participantIds.add(id);
    }
  }

  const users = participantIds.size
    ? await User.find({ _id: { $in: [...participantIds] } })
        .select('name email avatar role isActive isVerified')
        .lean()
    : [];

  const participants = buildProjectParticipantRecords(groups, users);

  return {
    project: {
      id: board._id.toString(),
      name: board.name,
      description: board.description || '',
      department: toId(board.department),
      owner: toId(board.owner),
      sourceVisibility: board.visibility || 'public',
      channelVisibility: 'private',
      isArchived: board.isArchived === true,
    },
    membershipVersion: board.chatMembershipVersion || 0,
    calculatedAt: new Date().toISOString(),
    participants,
  };
}

export default { getProjectMembershipSnapshot };

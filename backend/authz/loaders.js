import Board from '../models/Board.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import Department from '../models/Department.js';
import { id } from './engine.js';

const models = { project: Board, task: Card, list: List, subtask: Subtask, nano: SubtaskNano, comment: Comment, attachment: Attachment, department: Department };
export async function loadResource(ctx, type, resourceId) {
  const Model = models[type];
  if (!Model) return null;
  const resource = await Model.findOne({ _id: resourceId, workspaceId: ctx.workspaceId }).lean();
  if (!resource) return null;
  if (type === 'project' || type === 'department') return resource;
  let boardId = resource.board || resource.boardId;
  let taskId = resource.task || resource.card;
  if (type === 'attachment' && !taskId && (resource.subtask || resource.nanoSubtask || resource.comment)) {
    const parentType = resource.subtask ? 'subtask' : resource.nanoSubtask ? 'nano' : 'comment';
    const parent = await loadResource(ctx, parentType, resource.subtask || resource.nanoSubtask || resource.comment);
    if (!parent || boardId && id(parent.project?._id) !== id(boardId)) return null;
    return { ...resource, project: parent.project, taskResource: parent.taskResource };
  }
  if (!boardId && type === 'attachment') {
    if (resource.contextType === 'board') return loadResource(ctx, 'project', resource.contextRef);
    const parentType = { card: 'task', task: 'task', subtask: 'subtask', nano: 'nano', nanoSubtask: 'nano', subtaskNano: 'nano' }[resource.contextType];
    const parent = parentType && await loadResource(ctx, parentType, resource.contextRef);
    return parent ? { ...resource, project: parent.project || parent, taskResource: parent.taskResource || parent } : null;
  }
  if (!boardId && taskId) {
    const parentTask = await Card.findOne({ _id: taskId, workspaceId: ctx.workspaceId }).select('board').lean();
    if (!parentTask) return null;
    boardId = parentTask.board;
  }
  const project = boardId ? await Board.findOne({ _id: boardId, workspaceId: ctx.workspaceId }).lean() : null;
  if (!project) return null;
  if (type === 'task') taskId = resource._id;
  const taskResource = type === 'task' ? resource : taskId ? await Card.findOne({ _id: taskId, board: project._id, workspaceId: ctx.workspaceId }).lean() : null;
  if (taskId && !taskResource) return null;
  return { ...resource, project, taskResource };
}

export async function loadAssignments(ctx) {
  if (ctx.assignmentsLoaded) return ctx;
  const query = { workspaceId: ctx.workspaceId, $or: [{ assignees: ctx.userId }, { members: ctx.userId }] };
  const [tasks, subtasks, nanos] = await Promise.all([Card.find(query).select('_id board').lean(), Subtask.find(query).select('_id task board').lean(), SubtaskNano.find(query).select('_id task subtask board').lean()]);
  ctx.assignedTaskIds = [...new Set([...tasks.map(t => id(t._id)), ...subtasks.map(t => id(t.task)), ...nanos.map(t => id(t.task))])];
  ctx.assignedProjectIds = [...new Set([...tasks, ...subtasks, ...nanos].map(t => id(t.board)))];
  ctx.assignmentsLoaded = true;
  return ctx;
}

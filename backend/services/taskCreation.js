import Card from '../models/Card.js';
import List from '../models/List.js';
import Board from '../models/Board.js';
import Activity from '../models/Activity.js';
import { authorizeProjectResource, requireProjectPermission, prepareTaskCreation } from './projectAuthorization.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sanitizeHtml } from '../utils/sanitizeHtml.js';
import { emitToBoard } from '../realtime/index.js';
import { chatHooks } from '../utils/chatHooks.js';
import { slackHooks } from '../utils/slackHooks.js';
import notificationService from '../utils/notificationService.js';
import { scheduleDueDateJobs } from '../schedulers/cardDueDateScheduler.js';

// creationId is internal, never accepted from an HTTP body. The existing unique
// card index fences retries; activity uses a deterministic ID for import rows.
export async function createProjectTask(req, { creationId, authorizedProject, validatedList } = {}) {
  if (authorizedProject) await requireProjectPermission(req, 'task.create', authorizedProject);
  else await authorizeProjectResource(req, 'project', req.body.board, 'task.create');
  prepareTaskCreation(req);
  if (req.body.description) req.body.description = sanitizeHtml(req.body.description);
  const {
    title,
    description,
    list,
    board,
    assignee,
    assignees: assigneesFromBody,
    members,
    labels,
    priority,
    dueDate,
    startDate,
    position,
  } = req.body;

  const resolvedAssignees = Array.isArray(assigneesFromBody)
    ? assigneesFromBody
    : assignee
      ? [assignee]
      : [];

  // Get the list and count cards in parallel
  const [cardList, cardCount] = await Promise.all([
    validatedList || List.findById(list).lean(),
    position === undefined || position === null
      ? creationId ? Card.findOne({ list, board, isArchived: false }).sort({ position: -1 }).select('position').lean().then(tail => (tail?.position ?? -1) + 1) : Card.countDocuments({ list })
      : Promise.resolve(position)
  ]);

  if (!cardList) {
    throw new ErrorResponse("List not found", 404);
  }

  if (String(cardList.board) !== String(board)) {
    throw new ErrorResponse('List does not belong to the project', 400);
  }

  let card = creationId ? await Card.findOne({ trackingCreationId: creationId, createdBy: req.user.id, board, workspaceId: req.workspaceId }) : null;
  if (!card) try { card = await Card.create({
    ...(creationId ? { trackingCreationId: creationId } : {}),
    title,
    description,
    list,
    board,
    assignees: resolvedAssignees,
    members: members || [],
    labels: labels || [],
    priority,
    dueDate,
    startDate,
    status: cardList.title.toLowerCase().replace(/\s+/g, '-'),
    position: cardCount,
    createdBy: req.user.id,
  });

  } catch (error) {
    if (!creationId || error.code !== 11000) throw error;
    card = await Card.findOne({ trackingCreationId: creationId, createdBy: req.user.id, board, workspaceId: req.workspaceId });
    if (!card) throw error;
  }

  // Log activity
  const activity = {
    type: "card_created",
    description: `Created card "${title}"`,
    user: req.user.id,
    board,
    card: card._id,
    list,
    contextType: 'task'
  };
  if (creationId) await Activity.updateOne({ _id: card._id }, { $setOnInsert: { ...activity, workspaceId: req.workspaceId } }, { upsert: true, runValidators: true });
  else await Activity.create(activity);

  // Emit real-time update to board
  emitToBoard(board, 'card-created', {
    card,
    listId: list,
    createdBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // Dispatch chat webhook for task creation (always, regardless of assignees)
  const boardData = authorizedProject || await Board.findById(board).select('name department').lean();
  chatHooks.onTaskCreated(card, boardData, req.user).catch(console.error);

  // Send notifications using the notification service
  if (resolvedAssignees.length > 0) {
    await notificationService.notifyTaskAssigned(card, resolvedAssignees, req.user.id);

    // Send Slack notifications for task assignment
    slackHooks.onTaskAssigned(card, boardData, resolvedAssignees, req.user).catch(console.error);

    // Dispatch chat webhook for task assignment
    chatHooks.onTaskAssigned(card, resolvedAssignees, boardData, req.user).catch(console.error);
  }

  // Notify all members
  if (members && members.length > 0) {
    const boardData2 = boardData || await Board.findById(board).select('name department').lean();
    const memberDeptId = boardData2?.department || null;
    for (const memberId of members) {
      if (memberId.toString() !== req.user.id && memberId.toString() !== assignee?.toString()) {
        await notificationService.createNotification({
          type: "member_added",
          title: "Added to Task",
          message: `${req.user.name} added you to "${title}"`,
          user: memberId,
          sender: req.user.id,
          relatedCard: card._id,
          relatedBoard: board,
          departmentId: memberDeptId,
          projectId: board,
          taskId: card._id,
          metadata: {
            departmentId: memberDeptId,
            projectId: board,
            taskId: card._id,
            url: memberDeptId ? `/workflow/${memberDeptId}/${board}/${card._id}` : null
          }
        });
      }
    }
  }

  const populatedCard = creationId ? card.toObject() : await Card.findById(card._id)
    .populate('assignees', 'name email avatar')
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .lean();

  if (card.dueDate) {
    scheduleDueDateJobs(card).catch(console.error);
  }

  return populatedCard;
}

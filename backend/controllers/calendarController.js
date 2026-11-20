import { readCalendarTasks } from '../services/calendarTaskRead.js';
import { boardAccessFilter } from '../utils/boardAccess.js';
import { authorizeProjectResource } from '../services/projectAuthorization.js';
import Card from "../models/Card.js";
import List from "../models/List.js";
import Board from "../models/Board.js";
import Department from "../models/Department.js";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import notificationService from "../utils/notificationService.js";

/**
 * @desc    Get calendar tasks for a date range
 * @route   GET /api/calendar/tasks
 * @access  Private
 */
export const getCalendarTasks = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(200).json({success:true,data:await readCalendarTasks(req)});
});
/**
 * @desc    Create a task from calendar
 * @route   POST /api/calendar/tasks
 * @access  Private
 */
export const createTaskFromCalendar = asyncHandler(async (req, res) => {
  await authorizeProjectResource(req, 'project', req.body.projectId, 'task.create');
  const {
    title,
    description,
    startDate,
    dueDate,
    departmentId,
    projectId,
    listId,
    assignees,
    priority,
    labels
  } = req.body;

  const user = req.user;

  // Validation
  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      message: "Task title is required"
    });
  }

  if (!departmentId) {
    return res.status(400).json({
      success: false,
      message: "Department is required"
    });
  }

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: "Project is required"
    });
  }

  if (!listId) {
    return res.status(400).json({
      success: false,
      message: "Status/List is required"
    });
  }

  // Verify project exists and user has access
  const project = await Board.findById(projectId)
    .populate('department', '_id name');
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found"
    });
  }

  // Verify list belongs to project
  const list = await List.findOne({ _id: listId, board: projectId });
  if (!list) {
    return res.status(404).json({
      success: false,
      message: "Status/List not found in this project"
    });
  }

  // Get position for new card (add at end)
  const maxPositionCard = await Card.findOne({ list: listId })
    .sort({ position: -1 })
    .select('position');
  const position = maxPositionCard ? maxPositionCard.position + 1 : 0;

  // Create the card
  const card = await Card.create({
    title: title.trim(),
    description: description?.trim() || '',
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    list: listId,
    board: projectId,
    position,
    assignees: assignees || [],
    priority: priority || null,
    labels: labels || [],
    status: list.title,
    createdBy: user._id,
    createdFrom: 'calendar'
  });

  // Populate for response
  const populatedCard = await Card.findById(card._id)
    .populate('assignees', 'name email avatar')
    .populate('labels', 'name color')
    .populate('list', 'title color')
    .populate('board', 'name department')
    .populate('createdBy', 'name email avatar');

  // Send notifications to assignees
  if (assignees && assignees.length > 0) {
    for (const assigneeId of assignees) {
      if (assigneeId.toString() !== user._id.toString()) {
        await notificationService.notifyTaskAssigned(
          { ...card.toObject(), board: projectId },
          assigneeId,
          user._id
        );
      }
    }
  }

  res.status(201).json({
    success: true,
    data: populatedCard,
    message: "Task created successfully from calendar"
  });
});

/**
 * @desc    Update task dates from calendar (drag & drop or date editing)
 * @route   PATCH /api/calendar/tasks/:id/dates
 * @access  Private
 */
export const updateTaskDates = asyncHandler(async (req, res) => {
  await authorizeProjectResource(req, 'task', req.params.id, 'task.edit_dates');
  const { id } = req.params;
  const { startDate, dueDate } = req.body;
  const user = req.user;

  const card = await Card.findById(id)
    .populate('assignees', '_id name')
    .populate('board', 'name');

  if (!card) {
    return res.status(404).json({
      success: false,
      message: "Task not found"
    });
  }

  // Store old dates for notification
  const oldStartDate = card.startDate;
  const oldDueDate = card.dueDate;

  // Update dates
  const updates = {};
  if (startDate !== undefined) {
    updates.startDate = startDate ? new Date(startDate) : null;
  }
  if (dueDate !== undefined) {
    updates.dueDate = dueDate ? new Date(dueDate) : null;
  }

  const updatedCard = await Card.findByIdAndUpdate(
    id,
    { $set: updates },
    { returnDocument: 'after' }
  )
    .populate('assignees', 'name email avatar')
    .populate('labels', 'name color')
    .populate('list', 'title color')
    .populate('board', 'name department')
    .populate('createdBy', 'name email avatar');

  // Send notifications about date change
  const changes = {};
  if (startDate !== undefined && String(oldStartDate) !== String(updates.startDate)) {
    changes.startDate = updates.startDate;
  }
  if (dueDate !== undefined && String(oldDueDate) !== String(updates.dueDate)) {
    changes.dueDate = updates.dueDate;
  }

  if (Object.keys(changes).length > 0) {
    // Build custom message
    let message = `Task "${card.title}" dates updated`;
    if (changes.dueDate) {
      message = `Due date for "${card.title}" changed to ${new Date(changes.dueDate).toLocaleDateString()}`;
    } else if (changes.startDate) {
      message = `Start date for "${card.title}" changed to ${new Date(changes.startDate).toLocaleDateString()}`;
    }

    await notificationService.notifyTaskUpdated(
      { ...card.toObject(), board: card.board._id },
      user._id,
      {
        ...changes,
        message,
        changedFields: Object.keys(changes)
      }
    );
  }

  res.status(200).json({
    success: true,
    data: updatedCard,
    message: "Task dates updated successfully"
  });
});

/**
 * @desc    Get projects for department (for calendar task creation dropdown)
 * @route   GET /api/calendar/projects/:departmentId
 * @access  Private
 */
export const getProjectsForDepartment = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  // Build query based on departmentId
  let query = { isArchived: false };
  
  // Only filter by department if it's a valid ObjectId (not "all" or other strings)
  if (departmentId && departmentId !== 'all' && mongoose.Types.ObjectId.isValid(departmentId)) {
    query.department = departmentId;
  }
  // If departmentId is 'all' or invalid, return all non-archived projects

  const projects = await Board.find({ $and: [query, await boardAccessFilter(req.user)] })
    .select('_id name status priority department')
    .populate('department', 'name')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: projects
  });
});

/**
 * @desc    Get lists/statuses for a project (for calendar task creation dropdown)
 * @route   GET /api/calendar/lists/:projectId
 * @access  Private
 */
export const getListsForProject = asyncHandler(async (req, res) => {
  await authorizeProjectResource(req, 'project', req.params.projectId, 'task.view');
  const { projectId } = req.params;

  const lists = await List.find({
    board: projectId,
    isArchived: false
  })
    .select('_id title color position')
    .sort({ position: 1 });

  res.status(200).json({
    success: true,
    data: lists
  });
});

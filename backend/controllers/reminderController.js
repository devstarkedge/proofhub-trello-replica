import Reminder from '../models/Reminder.js';
import Board from '../models/Board.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitNotification } from '../server.js';
import { sendReminderNotificationInBackground, checkAndTagAwaitingResponse } from '../utils/reminderScheduler.js';

// @desc    Create a new reminder
// @route   POST /api/reminders
// @access  Private (Admin/Manager only)
export const createReminder = asyncHandler(async (req, res) => {
  const {
    projectId,
    scheduledDate,
    frequency,
    customIntervalDays,
    notes,
    priority,
    tags
  } = req.body;

  // Validate project exists and is completed
  const project = await Board.findById(projectId)
    .populate('clientDetails')
    .populate('department');
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Get client details from project
  const clientDetails = project.clientDetails || {};

  const reminder = await Reminder.create({
    project: projectId,
    client: {
      name: clientDetails.clientName || '',
      email: clientDetails.clientEmail || '',
      phone: clientDetails.clientWhatsappNumber || ''
    },
    scheduledDate: new Date(scheduledDate),
    frequency: frequency || 'one-time',
    customIntervalDays: frequency === 'custom' ? customIntervalDays : undefined,
    notes,
    priority: priority || 'medium',
    tags: tags || [],
    createdBy: req.user._id,
    department: project.department?._id || project.department
  });

  // Add history entry
  reminder.addHistoryEntry('created', req.user._id, 'Reminder created');
  await reminder.save();

  // Populate for response
  const populatedReminder = await Reminder.findById(reminder._id)
    .populate('project', 'name status clientDetails')
    .populate('createdBy', 'name avatar email')
    .populate('department', 'name');

  res.status(201).json({
    success: true,
    data: populatedReminder
  });
});

// @desc    Get all reminders for a project
// @route   GET /api/reminders/project/:projectId
// @access  Private (Admin/Manager only)
export const getProjectReminders = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { status, page = 1, limit = 20 } = req.query;

  const query = { project: projectId };
  if (status) query.status = status;

  const reminders = await Reminder.find(query)
    .populate('createdBy', 'name avatar')
    .populate('completedBy', 'name avatar')
    .sort({ scheduledDate: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  const total = await Reminder.countDocuments(query);

  res.json({
    success: true,
    data: reminders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get reminder by ID
// @route   GET /api/reminders/:id
// @access  Private (Admin/Manager only)
export const getReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findById(req.params.id)
    .populate('project', 'name status clientDetails')
    .populate('createdBy', 'name avatar email')
    .populate('completedBy', 'name avatar')
    .populate('history.performedBy', 'name avatar');

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  res.json({
    success: true,
    data: reminder
  });
});

// @desc    Update reminder
// @route   PUT /api/reminders/:id
// @access  Private (Admin/Manager only)
export const updateReminder = asyncHandler(async (req, res) => {
  const {
    scheduledDate,
    frequency,
    customIntervalDays,
    notes,
    priority,
    tags,
    status
  } = req.body;

  const reminder = await Reminder.findById(req.params.id);

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  // Check if rescheduling
  const isRescheduling = scheduledDate && 
    new Date(scheduledDate).getTime() !== new Date(reminder.scheduledDate).getTime();

  if (scheduledDate) reminder.scheduledDate = new Date(scheduledDate);
  if (frequency) reminder.frequency = frequency;
  if (frequency === 'custom' && customIntervalDays) {
    reminder.customIntervalDays = customIntervalDays;
  }
  if (notes !== undefined) reminder.notes = notes;
  if (priority) reminder.priority = priority;
  if (tags) reminder.tags = tags;
  if (status) reminder.status = status;

  if (isRescheduling) {
    reminder.addHistoryEntry('rescheduled', req.user._id, `Rescheduled to ${new Date(scheduledDate).toLocaleDateString()}`);
  }

  await reminder.save();

  const updatedReminder = await Reminder.findById(reminder._id)
    .populate('project', 'name status clientDetails')
    .populate('createdBy', 'name avatar email')
    .populate('completedBy', 'name avatar');

  res.json({
    success: true,
    data: updatedReminder
  });
});

// @desc    Mark reminder as completed
// @route   POST /api/reminders/:id/complete
// @access  Private (Admin/Manager only)
export const completeReminder = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const reminder = await Reminder.findById(req.params.id);

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  reminder.markCompleted(req.user._id, notes || 'Marked as completed');
  await reminder.save();

  const updatedReminder = await Reminder.findById(reminder._id)
    .populate('project', 'name status')
    .populate('createdBy', 'name avatar')
    .populate('completedBy', 'name avatar');

  res.json({
    success: true,
    data: updatedReminder,
    message: 'Reminder marked as completed'
  });
});

// @desc    Delete reminder
// @route   DELETE /api/reminders/:id
// @access  Private (Admin/Manager only)
export const deleteReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findById(req.params.id);

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  await reminder.deleteOne();

  res.json({
    success: true,
    message: 'Reminder deleted successfully'
  });
});

// @desc    Get reminder dashboard stats
// @route   GET /api/reminders/dashboard/stats
// @access  Private (Admin/Manager only)
export const getDashboardStats = asyncHandler(async (req, res) => {
  const { department, project, manager, startDate, endDate } = req.query;

  const filters = {};
  if (department) filters.department = department;
  if (project) filters.project = project;
  if (manager) filters.createdBy = manager;

  const stats = await Reminder.getDashboardStats(filters);

  // Get recent activity
  const recentReminders = await Reminder.find(filters)
    .populate('project', 'name')
    .populate('createdBy', 'name avatar')
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  res.json({
    success: true,
    data: {
      stats,
      recentReminders
    }
  });
});

// @desc    Get reminders for calendar view
// @route   GET /api/reminders/calendar
// @access  Private (Admin/Manager only)
export const getCalendarReminders = asyncHandler(async (req, res) => {
  const { startDate, endDate, department, project } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: 'Start date and end date are required'
    });
  }

  const filters = {};
  if (department) filters.department = department;
  if (project) filters.project = project;

  const reminders = await Reminder.getCalendarReminders(
    new Date(startDate),
    new Date(endDate),
    filters
  );

  // Group by date for calendar display
  const groupedByDate = reminders.reduce((acc, reminder) => {
    const dateKey = new Date(reminder.scheduledDate).toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(reminder);
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      reminders,
      groupedByDate
    }
  });
});

// @desc    Get all reminders with filters (for dashboard)
// @route   GET /api/reminders
// @access  Private (Admin/Manager only)
export const getAllReminders = asyncHandler(async (req, res) => {
  const { 
    status, 
    department, 
    project, 
    client, 
    manager,
    startDate,
    endDate,
    page = 1, 
    limit = 20,
    sortBy = 'scheduledDate',
    sortOrder = 'asc'
  } = req.query;

  const query = {};
  
  if (status) query.status = status;
  if (department) query.department = department;
  if (project) query.project = project;
  if (client) query['client.name'] = { $regex: client, $options: 'i' };
  if (manager) query.createdBy = manager;
  
  if (startDate || endDate) {
    query.scheduledDate = {};
    if (startDate) query.scheduledDate.$gte = new Date(startDate);
    if (endDate) query.scheduledDate.$lte = new Date(endDate);
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const reminders = await Reminder.find(query)
    .populate('project', 'name status clientDetails')
    .populate('createdBy', 'name avatar')
    .populate('department', 'name')
    .sort(sortOptions)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  const total = await Reminder.countDocuments(query);

  res.json({
    success: true,
    data: reminders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Send reminder now (manual trigger)
// @route   POST /api/reminders/:id/send
// @access  Private (Admin/Manager only)
export const sendReminderNow = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findById(req.params.id)
    .populate('project', 'name clientDetails')
    .populate('createdBy', 'name email');

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  // Trigger notification sending in background
  sendReminderNotificationInBackground(reminder, req.user._id);

  // Update reminder status
  reminder.markSent(true, true);
  await reminder.save();

  // Check if awaiting response tag should be applied
  if (reminder.reminderCount >= reminder.maxReminders) {
    await checkAndTagAwaitingResponse(reminder);
  }

  res.json({
    success: true,
    message: 'Reminder sent successfully',
    data: reminder
  });
});

// @desc    Get reminder stats for a specific project
// @route   GET /api/reminders/project/:projectId/stats
// @access  Private (Admin/Manager only)
export const getProjectReminderStats = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  const stats = await Reminder.getDashboardStats({ project: projectId });
  
  const nextReminder = await Reminder.findOne({
    project: projectId,
    status: 'pending',
    scheduledDate: { $gte: new Date() }
  })
  .sort({ scheduledDate: 1 })
  .select('scheduledDate status')
  .lean();

  res.json({
    success: true,
    data: {
      ...stats,
      nextReminder
    }
  });
});

// @desc    Cancel reminder
// @route   POST /api/reminders/:id/cancel
// @access  Private (Admin/Manager only)
export const cancelReminder = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const reminder = await Reminder.findById(req.params.id);

  if (!reminder) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }

  reminder.status = 'cancelled';
  reminder.addHistoryEntry('cancelled', req.user._id, reason || 'Reminder cancelled');
  await reminder.save();

  res.json({
    success: true,
    message: 'Reminder cancelled successfully',
    data: reminder
  });
});

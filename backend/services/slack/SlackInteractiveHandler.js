/**
 * Slack Interactive Handler
 * Handles all interactive components: buttons, modals, select menus
 */

import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackUser from '../../models/SlackUser.js';
import SlackNotification from '../../models/SlackNotification.js';
import SlackApiClient from './SlackApiClient.js';
import SlackBlockKitBuilder from './SlackBlockKitBuilder.js';
import slackNotificationService from './SlackNotificationService.js';
import { queueAppHomeUpdate } from './SlackNotificationQueue.js';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import Comment from '../../models/Comment.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import List from '../../models/List.js';
import { emitToBoard } from '../../server.js';

const blockBuilder = new SlackBlockKitBuilder(process.env.FRONTEND_URL);

class SlackInteractiveHandler {
  constructor() {
    // Action handlers map
    this.actionHandlers = {
      // Task actions
      'mark_complete': this.handleMarkComplete.bind(this),
      'start_task': this.handleStartTask.bind(this),
      'accept_task': this.handleAcceptTask.bind(this),
      'acknowledge': this.handleAcknowledge.bind(this),
      'extend_deadline': this.handleExtendDeadline.bind(this),
      'reply_comment': this.handleReplyComment.bind(this),
      'view_task': this.handleViewTask.bind(this),
      
      // Status changes
      'change_status': this.handleStatusSelect.bind(this),
      'status_select': this.handleStatusSelect.bind(this),
      
      // App Home actions
      'complete_task': this.handleMarkComplete.bind(this),
      'open_preferences': this.handleOpenPreferences.bind(this),
      'refresh_home': this.handleRefreshHome.bind(this),
      'create_task_modal': this.handleCreateTaskModal.bind(this),
      'select_department': this.handleDepartmentSelect.bind(this),
      'select_project': this.handleProjectSelect.bind(this),
      
      // Digest actions
      'mark_all_read': this.handleMarkAllRead.bind(this),
      'digest_settings': this.handleDigestSettings.bind(this),
      
      // Announcement actions
      'acknowledge_announcement': this.handleAcknowledgeAnnouncement.bind(this),
      'mark_announcement_read': this.handleMarkAnnouncementRead.bind(this)
    };

    // Modal submission handlers
    this.modalHandlers = {
      'create_task_modal': this.handleCreateTaskSubmission.bind(this),
      'update_status_modal': this.handleStatusUpdateSubmission.bind(this),
      'reply_comment_modal': this.handleReplyCommentSubmission.bind(this),
      'extend_deadline_modal': this.handleExtendDeadlineSubmission.bind(this),
      'preferences_modal': this.handlePreferencesSubmission.bind(this)
    };
  }

  /**
   * Main handler for block actions
   */
  async handleBlockAction(payload) {
    const { actions, user, trigger_id, response_url, team, container } = payload;
    
    // Get workspace and Slack user
    const workspace = await SlackWorkspace.findByTeamId(team.id);
    if (!workspace || !workspace.settings.interactiveActionsEnabled) {
      return this.errorResponse('Interactive actions are disabled for this workspace.');
    }

    const slackUser = await SlackUser.findBySlackUserId(user.id, workspace._id);
    if (!slackUser) {
      return this.errorResponse('Please connect your FlowTask account first.');
    }

    // Process each action
    const results = [];
    for (const action of actions) {
      const actionId = action.action_id.split('_')[0] + '_' + action.action_id.split('_')[1];
      const handler = this.findHandler(action.action_id);
      
      if (handler) {
        try {
          const result = await handler({
            action,
            user: slackUser,
            workspace,
            triggerId: trigger_id,
            responseUrl: response_url,
            container
          });
          results.push(result);

          // Record interaction
          await this.recordInteraction(workspace, slackUser, action, container?.message_ts);
        } catch (error) {
          console.error('Action handler error:', error);
          results.push({ error: error.message });
        }
      } else {
        console.log('No handler for action:', action.action_id);
      }
    }

    // Trigger App Home update
    await queueAppHomeUpdate(slackUser._id, workspace._id);

    return results.length === 1 ? results[0] : results;
  }

  /**
   * Handler for modal submissions
   */
  async handleViewSubmission(payload) {
    const { view, user, team } = payload;
    
    const workspace = await SlackWorkspace.findByTeamId(team.id);
    if (!workspace) {
      return { response_action: 'errors', errors: { general: 'Workspace not found' } };
    }

    const slackUser = await SlackUser.findBySlackUserId(user.id, workspace._id);
    if (!slackUser) {
      return { response_action: 'errors', errors: { general: 'Please connect your account' } };
    }

    const handler = this.modalHandlers[view.callback_id];
    if (handler) {
      return handler({ view, user: slackUser, workspace });
    }

    return { response_action: 'clear' };
  }

  /**
   * Handler for view closed events
   */
  async handleViewClosed(payload) {
    // Clean up any temporary data if needed
    return { ok: true };
  }

  /**
   * Handler for shortcuts and message actions
   * This is called when user triggers a global shortcut or message shortcut from Slack
   */
  async handleShortcut(payload) {
    const { callback_id, trigger_id, user, team, type, message } = payload;
    
    // Get workspace
    const workspace = await SlackWorkspace.findByTeamId(team.id);
    if (!workspace || !workspace.isActive) {
      return { ok: false, error: 'Workspace not connected' };
    }

    if (!workspace.settings.interactiveActionsEnabled) {
      return { ok: false, error: 'Interactive actions disabled' };
    }

    // Get Slack user
    const slackUser = await SlackUser.findBySlackUserId(user.id, workspace._id);
    if (!slackUser) {
      // User not linked - open a modal to tell them to link their account
      try {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.openModal(trigger_id, {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: '🔗 Account Required',
            emoji: true
          },
          close: {
            type: 'plain_text',
            text: 'Close'
          },
          blocks: [
            blockBuilder.section('*Please connect your FlowTask account first*'),
            blockBuilder.divider(),
            blockBuilder.section(
              'To use FlowTask shortcuts, you need to link your Slack account with your FlowTask account.\n\n' +
              '1. Go to FlowTask Settings → Integrations → Slack\n' +
              '2. Click "Connect Slack Account"\n' +
              '3. Authorize the connection'
            ),
            blockBuilder.divider(),
            blockBuilder.actions('link_account_actions', [
              blockBuilder.linkButton('🔗 Open FlowTask Settings', `${process.env.FRONTEND_URL}/settings`, 'open_settings')
            ])
          ]
        });
        return { ok: true };
      } catch (error) {
        console.error('Error showing account link modal:', error);
        return { ok: false, error: 'Failed to show account link modal' };
      }
    }

    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);

      // Handle different shortcut callbacks
      switch (callback_id) {
        case 'create_task':
        case 'flowtask_create_task':
        case 'quick_task':
          // Open task creation modal
          await slackClient.openModal(trigger_id, blockBuilder.buildTaskCreationModal({}));
          return { ok: true };

        case 'my_tasks':
        case 'flowtask_my_tasks':
        case 'view_tasks':
          // Open a modal showing user's tasks
          await this.openMyTasksModal(slackClient, trigger_id, slackUser);
          return { ok: true };

        case 'create_task_from_message':
        case 'flowtask_message_task':
          // Message action - create task from message content
          if (type === 'message_action' && message) {
            await slackClient.openModal(trigger_id, blockBuilder.buildTaskCreationModal({
              prefilledTitle: '',
              prefilledDescription: message.text || ''
            }));
          } else {
            await slackClient.openModal(trigger_id, blockBuilder.buildTaskCreationModal({}));
          }
          return { ok: true };

        default:
          // Default: open task creation modal for unknown shortcuts
          console.log('Unknown shortcut callback_id:', callback_id);
          await slackClient.openModal(trigger_id, blockBuilder.buildTaskCreationModal({}));
          return { ok: true };
      }
    } catch (error) {
      console.error('Error handling shortcut:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Open a modal showing user's tasks
   */
  async openMyTasksModal(slackClient, triggerId, slackUser) {
    // Fetch user's tasks
    const tasks = await Card.find({
      assignees: slackUser.user,
      isArchived: false,
      status: { $ne: 'completed' }
    })
      .populate('board', 'name')
      .sort({ priority: -1, dueDate: 1 })
      .limit(10)
      .lean();

    const blocks = [];
    
    if (tasks.length === 0) {
      blocks.push(blockBuilder.section('🎉 *You have no pending tasks!*'));
      blocks.push(blockBuilder.context(['You\'re all caught up. Great job!']));
    } else {
      blocks.push(blockBuilder.section(`📋 *Your Tasks (${tasks.length})*`));
      blocks.push(blockBuilder.divider());

      for (const task of tasks) {
        const priorityEmoji = {
          'critical': '🔴',
          'high': '🟠',
          'medium': '🟡',
          'low': '🟢'
        }[task.priority] || '⚪';

        const dueInfo = task.dueDate 
          ? `\n📅 Due: ${blockBuilder.formatDate(task.dueDate, '{date_short}')}` 
          : '';

        blocks.push(blockBuilder.section(
          `${priorityEmoji} *${task.title}*\n📁 ${task.board?.name || 'Unknown Project'}${dueInfo}`
        ));
      }

      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.actions('view_all_tasks', [
        blockBuilder.linkButton('📋 View All Tasks', `${process.env.FRONTEND_URL}/my-shortcuts`, 'view_all')
      ]));
    }

    await slackClient.openModal(triggerId, {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: '📋 My Tasks',
        emoji: true
      },
      close: {
        type: 'plain_text',
        text: 'Close'
      },
      blocks
    });
  }

  /**
   * Find appropriate handler for action ID
   */
  findHandler(actionId) {
    // Try exact match first
    if (this.actionHandlers[actionId]) {
      return this.actionHandlers[actionId];
    }

    // Try prefix match (e.g., "mark_complete_123" -> "mark_complete")
    for (const [key, handler] of Object.entries(this.actionHandlers)) {
      if (actionId.startsWith(key)) {
        return handler;
      }
    }

    // Check for status select (change_status_<taskId> or status_<taskId>)
    if (actionId.startsWith('change_status_') || actionId.startsWith('status_')) {
      return this.handleStatusSelect.bind(this);
    }

    // Check for task menu
    if (actionId.startsWith('task_menu_')) {
      return this.handleTaskMenu.bind(this);
    }

    console.log('No handler found for actionId:', actionId);
    return null;
  }

  // ==================== Action Handlers ====================

  /**
   * Handle mark task complete
   */
  async handleMarkComplete({ action, user, workspace, responseUrl }) {
    try {
      const taskValue = this.parseActionValue(action.value);
      const taskId = taskValue.taskId || taskValue;

      // Get task and update
      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      // Update task status
      task.status = 'completed';
      task.completedAt = new Date();
      await task.save();

      console.log(`Task ${taskId} marked complete by ${user.slackUserId}`);

      // Emit real-time update to FlowTask frontend
      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: 'completed', completedAt: task.completedAt }
      });

      // Refresh App Home to show updated tasks
      await queueAppHomeUpdate(user._id, workspace._id);

      return { success: true, message: 'Task marked as complete' };
    } catch (error) {
      console.error('Error marking task complete:', error);
      return this.errorResponse('Failed to mark task as complete');
    }
  }

  /**
   * Handle start working on task
   */
  async handleStartTask({ action, user, workspace, responseUrl }) {
    try {
      console.log('[Slack] handleStartTask called with action:', action);
      
      const taskValue = this.parseActionValue(action.value);
      console.log('[Slack] Parsed taskValue:', taskValue);
      
      const taskId = taskValue?.taskId || taskValue;
      const boardId = taskValue?.boardId;

      if (!taskId) {
        console.error('[Slack] No taskId found in action value');
        return this.errorResponse('Task ID not found');
      }

      const task = await Card.findById(taskId).populate('board list');
      if (!task) {
        console.error('[Slack] Task not found:', taskId);
        return this.errorResponse('Task not found');
      }

      // Check if already in progress
      const currentStatus = (task.status || '').toLowerCase().replace(/[\s-_]/g, '');
      if (currentStatus === 'inprogress') {
        console.log('[Slack] Task already in progress');
        if (responseUrl) {
          const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
          await slackClient.respondToInteraction(responseUrl, {
            replace_original: false,
            response_type: 'ephemeral',
            text: '⚠️ This task is already in progress.'
          });
        }
        return { success: true, message: 'Task already in progress' };
      }

      // Find the "In Progress" list for this board (handles various title variations)
      const inProgressList = await List.findOne({
        board: task.board._id || task.board,
        title: { $regex: /in[\s\-_]*progress|doing|active|wip|working/i }
      });

      // Update task status
      task.status = 'in-progress';
      
      // Also update list if found
      if (inProgressList) {
        task.list = inProgressList._id;
        console.log(`[Slack] Moving task to list: ${inProgressList.title}`);
      }
      
      await task.save();

      console.log(`[Slack] Task ${taskId} started by ${user.slackUserId}`);

      // Emit real-time update to FlowTask frontend
      emitToBoard((task.board._id || task.board).toString(), 'card-updated', {
        cardId: task._id,
        updates: { 
          status: 'in-progress',
          list: inProgressList?._id
        }
      });

      // Refresh App Home
      await queueAppHomeUpdate(user._id, workspace._id);

      // Send feedback to user via Slack
      if (responseUrl) {
        try {
          const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
          await slackClient.respondToInteraction(responseUrl, {
            replace_original: false,
            response_type: 'ephemeral',
            text: `✅ You've started working on "${task.title}". Status updated to In Progress!`
          });
        } catch (respError) {
          console.error('[Slack] Error sending response:', respError);
        }
      }

      return { success: true, message: 'Task started' };
    } catch (error) {
      console.error('[Slack] Error starting task:', error);
      return this.errorResponse('Failed to start task: ' + error.message);
    }
  }

  /**
   * Handle accept task assignment
   */
  async handleAcceptTask({ action, user, workspace, responseUrl }) {
    try {
      const taskValue = this.parseActionValue(action.value);
      const taskId = taskValue.taskId || taskValue;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      // Add acknowledgment (could track acceptance in task)
      // For now, just send confirmation

      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: false,
          response_type: 'ephemeral',
          text: `👍 You've accepted the task "${task.title}". Good luck!`
        });
      }

      return { success: true, message: 'Task accepted' };
    } catch (error) {
      console.error('Error accepting task:', error);
      return this.errorResponse('Failed to accept task');
    }
  }

  /**
   * Handle acknowledge button
   */
  async handleAcknowledge({ action, user, workspace, responseUrl }) {
    if (responseUrl) {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.respondToInteraction(responseUrl, {
        replace_original: false,
        response_type: 'ephemeral',
        text: '👍 Acknowledged'
      });
    }
    return { success: true };
  }

  /**
   * Handle extend deadline - opens modal
   */
  async handleExtendDeadline({ action, user, workspace, triggerId }) {
    try {
      const taskValue = this.parseActionValue(action.value);
      const taskId = taskValue.taskId || taskValue;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      
      // Open modal for extending deadline
      await slackClient.openModal(triggerId, {
        type: 'modal',
        callback_id: 'extend_deadline_modal',
        private_metadata: JSON.stringify({ taskId: task._id }),
        title: {
          type: 'plain_text',
          text: '📅 Extend Deadline',
          emoji: true
        },
        submit: {
          type: 'plain_text',
          text: 'Update',
          emoji: true
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: [
          blockBuilder.section(`*Task:* ${task.title}`),
          blockBuilder.context([`Current deadline: ${task.dueDate ? blockBuilder.formatDate(task.dueDate) : 'Not set'}`]),
          blockBuilder.divider(),
          {
            type: 'input',
            block_id: 'new_due_date',
            element: {
              type: 'datepicker',
              action_id: 'date_picker',
              placeholder: {
                type: 'plain_text',
                text: 'Select new date'
              }
            },
            label: {
              type: 'plain_text',
              text: 'New Due Date',
              emoji: true
            }
          },
          {
            type: 'input',
            block_id: 'reason',
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'reason_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'Reason for extension (optional)'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Reason',
              emoji: true
            }
          }
        ]
      });

      return { success: true };
    } catch (error) {
      console.error('Error opening extend deadline modal:', error);
      return this.errorResponse('Failed to open deadline extension');
    }
  }

  /**
   * Handle reply to comment - opens modal
   */
  async handleReplyComment({ action, user, workspace, triggerId }) {
    try {
      const data = this.parseActionValue(action.value);
      const { taskId, commentId } = data;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      let comment = null;
      if (commentId) {
        comment = await Comment.findById(commentId);
      }

      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.openModal(triggerId, blockBuilder.buildCommentReplyModal(task, comment));

      return { success: true };
    } catch (error) {
      console.error('Error opening reply modal:', error);
      return this.errorResponse('Failed to open reply dialog');
    }
  }

  /**
   * Handle status select from dropdown
   */
  async handleStatusSelect({ action, user, workspace, responseUrl }) {
    try {
      // Parse taskId from action_id (format: change_status_<taskId> or status_<taskId>)
      const actionId = action.action_id;
      let taskId;
      if (actionId.startsWith('change_status_')) {
        taskId = actionId.replace('change_status_', '');
      } else if (actionId.startsWith('status_')) {
        taskId = actionId.replace('status_', '');
      } else {
        taskId = actionId;
      }
      
      const newStatus = action.selected_option.value;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      const oldStatus = task.status;
      task.status = newStatus;
      if (newStatus === 'completed') {
        task.completedAt = new Date();
      }
      await task.save();

      console.log(`Task ${taskId} status changed: ${oldStatus} → ${newStatus}`);

      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: newStatus }
      });

      // Refresh App Home to show updated status
      await queueAppHomeUpdate(user._id, workspace._id);

      return { success: true, message: `Status updated to ${newStatus}` };
    } catch (error) {
      console.error('Error updating status:', error);
      return this.errorResponse('Failed to update status');
    }
  }

  /**
   * Handle task overflow menu
   */
  async handleTaskMenu({ action, user, workspace, triggerId, responseUrl }) {
    const [menuAction, taskId] = action.selected_option.value.split('_');
    
    switch (menuAction) {
      case 'complete':
        return this.handleMarkComplete({ 
          action: { value: taskId }, 
          user, 
          workspace, 
          responseUrl 
        });
      case 'extend':
        return this.handleExtendDeadline({
          action: { value: taskId },
          user,
          workspace,
          triggerId
        });
      case 'view':
        // Just acknowledge - link button handles navigation
        return { success: true };
      default:
        return { success: false };
    }
  }

  /**
   * Handle view task (for link buttons, just acknowledge)
   */
  async handleViewTask({ action, user }) {
    // Link buttons handle navigation, just track the click
    return { success: true };
  }

  /**
   * Handle open preferences
   */
  async handleOpenPreferences({ action, user, workspace, triggerId }) {
    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      
      await slackClient.openModal(triggerId, {
        type: 'modal',
        callback_id: 'preferences_modal',
        title: {
          type: 'plain_text',
          text: '⚙️ Notification Preferences',
          emoji: true
        },
        submit: {
          type: 'plain_text',
          text: 'Save',
          emoji: true
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: [
          blockBuilder.section('*Configure your FlowTask notification preferences*'),
          blockBuilder.divider(),
          {
            type: 'input',
            block_id: 'notifications_enabled',
            element: {
              type: 'static_select',
              action_id: 'enabled_select',
              initial_option: {
                text: { type: 'plain_text', text: user.preferences.notificationsEnabled ? 'Enabled' : 'Disabled' },
                value: user.preferences.notificationsEnabled ? 'true' : 'false'
              },
              options: [
                { text: { type: 'plain_text', text: 'Enabled' }, value: 'true' },
                { text: { type: 'plain_text', text: 'Disabled' }, value: 'false' }
              ]
            },
            label: {
              type: 'plain_text',
              text: '🔔 Slack Notifications',
              emoji: true
            }
          },
          {
            type: 'input',
            block_id: 'quiet_hours',
            element: {
              type: 'static_select',
              action_id: 'quiet_select',
              initial_option: {
                text: { type: 'plain_text', text: user.preferences.quietHoursEnabled ? 'Enabled' : 'Disabled' },
                value: user.preferences.quietHoursEnabled ? 'true' : 'false'
              },
              options: [
                { text: { type: 'plain_text', text: 'Enabled' }, value: 'true' },
                { text: { type: 'plain_text', text: 'Disabled' }, value: 'false' }
              ]
            },
            label: {
              type: 'plain_text',
              text: '🌙 Quiet Hours',
              emoji: true
            }
          },
          {
            type: 'input',
            block_id: 'digest_frequency',
            element: {
              type: 'static_select',
              action_id: 'digest_select',
              initial_option: {
                text: { type: 'plain_text', text: user.preferences.digestFrequency || 'Never' },
                value: user.preferences.digestFrequency || 'never'
              },
              options: [
                { text: { type: 'plain_text', text: 'Never' }, value: 'never' },
                { text: { type: 'plain_text', text: 'Hourly' }, value: 'hourly' },
                { text: { type: 'plain_text', text: 'Daily' }, value: 'daily' },
                { text: { type: 'plain_text', text: 'Weekly' }, value: 'weekly' }
              ]
            },
            label: {
              type: 'plain_text',
              text: '📊 Digest Frequency',
              emoji: true
            }
          },
          {
            type: 'input',
            block_id: 'min_priority',
            element: {
              type: 'static_select',
              action_id: 'priority_select',
              initial_option: {
                text: { type: 'plain_text', text: user.preferences.minPriorityLevel || 'All' },
                value: user.preferences.minPriorityLevel || 'all'
              },
              options: [
                { text: { type: 'plain_text', text: 'All' }, value: 'all' },
                { text: { type: 'plain_text', text: 'Low and above' }, value: 'low' },
                { text: { type: 'plain_text', text: 'Medium and above' }, value: 'medium' },
                { text: { type: 'plain_text', text: 'High and above' }, value: 'high' },
                { text: { type: 'plain_text', text: 'Critical only' }, value: 'critical' }
              ]
            },
            label: {
              type: 'plain_text',
              text: '📌 Minimum Priority',
              emoji: true
            }
          }
        ]
      });

      return { success: true };
    } catch (error) {
      console.error('Error opening preferences modal:', error);
      return this.errorResponse('Failed to open preferences');
    }
  }

  /**
   * Handle refresh App Home - triggers immediate update
   */
  async handleRefreshHome({ action, user, workspace }) {
    try {
      console.log('Refreshing App Home for user:', user.slackUserId);
      
      // Queue immediate App Home update
      await queueAppHomeUpdate(user._id, workspace._id);
      
      return { success: true, message: 'App Home refreshed' };
    } catch (error) {
      console.error('Error refreshing App Home:', error);
      return this.errorResponse('Failed to refresh App Home');
    }
  }

  /**
   * Handle Create Task button - opens modal
   */
  /**
   * Handle Create Task button - opens modal with initial dependent fields
   */
  async handleCreateTaskModal({ action, user, workspace, triggerId }) {
    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      
      // Null-safety check for user data
      const userId = user?.user?._id || user?.user;
      if (!userId) {
        return this.errorResponse('User data not available. Please reconnect your account.');
      }

      // Get FlowTask user to check role
      const flowTaskUser = await User.findById(userId);
      const isAdmin = flowTaskUser?.role === 'admin';
      
      // Get departments based on role
      let query = { isActive: true };
      if (!isAdmin) {
        query.$or = [
          { manager: userId },
          { members: userId }
        ];
      }

      const departments = await Department.find(query)
        .select('name _id')
        .sort({ name: 1 })
        .lean();

      // Department options
      const departmentOptions = departments.map(dept => ({
        text: { 
          type: 'plain_text', 
          text: dept.name.substring(0, 75)
        },
        value: dept._id.toString()
      }));

      if (departmentOptions.length === 0) {
        await slackClient.openModal(triggerId, {
          type: 'modal',
          title: { type: 'plain_text', text: '❌ No Departments', emoji: true },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            blockBuilder.section('*No departments found.*\n\nYou need to be a member of at least one department to create tasks.'),
            blockBuilder.actions('no_dept_actions', [
              blockBuilder.linkButton('📁 Open FlowTask', `${process.env.FRONTEND_URL}/`, 'open_flowtask')
            ])
          ]
        });
        return { success: true };
      }

      // Initial Date - Start Date (Required, Today)
      const today = new Date().toISOString().split('T')[0];

      // Open create task modal with initial state
      await slackClient.openModal(triggerId, {
        type: 'modal',
        callback_id: 'create_task_modal',
        private_metadata: JSON.stringify({ userId: userId.toString() }),
        title: {
          type: 'plain_text',
          text: '➕ Create Task',
          emoji: true
        },
        submit: {
          type: 'plain_text',
          text: 'Create',
          emoji: true
        },
        close: {
          type: 'plain_text',
          text: 'Cancel'
        },
        blocks: [
          // Dates Section
          {
            type: 'input',
            block_id: 'task_dates',
            label: {
              type: 'plain_text',
              text: '📅 Dates',
              emoji: true
            },
            element: {
              type: 'datepicker',
              action_id: 'start_date',
              initial_date: today,
              placeholder: {
                type: 'plain_text',
                text: 'Start Date'
              }
            }
          },
          {
            type: 'input',
            block_id: 'task_due_date',
            optional: true,
            label: {
              type: 'plain_text',
              text: 'Due Date',
              emoji: true
            },
            element: {
              type: 'datepicker',
              action_id: 'due_date',
              placeholder: {
                type: 'plain_text',
                text: 'Select due date (optional)'
              }
            }
          },
          blockBuilder.divider(),
          
          // Department Selection (Step 1)
          {
            type: 'input',
            block_id: 'task_department',
            dispatch_action: true,
            label: {
              type: 'plain_text',
              text: '🏢 Department',
              emoji: true
            },
            element: {
              type: 'static_select',
              action_id: 'select_department',
              placeholder: {
                type: 'plain_text',
                text: 'Select Department'
              },
              options: departmentOptions
            }
          },
          
          // Context for next steps
          blockBuilder.context(['ℹ️ _Select a department to see available projects_'])
        ]
      });

      return { success: true };
    } catch (error) {
      console.error('Error opening create task modal:', error);
      return this.errorResponse('Failed to open create task modal');
    }
  }

  /**
   * Handle Department selection - updates modal with project dropdown
   */
  async handleDepartmentSelect({ action, user, workspace, triggerId, container, view }) {
    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      const deptId = action.selected_option.value;
      const meta = JSON.parse(view.private_metadata || '{}');
      const userId = meta.userId || user.user;
      
      // Get FlowTask user to check role
      const flowTaskUser = await User.findById(userId);
      const isAdmin = flowTaskUser?.role === 'admin';

      // Fetch projects for this department
      let query = {
        department: deptId,
        isArchived: { $ne: true }
      };

      if (!isAdmin) {
        query.$or = [
          { owner: userId },
          { members: userId }
        ];
      }

      const projects = await Board.find(query)
        .select('name _id')
        .sort({ name: 1 })
        .lean();

      // Project options
      const projectOptions = projects.map(proj => ({
        text: {
          type: 'plain_text',
          text: proj.name.substring(0, 75)
        },
        value: proj._id.toString()
      }));

      // Get values to preserve
      const startDate = view.state.values.task_dates.start_date.selected_date;
      const dueDate = view.state.values.task_due_date.due_date.selected_date;
      const deptOption = action.selected_option;

      // Build updated view
      const blocks = [
        // Dates (Preserved)
        {
          type: 'input',
          block_id: 'task_dates',
          label: { type: 'plain_text', text: '📅 Dates', emoji: true },
          element: {
            type: 'datepicker',
            action_id: 'start_date',
            initial_date: startDate,
            placeholder: { type: 'plain_text', text: 'Start Date' }
          }
        },
        {
          type: 'input',
          block_id: 'task_due_date',
          optional: true,
          label: { type: 'plain_text', text: 'Due Date', emoji: true },
          element: {
            type: 'datepicker',
            action_id: 'due_date',
            initial_date: dueDate,
            placeholder: { type: 'plain_text', text: 'Select due date (optional)' }
          }
        },
        blockBuilder.divider(),
        
        // Department (Preserved)
        {
          type: 'input',
          block_id: 'task_department',
          dispatch_action: true,
          label: { type: 'plain_text', text: '🏢 Department', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'select_department',
            initial_option: deptOption,
            placeholder: { type: 'plain_text', text: 'Select Department' },
            options: view.blocks.find(b => b.block_id === 'task_department').element.options
          }
        }
      ];

      // Add Project Dropdown or No Projects Message
      if (projectOptions.length > 0) {
        blocks.push({
          type: 'input',
          block_id: 'task_project',
          dispatch_action: true,
          label: { type: 'plain_text', text: '📁 Project', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'select_project',
            placeholder: { type: 'plain_text', text: 'Select Project' },
            options: projectOptions
          }
        });
        blocks.push(blockBuilder.context(['ℹ️ _Select a project to continue_']));
      } else {
        blocks.push(blockBuilder.section('⚠️ *No projects found in this department.*'));
      }

      await slackClient.updateModal(view.id, {
        type: 'modal',
        callback_id: 'create_task_modal',
        private_metadata: view.private_metadata,
        title: view.title,
        submit: { type: 'plain_text', text: 'Create', emoji: true },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks
      });

      return { success: true };
    } catch (error) {
      console.error('Error handling department select:', error);
      return this.errorResponse('Failed to update modal');
    }
  }

  /**
   * Handle Project selection - updates modal with task details fields
   */
  async handleProjectSelect({ action, user, workspace, triggerId, container, view }) {
    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      const projectId = action.selected_option.value;
      
      // Fetch lists for this project
      const lists = await List.find({ 
        board: projectId,
        isArchived: false 
      }).sort({ position: 1 }).lean();

      // Status options
      let statusOptions = [];
      if (lists.length > 0) {
        statusOptions = lists.map(list => ({
          text: { type: 'plain_text', text: list.title.substring(0, 75) },
          value: list._id.toString()
        }));
      } else {
        // Fallback default statuses if no lists found
        statusOptions = [
          { text: { type: 'plain_text', text: '📋 To Do' }, value: 'todo' },
          { text: { type: 'plain_text', text: '🔄 In Progress' }, value: 'in-progress' }
        ];
      }

      // Get preserved values
      const startDate = view.state.values.task_dates.start_date.selected_date;
      const dueDate = view.state.values.task_due_date.due_date.selected_date;
      const deptOption = view.state.values.task_department.select_department.selected_option;
      const projectOption = action.selected_option;
      
      // Reconstitute Department options from previous view to prevent losing them
      const deptBlock = view.blocks.find(b => b.block_id === 'task_department');
      const deptOptions = deptBlock ? deptBlock.element.options : [deptOption];
      
       // Reconstitute Project options
      const projectBlock = view.blocks.find(b => b.block_id === 'task_project');
      const projOptions = projectBlock ? projectBlock.element.options : [projectOption];

      const blocks = [
        // Dates (Preserved)
        {
          type: 'input',
          block_id: 'task_dates',
          label: { type: 'plain_text', text: '📅 Dates', emoji: true },
          element: {
            type: 'datepicker',
            action_id: 'start_date',
            initial_date: startDate,
            placeholder: { type: 'plain_text', text: 'Start Date' }
          }
        },
        {
          type: 'input',
          block_id: 'task_due_date',
          optional: true,
          label: { type: 'plain_text', text: 'Due Date', emoji: true },
          element: {
            type: 'datepicker',
            action_id: 'due_date',
            initial_date: dueDate,
            placeholder: { type: 'plain_text', text: 'Select due date (optional)' }
          }
        },
        blockBuilder.divider(),
        
        // Department (Preserved)
        {
          type: 'input',
          block_id: 'task_department',
          dispatch_action: true,
          label: { type: 'plain_text', text: '🏢 Department', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'select_department',
            initial_option: deptOption,
            placeholder: { type: 'plain_text', text: 'Select Department' },
            options: deptOptions
          }
        },
        
        // Project (Preserved)
        {
          type: 'input',
          block_id: 'task_project',
          dispatch_action: true,
          label: { type: 'plain_text', text: '📁 Project', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'select_project',
            initial_option: projectOption,
            placeholder: { type: 'plain_text', text: 'Select Project' },
            options: projOptions
          }
        },

        // Status/List Selection (New)
        {
          type: 'input',
          block_id: 'task_status',
          label: { type: 'plain_text', text: '📊 Status / List', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'select_status',
            initial_option: statusOptions[0],
            placeholder: { type: 'plain_text', text: 'Select Status' },
            options: statusOptions
          }
        },
        
        blockBuilder.divider(),

        // Task Details (New)
        {
          type: 'input',
          block_id: 'task_title',
          label: { type: 'plain_text', text: '📝 Task Name', emoji: true },
          element: {
            type: 'plain_text_input',
            action_id: 'title_input',
            placeholder: { type: 'plain_text', text: 'Enter task name' }
          }
        },
        {
          type: 'input',
          block_id: 'task_description',
          optional: true,
          label: { type: 'plain_text', text: '📄 Description', emoji: true },
          element: {
            type: 'plain_text_input',
            action_id: 'description_input',
            multiline: true,
            placeholder: { type: 'plain_text', text: 'Add description (optional)' }
          }
        },

        // Priority (New)
        {
          type: 'input',
          block_id: 'task_priority',
          optional: true,
          label: { type: 'plain_text', text: '🎯 Priority', emoji: true },
          element: {
            type: 'static_select',
            action_id: 'priority_select',
            initial_option: { text: { type: 'plain_text', text: '🟡 Medium' }, value: 'medium' },
            options: [
              { text: { type: 'plain_text', text: '🔴 Critical' }, value: 'critical' },
              { text: { type: 'plain_text', text: '🟠 High' }, value: 'high' },
              { text: { type: 'plain_text', text: '🟡 Medium' }, value: 'medium' },
              { text: { type: 'plain_text', text: '🟢 Low' }, value: 'low' }
            ]
          }
        }
      ];

      await slackClient.updateModal(view.id, {
        type: 'modal',
        callback_id: 'create_task_modal',
        private_metadata: view.private_metadata,
        title: view.title,
        submit: { type: 'plain_text', text: 'Create', emoji: true },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks
      });

      return { success: true };
    } catch (error) {
      console.error('Error handling project select:', error);
      return this.errorResponse('Failed to update modal');
    }
  }

  /**
   * Handle mark all read
   */
  async handleMarkAllRead({ action, user, workspace, responseUrl }) {
    if (responseUrl) {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.respondToInteraction(responseUrl, {
        replace_original: false,
        response_type: 'ephemeral',
        text: '✅ All notifications marked as read'
      });
    }
    return { success: true };
  }

  /**
   * Handle digest settings
   */
  async handleDigestSettings({ action, user, workspace, triggerId }) {
    return this.handleOpenPreferences({ action, user, workspace, triggerId });
  }

  /**
   * Handle acknowledge announcement - saves to database and emits real-time update
   */
  async handleAcknowledgeAnnouncement({ action, user, workspace, responseUrl }) {
    try {
      const value = this.parseActionValue(action.value);
      const announcementId = value.announcementId;

      if (!announcementId) {
        return this.errorResponse('Invalid announcement');
      }

      // Import Announcement model dynamically to avoid circular deps
      const Announcement = (await import('../../models/Announcement.js')).default;
      const announcement = await Announcement.findById(announcementId);

      if (!announcement) {
        if (responseUrl) {
          const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
          await slackClient.respondToInteraction(responseUrl, {
            replace_original: false,
            response_type: 'ephemeral',
            text: '❌ Announcement not found'
          });
        }
        return { success: false, message: 'Announcement not found' };
      }

      // Get FlowTask user ID
      const flowTaskUserId = user.flowTaskUserId || user.user;

      if (flowTaskUserId) {
        // Check if already acknowledged
        if (!announcement.acknowledgedBy) announcement.acknowledgedBy = [];
        const alreadyAcked = announcement.acknowledgedBy.some(
          a => a.userId && a.userId.toString() === flowTaskUserId.toString()
        );

        if (!alreadyAcked) {
          announcement.acknowledgedBy.push({
            userId: flowTaskUserId,
            acknowledgedAt: new Date()
          });
          await announcement.save();

          // Emit socket event for real-time UI update
          const { io } = await import('../../server.js');
          io.to(`user-${flowTaskUserId}`).emit('announcement-acknowledged', {
            announcementId: announcement._id,
            userId: flowTaskUserId
          });
        }
      }

      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: false,
          response_type: 'ephemeral',
          text: '✅ Announcement acknowledged!'
        });
      }

      return { success: true, message: 'Announcement acknowledged' };
    } catch (error) {
      console.error('Error acknowledging announcement:', error);
      return this.errorResponse('Failed to acknowledge announcement');
    }
  }

  /**
   * Handle mark announcement as read - saves to database and emits real-time update
   */
  async handleMarkAnnouncementRead({ action, user, workspace, responseUrl }) {
    try {
      const value = this.parseActionValue(action.value);
      const announcementId = value.announcementId;

      if (!announcementId) {
        return this.errorResponse('Invalid announcement');
      }

      // Import Announcement model dynamically
      const Announcement = (await import('../../models/Announcement.js')).default;
      const announcement = await Announcement.findById(announcementId);

      if (!announcement) {
        if (responseUrl) {
          const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
          await slackClient.respondToInteraction(responseUrl, {
            replace_original: false,
            response_type: 'ephemeral',
            text: '❌ Announcement not found'
          });
        }
        return { success: false, message: 'Announcement not found' };
      }

      // Get FlowTask user ID
      const flowTaskUserId = user.flowTaskUserId || user.user;

      if (flowTaskUserId) {
        // Check if already read
        const alreadyRead = announcement.readBy.some(
          r => r.userId && r.userId.toString() === flowTaskUserId.toString()
        );

        if (!alreadyRead) {
          announcement.readBy.push({
            userId: flowTaskUserId,
            readAt: new Date()
          });
          await announcement.save();

          // Emit socket event for real-time UI update
          const { io } = await import('../../server.js');
          io.to(`user-${flowTaskUserId}`).emit('announcement-read', {
            announcementId: announcement._id,
            userId: flowTaskUserId
          });
        }
      }

      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: false,
          response_type: 'ephemeral',
          text: '📖 Announcement marked as read!'
        });
      }

      return { success: true, message: 'Announcement marked as read' };
    } catch (error) {
      console.error('Error marking announcement as read:', error);
      return this.errorResponse('Failed to mark announcement as read');
    }
  }

  // ==================== Modal Submission Handlers ====================

  /**
   * Handle create task modal submission
   */
  async handleCreateTaskSubmission({ view, user, workspace }) {
    try {
      const values = view.state.values;
      
      const title = values.task_title?.title_input?.value;
      const description = values.task_description?.description_input?.value;
      const priority = values.task_priority?.priority_select?.selected_option?.value || 'medium';
      
      const startDate = values.task_dates?.start_date?.selected_date;
      const dueDate = values.task_due_date?.due_date?.selected_date;
      
      const boardId = values.task_project?.select_project?.selected_option?.value;
      const selectedStatus = values.task_status?.select_status?.selected_option?.value || 'todo';
      
      // Validation
      if (!title) {
        return { response_action: 'errors', errors: { task_title: 'Task title is required' } };
      }
      
      if (!boardId) {
        return { response_action: 'errors', errors: { task_project: 'Please select a project' } };
      }

      // Get board
      const board = await Board.findById(boardId).populate('department');
      if (!board) {
        return { response_action: 'errors', errors: { task_project: 'Project not found' } };
      }

      // Get lists for this board
      const lists = await List.find({ board: board._id }).sort({ position: 1 }).lean();
      
      // Determine target list
      let targetList;
      
      // If selectedStatus is a specific list ID (from our dynamic fetching), use it directly
      if (selectedStatus !== 'todo' && selectedStatus !== 'in-progress' && selectedStatus.match(/^[0-9a-fA-F]{24}$/)) {
        targetList = lists.find(l => l._id.toString() === selectedStatus);
      }
      
      // If not found or if generic status string, try to match by name
      if (!targetList) {
        const searchTerms = {
          'todo': ['to do', 'todo', 'backlog', 'new'],
          'in-progress': ['in progress', 'doing', 'working', 'active'],
          'in-review': ['in review', 'review', 'testing', 'qa']
        }[selectedStatus] || [];
        
        targetList = lists.find(list => 
          searchTerms.some(term => list.name?.toLowerCase().includes(term))
        );
      }
      
      // Fallback to first list if still no match
      if (!targetList) {
        targetList = lists[0];
      }

      if (!targetList) {
        return { response_action: 'errors', errors: { task_project: 'No lists found in this project' } };
      }

      // Create the task
      const maxPosition = await Card.findOne({ list: targetList._id })
        .sort({ position: -1 })
        .select('position');
      
      const task = await Card.create({
        title,
        description,
        board: board._id,
        list: targetList._id,
        status: selectedStatus.match(/^[0-9a-fA-F]{24}$/) ? 'todo' : selectedStatus, // Default status if list ID used
        priority,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignees: [], // No assignees in this simplified flow
        createdBy: user.user,
        position: (maxPosition?.position || 0) + 1
      });

      // Update status to match list type if possible
      // This helps if we selected a specific list but just want to ensure status property is aligned
      if (targetList.title.match(/in[\s\-_]*progress|doing|active|wip|working/i)) {
        task.status = 'in-progress';
      } else if (targetList.title.match(/done|complete/i)) {
        task.status = 'completed';
      } else {
        task.status = 'todo';
      }
      await task.save();

      // Emit real-time update
      emitToBoard(board._id.toString(), 'card-created', task);

      // Send confirmation to creator
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.sendDirectMessage(user.slackUserId, {
        text: `✅ Task "${title}" created successfully!`,
        blocks: [
          blockBuilder.section(`✅ *Task Created*\n*${title}*`),
          blockBuilder.context([
            `📁 ${board.name} • 📊 ${targetList.title}`,
            startDate ? `📅 Start: ${startDate}` : '',
            dueDate ? `📅 Due: ${dueDate}` : ''
          ].filter(Boolean)),
          blockBuilder.actions('task_created_actions', [
            blockBuilder.linkButton('📋 View Task', blockBuilder.taskUrl(task._id, board._id, board.department?._id), 'view_created_task')
          ])
        ]
      });

      // Refresh App Home
      await queueAppHomeUpdate(user._id, workspace._id);

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error creating task from modal:', error);
      return { response_action: 'errors', errors: { task_title: 'Failed to create task: ' + error.message } };
    }
  }

  /**
   * Handle status update modal submission
   */
  async handleStatusUpdateSubmission({ view, user, workspace }) {
    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const newStatus = values.new_status.status_select.selected_option.value;
      const note = values.status_note?.note_input?.value;

      const task = await Card.findById(metadata.taskId);
      if (!task) {
        return { response_action: 'errors', errors: { new_status: 'Task not found' } };
      }

      const oldStatus = task.status;
      task.status = newStatus;
      if (newStatus === 'completed') {
        task.completedAt = new Date();
      }
      await task.save();

      // Emit update
      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: newStatus }
      });

      // Add activity log if there's a note
      if (note) {
        const Activity = (await import('../../models/Activity.js')).default;
        await Activity.create({
          card: task._id,
          board: task.board,
          user: user.user,
          type: 'status_changed',
          details: `Changed status from ${oldStatus} to ${newStatus}. Note: ${note}`
        });
      }

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error updating status from modal:', error);
      return { response_action: 'errors', errors: { new_status: 'Failed to update status' } };
    }
  }

  /**
   * Handle reply comment modal submission
   */
  async handleReplyCommentSubmission({ view, user, workspace }) {
    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const replyText = values.reply_text.reply_input.value;

      const task = await Card.findById(metadata.taskId).populate('board');
      if (!task) {
        return { response_action: 'errors', errors: { reply_text: 'Task not found' } };
      }

      // Create comment
      const comment = await Comment.create({
        card: task._id,
        board: task.board._id,
        user: user.user,
        text: replyText,
        parentComment: metadata.commentId || null
      });

      // Emit update
      emitToBoard(task.board._id.toString(), 'comment-added', {
        cardId: task._id,
        comment
      });

      // Send notification
      const author = await User.findById(user.user);
      await slackNotificationService.sendCommentNotification(
        comment,
        task,
        author,
        [] // Could extract mentions from text
      );

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error posting reply from modal:', error);
      return { response_action: 'errors', errors: { reply_text: 'Failed to post reply' } };
    }
  }

  /**
   * Handle extend deadline modal submission
   */
  async handleExtendDeadlineSubmission({ view, user, workspace }) {
    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const newDueDate = values.new_due_date.date_picker.selected_date;
      const reason = values.reason?.reason_input?.value;

      const task = await Card.findById(metadata.taskId);
      if (!task) {
        return { response_action: 'errors', errors: { new_due_date: 'Task not found' } };
      }

      task.dueDate = new Date(newDueDate);
      await task.save();

      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { dueDate: task.dueDate }
      });

      // Log activity
      if (reason) {
        const Activity = (await import('../../models/Activity.js')).default;
        await Activity.create({
          card: task._id,
          board: task.board,
          user: user.user,
          type: 'deadline_extended',
          details: `Extended deadline to ${newDueDate}. Reason: ${reason}`
        });
      }

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error extending deadline from modal:', error);
      return { response_action: 'errors', errors: { new_due_date: 'Failed to update deadline' } };
    }
  }

  /**
   * Handle preferences modal submission
   */
  async handlePreferencesSubmission({ view, user, workspace }) {
    try {
      const values = view.state.values;
      
      user.preferences.notificationsEnabled = values.notifications_enabled.enabled_select.selected_option.value === 'true';
      user.preferences.quietHoursEnabled = values.quiet_hours.quiet_select.selected_option.value === 'true';
      user.preferences.digestFrequency = values.digest_frequency.digest_select.selected_option.value;
      user.preferences.minPriorityLevel = values.min_priority.priority_select.selected_option.value;
      
      await user.save();

      // Update App Home to reflect changes
      await queueAppHomeUpdate(user._id, workspace._id);

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error saving preferences from modal:', error);
      return { response_action: 'errors', errors: { notifications_enabled: 'Failed to save preferences' } };
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Parse action value (might be JSON or plain string)
   */
  parseActionValue(value) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Record interaction for analytics
   */
  async recordInteraction(workspace, slackUser, action, messageTs) {
    try {
      if (messageTs) {
        await SlackNotification.findOneAndUpdate(
          { workspace: workspace._id, messageTs },
          {
            $set: { hasInteraction: true },
            $push: {
              interactions: {
                actionId: action.action_id,
                actionType: action.type,
                actionValue: action.value || action.selected_option?.value,
                performedBy: slackUser.user,
                performedBySlackId: slackUser.slackUserId,
                performedAt: new Date()
              }
            }
          }
        );
      }

      // Update user interaction tracking
      slackUser.lastInteractionAt = new Date();
      slackUser.interactionCount = (slackUser.interactionCount || 0) + 1;
      await slackUser.save();
    } catch (error) {
      console.error('Error recording interaction:', error);
    }
  }

  /**
   * Create error response
   */
  errorResponse(message) {
    return {
      response_type: 'ephemeral',
      text: `❌ ${message}`
    };
  }
}

// Export singleton
const slackInteractiveHandler = new SlackInteractiveHandler();
export default slackInteractiveHandler;
export { SlackInteractiveHandler };

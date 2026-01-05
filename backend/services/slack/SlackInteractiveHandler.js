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
      
      // Digest actions
      'mark_all_read': this.handleMarkAllRead.bind(this),
      'digest_settings': this.handleDigestSettings.bind(this),
      
      // Announcement actions
      'acknowledge_announcement': this.handleAcknowledgeAnnouncement.bind(this)
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
        blockBuilder.linkButton('📋 View All Tasks', `${process.env.FRONTEND_URL}/list-view`, 'view_all')
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

    // Check for status select
    if (actionId.startsWith('status_')) {
      return this.handleStatusSelect.bind(this);
    }

    // Check for task menu
    if (actionId.startsWith('task_menu_')) {
      return this.handleTaskMenu.bind(this);
    }

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

      // Emit real-time update
      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: 'completed', completedAt: task.completedAt }
      });

      // Send celebration notification
      await slackNotificationService.sendTaskCompletionCelebration(
        task,
        await User.findById(user.user),
        await Board.findById(task.board)
      );

      // Update the original message
      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: true,
          text: `✅ Task "${task.title}" marked as complete!`,
          blocks: [
            blockBuilder.section(`✅ *Task Completed*\n~${task.title}~`),
            blockBuilder.context([`Completed by <@${user.slackUserId}>`])
          ]
        });
      }

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
      const taskValue = this.parseActionValue(action.value);
      const taskId = taskValue.taskId || taskValue;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      task.status = 'in-progress';
      await task.save();

      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: 'in-progress' }
      });

      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: false,
          text: `🔄 Started working on "${task.title}"`
        });
      }

      return { success: true, message: 'Task started' };
    } catch (error) {
      console.error('Error starting task:', error);
      return this.errorResponse('Failed to start task');
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
      const taskId = action.action_id.replace('status_', '');
      const newStatus = action.selected_option.value;

      const task = await Card.findById(taskId);
      if (!task) {
        return this.errorResponse('Task not found');
      }

      task.status = newStatus;
      if (newStatus === 'completed') {
        task.completedAt = new Date();
      }
      await task.save();

      emitToBoard(task.board.toString(), 'card-updated', {
        cardId: task._id,
        updates: { status: newStatus }
      });

      if (responseUrl) {
        const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
        await slackClient.respondToInteraction(responseUrl, {
          replace_original: false,
          response_type: 'ephemeral',
          text: `✅ Status updated to "${newStatus}"`
        });
      }

      return { success: true };
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
   * Handle acknowledge announcement
   */
  async handleAcknowledgeAnnouncement({ action, user, workspace, responseUrl }) {
    if (responseUrl) {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.respondToInteraction(responseUrl, {
        replace_original: false,
        response_type: 'ephemeral',
        text: '👍 Announcement acknowledged'
      });
    }
    return { success: true };
  }

  // ==================== Modal Submission Handlers ====================

  /**
   * Handle create task modal submission
   */
  async handleCreateTaskSubmission({ view, user, workspace }) {
    try {
      const values = view.state.values;
      
      const title = values.task_title.title_input.value;
      const description = values.task_description?.description_input?.value;
      const priority = values.task_priority?.priority_select?.selected_option?.value;
      const dueDate = values.task_due_date?.due_date_picker?.selected_date;
      const boardId = values.task_project?.project_select?.selected_option?.value;
      const assigneeSlackIds = values.task_assignees?.assignees_select?.selected_users || [];

      // Get board and default list
      const board = await Board.findById(boardId);
      if (!board) {
        return { response_action: 'errors', errors: { task_project: 'Please select a valid project' } };
      }

      const List = (await import('../../models/List.js')).default;
      const defaultList = await List.findOne({ board: board._id }).sort({ position: 1 });
      if (!defaultList) {
        return { response_action: 'errors', errors: { task_project: 'No list found in this project' } };
      }

      // Map Slack user IDs to FlowTask users
      const assignees = [];
      for (const slackId of assigneeSlackIds) {
        const slackUser = await SlackUser.findOne({ 
          slackUserId: slackId, 
          workspace: workspace._id,
          isActive: true 
        });
        if (slackUser) {
          assignees.push(slackUser.user);
        }
      }

      // Create the task
      const maxPosition = await Card.findOne({ list: defaultList._id })
        .sort({ position: -1 })
        .select('position');
      
      const task = await Card.create({
        title,
        description,
        board: board._id,
        list: defaultList._id,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignees,
        createdBy: user.user,
        position: (maxPosition?.position || 0) + 1
      });

      // Emit real-time update
      emitToBoard(board._id.toString(), 'card-created', task);

      // Send notifications to assignees
      if (assignees.length > 0) {
        await slackNotificationService.sendTaskNotification('task_assigned', task, {
          triggeredBy: await User.findById(user.user),
          assignees: await User.find({ _id: { $in: assignees } }),
          board
        });
      }

      // Send confirmation to creator
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.sendDirectMessage(user.slackUserId, {
        text: `✅ Task "${title}" created successfully!`,
        blocks: [
          blockBuilder.section(`✅ *Task Created*\n*${title}*`),
          blockBuilder.context([`📁 ${board.name}`]),
          blockBuilder.actions('task_created_actions', [
            blockBuilder.linkButton('📋 View Task', `${process.env.FRONTEND_URL}/workflow/${board._id}/${task._id}`, 'view_created_task')
          ])
        ]
      });

      return { response_action: 'clear' };
    } catch (error) {
      console.error('Error creating task from modal:', error);
      return { response_action: 'errors', errors: { task_title: 'Failed to create task' } };
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

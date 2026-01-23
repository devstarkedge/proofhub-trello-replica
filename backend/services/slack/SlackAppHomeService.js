/**
 * Slack App Home Service
 * Manages the App Home tab experience
 */

import SlackUser from '../../models/SlackUser.js';
import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackApiClient from './SlackApiClient.js';
import SlackBlockKitBuilder from './SlackBlockKitBuilder.js';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import { queueAppHomeUpdate } from './SlackNotificationQueue.js';

const blockBuilder = new SlackBlockKitBuilder(process.env.FRONTEND_URL);

class SlackAppHomeService {
  /**
   * Handle app_home_opened event
   */
  async handleAppHomeOpened(payload) {
    const { user: slackUserId, team: teamId, tab } = payload.event;

    if (tab !== 'home') {
      return { ok: true };
    }

    // Get workspace and user
    const workspace = await SlackWorkspace.findByTeamId(teamId);
    if (!workspace || !workspace.isActive || !workspace.settings.appHomeEnabled) {
      return { ok: true };
    }

    let slackUser = await SlackUser.findBySlackUserId(slackUserId, workspace._id);

    if (!slackUser) {
      // User not linked - show connect prompt
      return this.showConnectPrompt(workspace, slackUserId);
    }

    // Update App Home
    await queueAppHomeUpdate(slackUser._id, workspace._id);

    // Update last viewed
    slackUser.appHomeState.lastViewedAt = new Date();
    await slackUser.save();

    return { ok: true };
  }

  /**
   * Show connect account prompt
   */
  async showConnectPrompt(workspace, slackUserId) {
    try {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);

      const view = {
        type: 'home',
        blocks: [
          blockBuilder.header('👋 Welcome to FlowTask!'),
          blockBuilder.section(
            'Connect your FlowTask account to access your tasks, get notifications, and manage your work directly from Slack.'
          ),
          blockBuilder.divider(),
          blockBuilder.section(
            '*Get started in seconds:*\n\n' +
            '1️⃣ Click the button below\n' +
            '2️⃣ Sign in to your FlowTask account\n' +
            '3️⃣ Authorize the connection\n' +
            '4️⃣ You\'re all set! 🎉'
          ),
          blockBuilder.divider(),
          blockBuilder.actions('connect_account', [
            blockBuilder.linkButton(
              '🔗 Connect FlowTask Account',
              `${process.env.FRONTEND_URL}/settings`,
              'connect_account_btn'
            )
          ]),
          blockBuilder.divider(),
          blockBuilder.context([
            '💡 _After connecting, you\'ll be able to:_'
          ]),
          blockBuilder.section(
            '• View your tasks and projects\n' +
            '• Update task status\n' +
            '• Get smart notifications\n' +
            '• Create tasks from Slack\n' +
            '• And much more!'
          )
        ]
      };

      const publishResult = await slackClient.publishHomeView(slackUserId, view);
      if (publishResult?.success === false && publishResult.error === 'not_enabled') {
        console.warn('App Home feature not enabled for workspace:', workspace.teamId);
        return { ok: true, warning: 'app_home_not_enabled' };
      }

      return { ok: true };
    } catch (error) {
      console.error('Error showing connect prompt:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Build and publish App Home for a user
   */
  async publishAppHome(slackUserId, workspaceId) {
    try {
      const slackUser = await SlackUser.findById(slackUserId)
        .populate('user')
        .populate('workspace');

      if (!slackUser || !slackUser.isActive) {
        return { ok: false, error: 'User not found' };
      }

      const workspace = slackUser.workspace;
      if (!workspace || !workspace.isActive) {
        return { ok: false, error: 'Workspace not active' };
      }

      // Get user's data
      const data = await this.getUserDashboardData(slackUser.user._id);

      // Build view
      const view = this.buildAppHomeView(slackUser, data);

      // Publish
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      const publishResult = await slackClient.publishHomeView(slackUser.slackUserId, view);

      if (publishResult?.success === false && publishResult.error === 'not_enabled') {
        console.warn('App Home feature not enabled for workspace:', workspace.teamId);
        return { ok: true, warning: 'app_home_not_enabled' };
      }

      return { ok: true };
    } catch (error) {
      console.error('Error publishing App Home:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Get user dashboard data
   */
  async getUserDashboardData(userId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      assignedTasks,
      overdueTasks,
      dueTodayTasks,
      recentlyUpdated,
      completedThisWeek
    ] = await Promise.all([
      // All assigned tasks (not completed)
      Card.find({
        assignees: userId,
        isArchived: false,
        status: { $ne: 'completed' }
      })
        .populate('board', 'name')
        .sort({ priority: -1, dueDate: 1 })
        .limit(25)
        .lean(),

      // Overdue tasks
      Card.find({
        assignees: userId,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $lt: now }
      })
        .populate('board', 'name')
        .sort({ dueDate: 1 })
        .limit(10)
        .lean(),

      // Due today
      Card.find({
        assignees: userId,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $gte: startOfToday, $lt: endOfToday }
      })
        .populate('board', 'name')
        .lean(),

      // Recently updated
      Card.find({
        assignees: userId,
        isArchived: false,
        updatedAt: { $gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) }
      })
        .populate('board', 'name')
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),

      // Completed this week
      Card.countDocuments({
        assignees: userId,
        status: 'completed',
        updatedAt: { $gte: sevenDaysAgo }
      })
    ]);

    // Calculate overdue days
    overdueTasks.forEach(task => {
      task.overdueDays = Math.ceil((now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24));
    });

    // Calculate stats
    const stats = {
      total: assignedTasks.length,
      overdue: overdueTasks.length,
      dueToday: dueTodayTasks.length,
      inProgress: assignedTasks.filter(t => t.status === 'in-progress').length,
      completed: completedThisWeek
    };

    return {
      assignedTasks,
      overdueTasks,
      dueTodayTasks,
      recentlyUpdated,
      stats
    };
  }

  /**
   * Build App Home view
   */
  buildAppHomeView(slackUser, data) {
    const { assignedTasks, overdueTasks, dueTodayTasks, recentlyUpdated, stats } = data;
    const user = slackUser.user;

    const blocks = [];

    // Welcome header
    blocks.push(blockBuilder.header(`👋 Welcome back, ${user.name}!`));
    blocks.push(blockBuilder.context([`Last updated: ${blockBuilder.formatDate(new Date())}`]));
    blocks.push(blockBuilder.divider());

    // Quick stats dashboard
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📊 Your Dashboard*'
      }
    });

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `🚨 *Overdue*\n${stats.overdue}`
        },
        {
          type: 'mrkdwn',
          text: `⏰ *Due Today*\n${stats.dueToday}`
        },
        {
          type: 'mrkdwn',
          text: `🔄 *In Progress*\n${stats.inProgress}`
        },
        {
          type: 'mrkdwn',
          text: `✅ *Completed (7d)*\n${stats.completed}`
        }
      ]
    });

    // Overdue tasks section
    if (overdueTasks.length > 0) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.header('🚨 Overdue Tasks'));

      overdueTasks.slice(0, 5).forEach(task => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${task.title}*\n📁 ${task.board?.name || 'Unknown'} • Overdue by *${task.overdueDays} days*`
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Complete',
              emoji: true
            },
            style: 'primary',
            action_id: `complete_task_${task._id}`,
            value: task._id.toString()
          }
        });
      });

      if (overdueTasks.length > 5) {
        blocks.push(blockBuilder.context([
          `_+${overdueTasks.length - 5} more overdue tasks_`
        ]));
      }
    }

    // Due today section
    if (dueTodayTasks.length > 0) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.header('⏰ Due Today'));

      dueTodayTasks.slice(0, 5).forEach(task => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${task.title}*\n📁 ${task.board?.name || 'Unknown'}`
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Complete',
              emoji: true
            },
            action_id: `complete_task_${task._id}`,
            value: task._id.toString()
          }
        });
      });
    }

    // My tasks section
    if (assignedTasks.length > 0) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.header('📌 My Tasks'));

      // Group by status
      const byStatus = {
        'in-progress': [],
        'todo': [],
        'in-review': []
      };

      assignedTasks.forEach(task => {
        const status = task.status || 'todo';
        if (byStatus[status]) {
          byStatus[status].push(task);
        }
      });

      // In Progress
      if (byStatus['in-progress'].length > 0) {
        blocks.push(blockBuilder.section('*🔄 In Progress*'));
        byStatus['in-progress'].slice(0, 5).forEach(task => {
          const priorityEmoji = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🟢'
          }[task.priority] || '⚪';

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${priorityEmoji} *${task.title}*\n📁 ${task.board?.name || 'Unknown'}${task.dueDate ? ` • 📅 ${blockBuilder.formatDate(task.dueDate, '{date_short}')}` : ''}`
            },
            accessory: {
              type: 'static_select',
              action_id: `status_${task._id}`,
              placeholder: {
                type: 'plain_text',
                text: 'Change Status'
              },
              options: [
                { text: { type: 'plain_text', text: '📋 Todo' }, value: 'todo' },
                { text: { type: 'plain_text', text: '🔄 In Progress' }, value: 'in-progress' },
                { text: { type: 'plain_text', text: '👀 In Review' }, value: 'in-review' },
                { text: { type: 'plain_text', text: '✅ Completed' }, value: 'completed' }
              ]
            }
          });
        });
      }

      // Todo
      if (byStatus['todo'].length > 0) {
        blocks.push(blockBuilder.section('*📋 Todo*'));
        byStatus['todo'].slice(0, 5).forEach(task => {
          blocks.push(blockBuilder.context([
            `• ${blockBuilder.link(task.title, blockBuilder.taskUrl(task._id, task.board._id))} - ${task.board?.name || 'Unknown'}`
          ]));
        });

        if (byStatus['todo'].length > 5) {
          blocks.push(blockBuilder.context([`_+${byStatus['todo'].length - 5} more_`]));
        }
      }
    }

    // Recently updated section
    if (recentlyUpdated.length > 0) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.header('🔄 Recently Updated'));

      recentlyUpdated.forEach(task => {
        blocks.push(blockBuilder.context([
          `• *${task.title}* - Updated ${blockBuilder.formatDate(task.updatedAt, '{time}')}`
        ]));
      });
    }

    // Empty state
    if (assignedTasks.length === 0 && overdueTasks.length === 0) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.section(
        '🎉 *All caught up!*\n\nYou have no pending tasks. Great job!'
      ));
    }

    // Quick actions footer
    blocks.push(blockBuilder.divider());
    blocks.push(blockBuilder.actions('home_quick_actions', [
      blockBuilder.linkButton('📋 All Tasks', `${process.env.FRONTEND_URL}/my-shortcuts`, 'view_all_tasks'),
      blockBuilder.linkButton('📁 Projects', `${process.env.FRONTEND_URL}/my-shortcuts`, 'view_projects'),
      blockBuilder.button('🔔 Preferences', 'open_preferences', 'open_prefs')
    ]));

    // Notification status
    blocks.push(blockBuilder.context([
      `🔔 Notifications: ${slackUser.preferences.notificationsEnabled ? '✅ Enabled' : '❌ Disabled'} | ` +
      `🌙 Quiet Hours: ${slackUser.preferences.quietHoursEnabled ? '✅ Enabled' : '❌ Disabled'}`
    ]));

    return {
      type: 'home',
      blocks
    };
  }

  /**
   * Refresh App Home for all users in workspace
   */
  async refreshWorkspaceAppHomes(workspaceId) {
    const users = await SlackUser.find({
      workspace: workspaceId,
      isActive: true
    });

    const results = await Promise.allSettled(
      users.map(user => queueAppHomeUpdate(user._id, workspaceId))
    );

    return {
      total: users.length,
      queued: results.filter(r => r.status === 'fulfilled').length
    };
  }
}

// Export singleton
const slackAppHomeService = new SlackAppHomeService();
export default slackAppHomeService;
export { SlackAppHomeService };

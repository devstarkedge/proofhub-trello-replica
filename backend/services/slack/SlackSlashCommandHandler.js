/**
 * Slack Slash Command Handler
 * Handles all slash commands: /mytasks, /overdue, /task, /project, etc.
 */

import SlackWorkspace from '../../models/SlackWorkspace.js';
import SlackUser from '../../models/SlackUser.js';
import SlackApiClient from './SlackApiClient.js';
import SlackBlockKitBuilder from './SlackBlockKitBuilder.js';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import User from '../../models/User.js';

const blockBuilder = new SlackBlockKitBuilder(process.env.FRONTEND_URL);

class SlackSlashCommandHandler {
  constructor() {
    this.commands = {
      '/mytasks': this.handleMyTasks.bind(this),
      '/overdue': this.handleOverdue.bind(this),
      '/task': this.handleTask.bind(this),
      '/project': this.handleProject.bind(this),
      '/flowtask': this.handleFlowTask.bind(this),
      '/ft': this.handleFlowTask.bind(this) // Short alias
    };
  }

  /**
   * Main handler for slash commands
   */
  async handleCommand(payload) {
    const { command, text, user_id, team_id, trigger_id, response_url } = payload;

    // Get workspace
    const workspace = await SlackWorkspace.findByTeamId(team_id);
    if (!workspace || !workspace.isActive) {
      return this.errorResponse('FlowTask is not connected to this workspace.');
    }

    if (!workspace.settings.slashCommandsEnabled) {
      return this.errorResponse('Slash commands are disabled for this workspace.');
    }

    // Get Slack user
    const slackUser = await SlackUser.findBySlackUserId(user_id, workspace._id);
    if (!slackUser) {
      return this.linkAccountResponse();
    }

    // Get the handler
    const handler = this.commands[command];
    if (!handler) {
      return this.helpResponse();
    }

    try {
      return await handler({
        text: text?.trim() || '',
        user: slackUser,
        workspace,
        triggerId: trigger_id,
        responseUrl: response_url
      });
    } catch (error) {
      console.error('Slash command error:', error);
      return this.errorResponse('Something went wrong. Please try again.');
    }
  }

  /**
   * /mytasks - Show user's assigned tasks
   */
  async handleMyTasks({ text, user, workspace }) {
    const args = this.parseArgs(text);
    const filter = args[0] || 'all';

    // Build query
    const query = {
      assignees: user.user,
      isArchived: false
    };

    if (filter === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      query.dueDate = { $gte: startOfToday, $lt: endOfToday };
    } else if (filter === 'week') {
      const now = new Date();
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      query.dueDate = { $lte: endOfWeek };
      query.status = { $ne: 'completed' };
    } else if (filter === 'inprogress' || filter === 'in-progress') {
      query.status = 'in-progress';
    } else if (filter === 'todo') {
      query.status = 'todo';
    } else if (filter !== 'all') {
      query.status = { $ne: 'completed' };
    } else {
      query.status = { $ne: 'completed' };
    }

    const tasks = await Card.find(query)
      .populate('board', 'name')
      .sort({ priority: -1, dueDate: 1 })
      .limit(15)
      .lean();

    if (tasks.length === 0) {
      return {
        response_type: 'ephemeral',
        text: '🎉 No tasks found! You\'re all caught up!'
      };
    }

    const blocks = [
      blockBuilder.header(`📋 Your Tasks (${tasks.length})`),
      blockBuilder.context([`Filter: ${filter}`]),
      blockBuilder.divider()
    ];

    // Group by priority
    const priorityOrder = ['critical', 'high', 'medium', 'low', null];
    const grouped = {};

    tasks.forEach(task => {
      const priority = task.priority || 'none';
      if (!grouped[priority]) grouped[priority] = [];
      grouped[priority].push(task);
    });

    for (const priority of priorityOrder) {
      const key = priority || 'none';
      const tasksInGroup = grouped[key];
      if (!tasksInGroup || tasksInGroup.length === 0) continue;

      const emoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
        none: '⚪'
      }[key];

      blocks.push(blockBuilder.section(`*${emoji} ${key.charAt(0).toUpperCase() + key.slice(1)} Priority*`));

      tasksInGroup.forEach(task => {
        const dueInfo = task.dueDate 
          ? ` • Due: ${blockBuilder.formatDate(task.dueDate, '{date_short}')}` 
          : '';
        blocks.push(blockBuilder.context([
          `• ${blockBuilder.link(task.title, blockBuilder.taskUrl(task._id, task.board._id))} (${task.board.name})${dueInfo}`
        ]));
      });
    }

    blocks.push(blockBuilder.divider());
    blocks.push(blockBuilder.actions('mytasks_actions', [
      blockBuilder.linkButton('📋 View All Tasks', `${process.env.FRONTEND_URL}/list-view`, 'view_all'),
      blockBuilder.button('🔄 Refresh', 'refresh_mytasks', filter)
    ]));

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /overdue - Show overdue tasks
   */
  async handleOverdue({ text, user, workspace }) {
    const now = new Date();

    const tasks = await Card.find({
      assignees: user.user,
      isArchived: false,
      status: { $ne: 'completed' },
      dueDate: { $lt: now }
    })
      .populate('board', 'name')
      .sort({ dueDate: 1 })
      .limit(20)
      .lean();

    if (tasks.length === 0) {
      return {
        response_type: 'ephemeral',
        text: '✅ Great news! You have no overdue tasks!'
      };
    }

    const blocks = [
      blockBuilder.header(`🚨 Overdue Tasks (${tasks.length})`),
      blockBuilder.divider()
    ];

    tasks.forEach(task => {
      const overdueDays = Math.ceil((now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24));
      const urgencyEmoji = overdueDays > 7 ? '🔴' : overdueDays > 3 ? '🟠' : '🟡';

      blocks.push(blockBuilder.section(
        `${urgencyEmoji} *${blockBuilder.link(task.title, blockBuilder.taskUrl(task._id, task.board._id))}*\n` +
        `📁 ${task.board.name} • Overdue by *${overdueDays} day${overdueDays > 1 ? 's' : ''}*`,
        blockBuilder.button('✅ Done', `complete_overdue_${task._id}`, task._id.toString())
      ));
    });

    blocks.push(blockBuilder.divider());
    blocks.push(blockBuilder.context([
      '_Tip: Mark tasks complete directly or update their due dates to clear this list._'
    ]));

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /task - Task operations
   */
  async handleTask({ text, user, workspace, triggerId }) {
    const args = this.parseArgs(text);
    const subCommand = args[0]?.toLowerCase();

    switch (subCommand) {
      case 'create':
        return this.handleTaskCreate({ args: args.slice(1), user, workspace, triggerId });
      
      case 'assign':
        return this.handleTaskAssign({ args: args.slice(1), user, workspace });
      
      case 'status':
        return this.handleTaskStatus({ args: args.slice(1), user, workspace });
      
      case 'view':
      case 'show':
        return this.handleTaskView({ args: args.slice(1), user, workspace });
      
      case 'search':
        return this.handleTaskSearch({ args: args.slice(1), user, workspace });
      
      default:
        return this.taskHelpResponse();
    }
  }

  /**
   * /task create "Task Name"
   */
  async handleTaskCreate({ args, user, workspace, triggerId }) {
    // If we have a trigger ID, open a modal for better UX
    if (triggerId) {
      const slackClient = await SlackApiClient.forWorkspace(workspace.teamId);
      await slackClient.openModal(triggerId, blockBuilder.buildTaskCreationModal({
        prefilledTitle: args.join(' ')
      }));
      return { response_type: 'ephemeral', text: '📝 Opening task creation form...' };
    }

    return {
      response_type: 'ephemeral',
      text: 'Please use the full command: `/task create "Task Title"` or trigger from the app.'
    };
  }

  /**
   * /task assign @user "Task Name"
   */
  async handleTaskAssign({ args, user, workspace }) {
    // Parse user mention and task name
    const mentionMatch = args[0]?.match(/<@([A-Z0-9]+)\|?[^>]*>/);
    if (!mentionMatch) {
      return this.errorResponse('Please mention a user: `/task assign @user "Task Name"`');
    }

    const assigneeSlackId = mentionMatch[1];
    const taskName = args.slice(1).join(' ').replace(/^["']|["']$/g, '');

    if (!taskName) {
      return this.errorResponse('Please provide a task name: `/task assign @user "Task Name"`');
    }

    // Find the assignee
    const assigneeSlackUser = await SlackUser.findOne({
      slackUserId: assigneeSlackId,
      workspace: workspace._id,
      isActive: true
    });

    if (!assigneeSlackUser) {
      return this.errorResponse('This user is not connected to FlowTask.');
    }

    // Search for the task
    const task = await Card.findOne({
      title: { $regex: taskName, $options: 'i' },
      isArchived: false
    }).populate('board', 'name');

    if (!task) {
      return this.errorResponse(`Task "${taskName}" not found.`);
    }

    // Add assignee if not already assigned
    if (!task.assignees.includes(assigneeSlackUser.user)) {
      task.assignees.push(assigneeSlackUser.user);
      await task.save();
    }

    return {
      response_type: 'in_channel',
      text: `✅ <@${assigneeSlackId}> has been assigned to "${task.title}" in ${task.board.name}`,
      blocks: [
        blockBuilder.section(
          `✅ *Task Assigned*\n` +
          `<@${assigneeSlackId}> has been assigned to *${blockBuilder.link(task.title, blockBuilder.taskUrl(task._id, task.board._id))}*`
        ),
        blockBuilder.context([`📁 ${task.board.name}`])
      ]
    };
  }

  /**
   * /task status <task name>
   */
  async handleTaskStatus({ args, user, workspace }) {
    const taskName = args.join(' ').replace(/^["']|["']$/g, '');
    
    if (!taskName) {
      return this.errorResponse('Please provide a task name: `/task status "Task Name"`');
    }

    const task = await Card.findOne({
      title: { $regex: taskName, $options: 'i' },
      isArchived: false
    })
      .populate('board', 'name')
      .populate('assignees', 'name')
      .lean();

    if (!task) {
      return this.errorResponse(`Task "${taskName}" not found.`);
    }

    const statusEmoji = {
      'todo': '📋',
      'in-progress': '🔄',
      'in-review': '👀',
      'blocked': '🚫',
      'completed': '✅'
    }[task.status] || '📋';

    const priorityEmoji = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🟡',
      'low': '🟢'
    }[task.priority] || '⚪';

    const blocks = [
      blockBuilder.header(`📋 ${task.title}`),
      blockBuilder.section(
        `*Status:* ${statusEmoji} ${task.status || 'Todo'}\n` +
        `*Priority:* ${priorityEmoji} ${task.priority || 'Not set'}\n` +
        `*Project:* 📁 ${task.board.name}`
      )
    ];

    if (task.assignees.length > 0) {
      blocks.push(blockBuilder.context([
        `👥 *Assigned to:* ${task.assignees.map(a => a.name).join(', ')}`
      ]));
    }

    if (task.dueDate) {
      const isOverdue = new Date(task.dueDate) < new Date();
      blocks.push(blockBuilder.context([
        `📅 *Due:* ${blockBuilder.formatDate(task.dueDate)}${isOverdue ? ' (Overdue!)' : ''}`
      ]));
    }

    if (task.description) {
      blocks.push(blockBuilder.divider());
      blocks.push(blockBuilder.section(task.description.substring(0, 500)));
    }

    blocks.push(blockBuilder.divider());
    blocks.push(blockBuilder.actions('task_status_actions', [
      blockBuilder.linkButton('📋 View Full Details', blockBuilder.taskUrl(task._id, task.board._id), 'view_task')
    ]));

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /task view <task name>
   */
  async handleTaskView({ args, user, workspace }) {
    return this.handleTaskStatus({ args, user, workspace });
  }

  /**
   * /task search <query>
   */
  async handleTaskSearch({ args, user, workspace }) {
    const query = args.join(' ');
    
    if (!query || query.length < 2) {
      return this.errorResponse('Please provide a search query (at least 2 characters)');
    }

    const tasks = await Card.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ],
      isArchived: false
    })
      .populate('board', 'name')
      .limit(10)
      .lean();

    if (tasks.length === 0) {
      return {
        response_type: 'ephemeral',
        text: `🔍 No tasks found matching "${query}"`
      };
    }

    const blocks = [
      blockBuilder.header(`🔍 Search Results (${tasks.length})`),
      blockBuilder.context([`Query: "${query}"`]),
      blockBuilder.divider()
    ];

    tasks.forEach(task => {
      blocks.push(blockBuilder.context([
        `• ${blockBuilder.link(task.title, blockBuilder.taskUrl(task._id, task.board._id))} - ${task.board.name}`
      ]));
    });

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /project - Project operations
   */
  async handleProject({ text, user, workspace }) {
    const args = this.parseArgs(text);
    const subCommand = args[0]?.toLowerCase();

    switch (subCommand) {
      case 'list':
        return this.handleProjectList({ args: args.slice(1), user, workspace });
      
      case 'view':
      case 'show':
        return this.handleProjectView({ args: args.slice(1), user, workspace });
      
      case 'stats':
        return this.handleProjectStats({ args: args.slice(1), user, workspace });
      
      default:
        return this.handleProjectList({ args, user, workspace });
    }
  }

  /**
   * /project list
   */
  async handleProjectList({ args, user, workspace }) {
    const flowTaskUser = await User.findById(user.user).lean();
    
    // Get boards the user has access to
    const boards = await Board.find({
      $or: [
        { owner: user.user },
        { members: user.user },
        { department: { $in: flowTaskUser.department || [] } }
      ],
      isArchived: false
    })
      .populate('owner', 'name')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean();

    if (boards.length === 0) {
      return {
        response_type: 'ephemeral',
        text: '📁 No projects found.'
      };
    }

    const blocks = [
      blockBuilder.header(`📁 Your Projects (${boards.length})`),
      blockBuilder.divider()
    ];

    boards.forEach(board => {
      const statusEmoji = {
        'planning': '📋',
        'in-progress': '🔄',
        'completed': '✅',
        'on-hold': '⏸️'
      }[board.status] || '📁';

      blocks.push(blockBuilder.section(
        `${statusEmoji} *${blockBuilder.link(board.name, blockBuilder.boardUrl(board._id, board.department))}*\n` +
        `${board.description?.substring(0, 100) || 'No description'}`,
        blockBuilder.overflowMenu(`project_menu_${board._id}`, [
          { text: '📊 View Stats', value: `stats_${board._id}` },
          { text: '📋 View Tasks', value: `tasks_${board._id}` }
        ])
      ));
    });

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /project view <name>
   */
  async handleProjectView({ args, user, workspace }) {
    const projectName = args.join(' ').replace(/^["']|["']$/g, '');
    
    if (!projectName) {
      return this.handleProjectList({ args, user, workspace });
    }

    const board = await Board.findOne({
      name: { $regex: projectName, $options: 'i' },
      isArchived: false
    })
      .populate('owner', 'name')
      .populate('members', 'name')
      .lean();

    if (!board) {
      return this.errorResponse(`Project "${projectName}" not found.`);
    }

    // Get task stats
    const taskStats = await Card.aggregate([
      { $match: { board: board._id, isArchived: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = taskStats.reduce((acc, s) => {
      acc[s._id || 'todo'] = s.count;
      return acc;
    }, {});

    const totalTasks = Object.values(stats).reduce((a, b) => a + b, 0);

    const blocks = [
      blockBuilder.header(`📁 ${board.name}`),
      blockBuilder.section(board.description || '_No description_'),
      blockBuilder.divider(),
      blockBuilder.section(
        `*📊 Task Overview*\n` +
        `• Total: *${totalTasks}*\n` +
        `• Todo: ${stats.todo || 0}\n` +
        `• In Progress: ${stats['in-progress'] || 0}\n` +
        `• Completed: ${stats.completed || 0}`
      )
    ];

    if (board.members.length > 0) {
      blocks.push(blockBuilder.context([
        `👥 *Team:* ${board.members.map(m => m.name).join(', ')}`
      ]));
    }

    if (board.dueDate) {
      blocks.push(blockBuilder.context([
        `📅 *Due:* ${blockBuilder.formatDate(board.dueDate)}`
      ]));
    }

    blocks.push(blockBuilder.divider());
    blocks.push(blockBuilder.actions('project_view_actions', [
      blockBuilder.linkButton('📁 Open Project', blockBuilder.boardUrl(board._id, board.department), 'open_project')
    ]));

    return {
      response_type: 'ephemeral',
      blocks
    };
  }

  /**
   * /project stats <name>
   */
  async handleProjectStats({ args, user, workspace }) {
    return this.handleProjectView({ args, user, workspace });
  }

  /**
   * /flowtask - Main help command
   */
  async handleFlowTask({ text, user, workspace }) {
    const args = this.parseArgs(text);
    const subCommand = args[0]?.toLowerCase();

    switch (subCommand) {
      case 'help':
        return this.helpResponse();
      
      case 'status':
        return this.statusResponse(user, workspace);
      
      case 'connect':
        return this.linkAccountResponse();
      
      case 'preferences':
      case 'settings':
        return {
          response_type: 'ephemeral',
          text: 'Open the App Home tab to manage your preferences, or use the button below.',
          blocks: [
            blockBuilder.section('⚙️ *Manage your FlowTask preferences*'),
            blockBuilder.actions('ft_preferences', [
              blockBuilder.button('⚙️ Open Preferences', 'open_preferences', 'prefs')
            ])
          ]
        };
      
      default:
        return this.helpResponse();
    }
  }

  /**
   * Status response
   */
  async statusResponse(user, workspace) {
    const flowTaskUser = await User.findById(user.user).lean();
    
    // Get quick stats
    const [assignedCount, overdueCount, completedToday] = await Promise.all([
      Card.countDocuments({
        assignees: user.user,
        isArchived: false,
        status: { $ne: 'completed' }
      }),
      Card.countDocuments({
        assignees: user.user,
        isArchived: false,
        status: { $ne: 'completed' },
        dueDate: { $lt: new Date() }
      }),
      Card.countDocuments({
        assignees: user.user,
        status: 'completed',
        completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      })
    ]);

    return {
      response_type: 'ephemeral',
      blocks: [
        blockBuilder.header(`👤 ${flowTaskUser.name}`),
        blockBuilder.section(
          `*Your FlowTask Status*\n\n` +
          `📌 Active Tasks: *${assignedCount}*\n` +
          `🚨 Overdue: *${overdueCount}*\n` +
          `✅ Completed Today: *${completedToday}*`
        ),
        blockBuilder.context([
          `Slack connected • Notifications: ${user.preferences.notificationsEnabled ? '✅ On' : '❌ Off'}`
        ]),
        blockBuilder.divider(),
        blockBuilder.actions('status_actions', [
          blockBuilder.linkButton('📋 Open FlowTask', process.env.FRONTEND_URL, 'open_app')
        ])
      ]
    };
  }

  // ==================== Response Helpers ====================

  /**
   * Help response
   */
  helpResponse() {
    return {
      response_type: 'ephemeral',
      blocks: [
        blockBuilder.header('🚀 FlowTask Slash Commands'),
        blockBuilder.divider(),
        blockBuilder.section(
          '*Task Commands*\n' +
          '`/mytasks` - View your assigned tasks\n' +
          '`/mytasks today` - Tasks due today\n' +
          '`/mytasks week` - Tasks due this week\n' +
          '`/overdue` - View overdue tasks\n' +
          '`/task create` - Create a new task\n' +
          '`/task assign @user "Task"` - Assign a task\n' +
          '`/task status "Task"` - Check task status\n' +
          '`/task search <query>` - Search tasks'
        ),
        blockBuilder.section(
          '*Project Commands*\n' +
          '`/project list` - List your projects\n' +
          '`/project view "Name"` - View project details\n' +
          '`/project stats "Name"` - Project statistics'
        ),
        blockBuilder.section(
          '*Other Commands*\n' +
          '`/flowtask status` - Your FlowTask status\n' +
          '`/flowtask preferences` - Manage settings\n' +
          '`/flowtask help` - Show this help'
        ),
        blockBuilder.divider(),
        blockBuilder.context([
          '💡 _Tip: Most commands work with partial matches. You don\'t need the exact task name!_'
        ])
      ]
    };
  }

  /**
   * Task help response
   */
  taskHelpResponse() {
    return {
      response_type: 'ephemeral',
      blocks: [
        blockBuilder.header('📋 Task Commands'),
        blockBuilder.section(
          '`/task create` - Open task creation form\n' +
          '`/task assign @user "Task Name"` - Assign user to task\n' +
          '`/task status "Task Name"` - View task status\n' +
          '`/task view "Task Name"` - View task details\n' +
          '`/task search <query>` - Search for tasks'
        ),
        blockBuilder.context([
          '_Use quotes around task names with spaces_'
        ])
      ]
    };
  }

  /**
   * Link account response
   */
  linkAccountResponse() {
    return {
      response_type: 'ephemeral',
      text: '🔗 Please connect your FlowTask account first.',
      blocks: [
        blockBuilder.section(
          '🔗 *Connect Your FlowTask Account*\n\n' +
          'To use FlowTask commands, you need to link your Slack account.'
        ),
        blockBuilder.actions('connect_actions', [
          blockBuilder.linkButton(
            '🔗 Connect Account',
            `${process.env.FRONTEND_URL}/settings/integrations/slack`,
            'connect_account'
          )
        ])
      ]
    };
  }

  /**
   * Error response
   */
  errorResponse(message) {
    return {
      response_type: 'ephemeral',
      text: `❌ ${message}`
    };
  }

  /**
   * Parse command arguments
   */
  parseArgs(text) {
    if (!text) return [];
    
    // Handle quoted strings
    const args = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      args.push(match[1] || match[2] || match[0]);
    }
    
    return args;
  }
}

// Export singleton
const slackSlashCommandHandler = new SlackSlashCommandHandler();
export default slackSlashCommandHandler;
export { SlackSlashCommandHandler };

/**
 * Slack Block Kit Builder
 * Premium notification templates for FlowTask
 * 
 * Creates beautiful, interactive Slack messages using Block Kit
 */

// Color codes for priorities
const PRIORITY_COLORS = {
  critical: '#dc2626', // Red
  high: '#f97316',     // Orange
  medium: '#eab308',   // Yellow
  low: '#22c55e'       // Green
};

// Status colors
const STATUS_COLORS = {
  todo: '#6b7280',
  'in-progress': '#3b82f6',
  'in-review': '#8b5cf6',
  blocked: '#ef4444',
  completed: '#22c55e',
  done: '#22c55e'
};

// Emoji mappings
const PRIORITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢'
};

const STATUS_EMOJI = {
  todo: '📋',
  'in-progress': '🔄',
  'in-review': '👀',
  blocked: '🚫',
  completed: '✅',
  done: '✅'
};

const NOTIFICATION_EMOJI = {
  task_assigned: '📌',
  task_updated: '✏️',
  task_due_soon: '⏰',
  task_overdue: '🚨',
  task_created: '🆕',
  task_deleted: '🗑️',
  task_moved: '📦',
  task_completed: '🎉',
  comment_added: '💬',
  comment_mention: '📢',
  project_created: '📁',
  reminder: '🔔',
  announcement: '📣',
  team_update: '👥'
};

class SlackBlockKitBuilder {
  constructor(appUrl) {
    this.appUrl = appUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  }

  /**
   * Create a divider block
   */
  divider() {
    return { type: 'divider' };
  }

  /**
   * Create a section with text
   */
  section(text, accessory = null) {
    const block = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text
      }
    };
    if (accessory) {
      block.accessory = accessory;
    }
    return block;
  }

  /**
   * Create a header block
   */
  header(text) {
    return {
      type: 'header',
      text: {
        type: 'plain_text',
        text: text.substring(0, 150),
        emoji: true
      }
    };
  }

  /**
   * Create context block with multiple elements
   */
  context(elements) {
    return {
      type: 'context',
      elements: elements.map(el => {
        if (typeof el === 'string') {
          return { type: 'mrkdwn', text: el };
        }
        if (el.type === 'image') {
          return el;
        }
        return { type: 'mrkdwn', text: el.text || el };
      })
    };
  }

  /**
   * Create an actions block with buttons
   */
  actions(actionId, buttons) {
    return {
      type: 'actions',
      block_id: actionId,
      elements: buttons
    };
  }

  /**
   * Create a button element
   */
  button(text, actionId, value, style = null, url = null) {
    const btn = {
      type: 'button',
      text: {
        type: 'plain_text',
        text: text.substring(0, 75),
        emoji: true
      },
      action_id: actionId,
      value: value || actionId
    };
    
    if (style && ['primary', 'danger'].includes(style)) {
      btn.style = style;
    }
    if (url) {
      btn.url = url;
    }
    return btn;
  }

  /**
   * Create a link button
   */
  linkButton(text, url, actionId = 'link_button') {
    return {
      type: 'button',
      text: {
        type: 'plain_text',
        text: text.substring(0, 75),
        emoji: true
      },
      action_id: actionId,
      url
    };
  }

  /**
   * Create an overflow menu
   */
  overflowMenu(actionId, options) {
    return {
      type: 'overflow',
      action_id: actionId,
      options: options.map(opt => ({
        text: {
          type: 'plain_text',
          text: opt.text,
          emoji: true
        },
        value: opt.value
      }))
    };
  }

  /**
   * Create a static select element
   */
  staticSelect(actionId, placeholder, options, initialOption = null) {
    const select = {
      type: 'static_select',
      action_id: actionId,
      placeholder: {
        type: 'plain_text',
        text: placeholder,
        emoji: true
      },
      options: options.map(opt => ({
        text: {
          type: 'plain_text',
          text: opt.text,
          emoji: true
        },
        value: opt.value
      }))
    };
    
    if (initialOption) {
      select.initial_option = {
        text: {
          type: 'plain_text',
          text: initialOption.text,
          emoji: true
        },
        value: initialOption.value
      };
    }
    
    return select;
  }

  /**
   * Create user mention
   */
  userMention(slackUserId) {
    return `<@${slackUserId}>`;
  }

  /**
   * Create a link
   */
  link(text, url) {
    return `<${url}|${text}>`;
  }

  /**
   * Format date/time
   */
  formatDate(date, format = '{date_short} at {time}') {
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    return `<!date^${timestamp}^${format}|${new Date(date).toLocaleString()}>`;
  }

  /**
   * Create task URL
   */
  taskUrl(cardId, boardId) {
    // Use existing project/task route which does not require departmentId
    return `${this.appUrl}/workflow/${boardId}/${cardId}`;
  }

  /**
   * Create board URL
   */
  boardUrl(boardId, departmentId) {
    // Workflow route expects deptId and projectId (boardId)
    return `${this.appUrl}/workflow/${departmentId}/${boardId}`;
  }

  /**
   * Build premium task notification
   */
  buildTaskNotification(data) {
    const {
      type,
      task,
      triggeredBy,
      board,
      priority,
      status,
      dueDate,
      assignees = [],
      subtaskInfo,
      customMessage
    } = data;

    const emoji = NOTIFICATION_EMOJI[type] || '📌';
    const priorityEmoji = priority ? PRIORITY_EMOJI[priority] || '' : '';
    const statusEmoji = status ? STATUS_EMOJI[status.toLowerCase()] || '📋' : '';

    const blocks = [];

    // Header with emoji and title
    const headerText = this.getNotificationTitle(type, task.title, triggeredBy?.name);
    blocks.push(this.header(`${emoji} ${headerText}`));

    // Task details section
    let detailsText = `*${this.link(task.title, this.taskUrl(task._id, board?._id || task.board))}*`;
    
    if (task.description) {
      const truncatedDesc = task.description.length > 150 
        ? task.description.substring(0, 147) + '...' 
        : task.description;
      detailsText += `\n${truncatedDesc}`;
    }

    blocks.push(this.section(detailsText));

    // Context info (priority, status, due date, project)
    const contextElements = [];
    
    if (board?.name) {
      contextElements.push(`📁 *Project:* ${board.name}`);
    }
    
    if (priority) {
      contextElements.push(`${priorityEmoji} *Priority:* ${priority.charAt(0).toUpperCase() + priority.slice(1)}`);
    }
    
    if (status) {
      contextElements.push(`${statusEmoji} *Status:* ${status}`);
    }
    
    if (dueDate) {
      const isOverdue = new Date(dueDate) < new Date();
      const dueDateText = isOverdue ? '🚨 *Overdue:*' : '📅 *Due:*';
      contextElements.push(`${dueDateText} ${this.formatDate(dueDate)}`);
    }

    if (contextElements.length > 0) {
      blocks.push(this.context(contextElements));
    }

    // Triggered by section
    if (triggeredBy) {
      blocks.push(this.context([
        triggeredBy.avatar 
          ? { type: 'image', image_url: triggeredBy.avatar, alt_text: triggeredBy.name }
          : `👤`,
        `*${triggeredBy.name}* ${this.getActionVerb(type)}`
      ]));
    }

    // Assignees section
    if (assignees.length > 0) {
      const assigneeText = assignees.map(a => 
        a.slackUserId ? this.userMention(a.slackUserId) : a.name
      ).join(', ');
      blocks.push(this.context([`👥 *Assigned to:* ${assigneeText}`]));
    }

    // Subtask info if relevant
    if (subtaskInfo) {
      blocks.push(this.context([
        `📊 *Subtasks:* ${subtaskInfo.completed}/${subtaskInfo.total} completed`
      ]));
    }

    // Custom message
    if (customMessage) {
      blocks.push(this.divider());
      blocks.push(this.section(`💬 ${customMessage}`));
    }

    blocks.push(this.divider());

    // Action buttons
    const actionButtons = this.getTaskActionButtons(type, task, board);
    if (actionButtons.length > 0) {
      blocks.push(this.actions(`task_actions_${task._id}`, actionButtons));
    }

    return {
      blocks,
      text: headerText, // Fallback text
      attachments: [{
        color: priority ? PRIORITY_COLORS[priority] : '#6366f1',
        blocks: []
      }]
    };
  }

  /**
   * Build task completion celebration message
   */
  buildTaskCompletionCelebration(data) {
    const { task, completedBy, board, stats } = data;
    
    const celebrations = [
      '🎉 Great work!',
      '🌟 Excellent job!',
      '💪 Well done!',
      '🚀 Task crushed!',
      '✨ Awesome work!',
      '🏆 Achievement unlocked!'
    ];
    
    const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
    
    const blocks = [
      this.header(`${celebration} Task Completed`),
      this.section(`*${task.title}* has been marked as complete!`),
      this.context([
        completedBy.avatar 
          ? { type: 'image', image_url: completedBy.avatar, alt_text: completedBy.name }
          : '👤',
        `Completed by *${completedBy.name}*`
      ])
    ];

    if (stats) {
      blocks.push(this.context([
        `📊 *Progress:* ${stats.completedTasks}/${stats.totalTasks} tasks in this project`
      ]));
    }

    blocks.push(this.divider());
    blocks.push(this.actions('completion_actions', [
      this.linkButton('📋 View Task', this.taskUrl(task._id, board._id), 'view_task'),
      this.linkButton('📁 Open Project', this.boardUrl(board._id, board?.department), 'open_project')
    ]));

    return {
      blocks,
      text: `${celebration} "${task.title}" has been completed!`
    };
  }

  /**
   * Build deadline reminder
   */
  buildDeadlineReminder(data) {
    const { task, board, dueDate, urgency } = data;
    
    let emoji, headerText, color;
    
    switch (urgency) {
      case 'overdue':
        emoji = '🚨';
        headerText = 'Task Overdue!';
        color = '#dc2626';
        break;
      case 'today':
        emoji = '⚠️';
        headerText = 'Due Today';
        color = '#f97316';
        break;
      case 'tomorrow':
        emoji = '⏰';
        headerText = 'Due Tomorrow';
        color = '#eab308';
        break;
      default:
        emoji = '📅';
        headerText = 'Deadline Approaching';
        color = '#3b82f6';
    }

    const blocks = [
      this.header(`${emoji} ${headerText}`),
      this.section(`*${this.link(task.title, this.taskUrl(task._id, board._id))}*`),
      this.context([
        `📁 *Project:* ${board.name}`,
        `📅 *Due:* ${this.formatDate(dueDate)}`
      ])
    ];

    if (urgency === 'overdue') {
      blocks.push(this.section('_Please update the task status or adjust the deadline._'));
    }

    blocks.push(this.divider());
    blocks.push(this.actions('deadline_actions', [
      this.linkButton('📋 View Task', this.taskUrl(task._id, board._id), 'view_task'),
      this.button('✅ Mark Complete', 'mark_complete', task._id.toString(), 'primary'),
      this.button('📅 Extend Deadline', 'extend_deadline', task._id.toString())
    ]));

    return {
      blocks,
      text: `${emoji} ${headerText}: "${task.title}"`,
      attachments: [{ color, blocks: [] }]
    };
  }

  /**
   * Build comment notification
   */
  buildCommentNotification(data) {
    const { comment, task, board, author, isMention, mentionedUsers = [] } = data;

    const emoji = isMention ? '📢' : '💬';
    const headerText = isMention ? 'You were mentioned' : 'New comment';

    const blocks = [
      this.header(`${emoji} ${headerText}`),
      this.section(`On *${this.link(task.title, this.taskUrl(task._id, board._id))}*`),
      this.section(`> ${comment.text.substring(0, 500)}${comment.text.length > 500 ? '...' : ''}`),
      this.context([
        author.avatar 
          ? { type: 'image', image_url: author.avatar, alt_text: author.name }
          : '👤',
        `*${author.name}* commented`
      ])
    ];

    if (mentionedUsers.length > 0) {
      const mentions = mentionedUsers.map(u => 
        u.slackUserId ? this.userMention(u.slackUserId) : u.name
      ).join(', ');
      blocks.push(this.context([`👥 *Mentioned:* ${mentions}`]));
    }

    blocks.push(this.divider());
    blocks.push(this.actions('comment_actions', [
      this.linkButton('💬 View Comment', this.taskUrl(task._id, board._id), 'view_comment'),
      this.button('↩️ Reply', 'reply_comment', JSON.stringify({ taskId: task._id, commentId: comment._id })),
      this.button('👍 Acknowledge', 'acknowledge', comment._id.toString())
    ]));

    return {
      blocks,
      text: `${emoji} ${author.name} ${isMention ? 'mentioned you in' : 'commented on'} "${task.title}"`
    };
  }

  /**
   * Build digest notification
   */
  buildDigestNotification(data) {
    const {
      period,
      user,
      stats,
      overdueTasks = [],
      dueTodayTasks = [],
      assignedTasks = [],
      completedTasks = []
    } = data;

    const periodLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Hourly';
    
    const blocks = [
      this.header(`📊 Your ${periodLabel} Summary`),
      this.section(`Hey ${user.name}! Here's what's happening with your tasks:`)
    ];

    // Stats overview
    blocks.push(this.section(
      `*📈 Overview*\n` +
      `• Tasks completed: *${stats.completed}*\n` +
      `• Tasks in progress: *${stats.inProgress}*\n` +
      `• Tasks due soon: *${stats.dueSoon}*\n` +
      `• Overdue tasks: *${stats.overdue}*`
    ));

    // Overdue tasks
    if (overdueTasks.length > 0) {
      blocks.push(this.divider());
      blocks.push(this.section('*🚨 Overdue Tasks*'));
      overdueTasks.slice(0, 5).forEach(task => {
        blocks.push(this.context([
          `• ${this.link(task.title, this.taskUrl(task._id, task.board))} - Overdue by ${task.overdueDays} days`
        ]));
      });
      if (overdueTasks.length > 5) {
        blocks.push(this.context([`_+${overdueTasks.length - 5} more overdue tasks_`]));
      }
    }

    // Due today
    if (dueTodayTasks.length > 0) {
      blocks.push(this.divider());
      blocks.push(this.section('*⏰ Due Today*'));
      dueTodayTasks.slice(0, 5).forEach(task => {
        blocks.push(this.context([
          `• ${this.link(task.title, this.taskUrl(task._id, task.board))}`
        ]));
      });
    }

    // Recently assigned
    if (assignedTasks.length > 0) {
      blocks.push(this.divider());
      blocks.push(this.section('*📌 Recently Assigned*'));
      assignedTasks.slice(0, 3).forEach(task => {
        blocks.push(this.context([
          `• ${this.link(task.title, this.taskUrl(task._id, task.board))} - ${task.board?.name || 'Unknown project'}`
        ]));
      });
    }

    // Completed (celebration)
    if (completedTasks.length > 0) {
      blocks.push(this.divider());
      blocks.push(this.section(`*🎉 Great work!* You completed *${completedTasks.length}* task(s) this ${period.replace('ly', '')}!`));
    }

    blocks.push(this.divider());
    blocks.push(this.actions('digest_actions', [
      this.linkButton('📋 My Tasks', `${this.appUrl}/tasks`, 'view_all_tasks'),
      this.button('⚙️ Digest Settings', 'digest_settings', 'open_settings')
    ]));

    return {
      blocks,
      text: `📊 Your ${periodLabel} Summary: ${stats.completed} completed, ${stats.overdue} overdue`
    };
  }

  /**
   * Build batch notification
   */
  buildBatchNotification(data) {
    const { notifications, groupedBy, timeRange } = data;
    
    const blocks = [
      this.header(`📬 ${notifications.length} Updates`),
      this.context([`Grouped notifications from the last ${timeRange}`])
    ];

    // Group by type or project
    const groups = {};
    notifications.forEach(n => {
      const key = groupedBy === 'project' ? (n.board?.name || 'Other') : n.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });

    Object.entries(groups).forEach(([groupName, items]) => {
      blocks.push(this.divider());
      const emoji = groupedBy === 'project' ? '📁' : NOTIFICATION_EMOJI[groupName] || '📌';
      blocks.push(this.section(`*${emoji} ${this.formatGroupName(groupName)}* (${items.length})`));
      
      items.slice(0, 3).forEach(item => {
        blocks.push(this.context([
          `• ${item.title} - ${item.message?.substring(0, 50) || ''}...`
        ]));
      });
      
      if (items.length > 3) {
        blocks.push(this.context([`_+${items.length - 3} more_`]));
      }
    });

    blocks.push(this.divider());
    blocks.push(this.actions('batch_actions', [
      this.linkButton('📋 View All', `${this.appUrl}/notifications`, 'view_all'),
      this.button('✅ Mark All Read', 'mark_all_read', 'batch')
    ]));

    return {
      blocks,
      text: `📬 You have ${notifications.length} new updates`
    };
  }

  /**
   * Build App Home blocks
   */
  buildAppHome(data) {
    const {
      user,
      assignedTasks = [],
      dueTodayTasks = [],
      overdueTasks = [],
      recentlyUpdated = [],
      stats = {}
    } = data;

    const blocks = [];
    const frontendUrl = this.appUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    // ═══════════════════════════════════════════════════════════════
    // HEADER SECTION
    // ═══════════════════════════════════════════════════════════════
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `👋 Welcome back, ${user?.name || 'User'}!`,
        emoji: true
      }
    });

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • Last updated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      }]
    });

    blocks.push({ type: 'divider' });

    // ═══════════════════════════════════════════════════════════════
    // STATS DASHBOARD
    // ═══════════════════════════════════════════════════════════════
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📊 Task Overview*'
      }
    });

    // Stats in fields format (2x2 grid)
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `🔴 *Overdue*\n${stats.overdue || 0} tasks`
        },
        {
          type: 'mrkdwn',
          text: `⏰ *Due Today*\n${stats.dueToday || 0} tasks`
        },
        {
          type: 'mrkdwn',
          text: `🔄 *In Progress*\n${stats.inProgress || 0} tasks`
        },
        {
          type: 'mrkdwn',
          text: `📋 *Total Active*\n${assignedTasks.length} tasks`
        }
      ]
    });

    // ═══════════════════════════════════════════════════════════════
    // OVERDUE TASKS (Critical - Show First)
    // ═══════════════════════════════════════════════════════════════
    if (overdueTasks && overdueTasks.length > 0) {
      blocks.push({ type: 'divider' });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *Overdue Tasks* (${overdueTasks.length})`
        }
      });

      overdueTasks.slice(0, 5).forEach(task => {
        if (task && task.title) {
          const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
          const daysOverdue = task.overdueDays || Math.ceil((new Date() - new Date(task.dueDate)) / (1000 * 60 * 60 * 24));
          
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*<${taskUrl}|${task.title}>*\n📁 ${task.board?.name || 'Unknown Project'} • ⚠️ ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`
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
        }
      });

      if (overdueTasks.length > 5) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_+${overdueTasks.length - 5} more overdue tasks..._`
          }]
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DUE TODAY
    // ═══════════════════════════════════════════════════════════════
    if (dueTodayTasks && dueTodayTasks.length > 0) {
      blocks.push({ type: 'divider' });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏰ *Due Today* (${dueTodayTasks.length})`
        }
      });

      dueTodayTasks.slice(0, 5).forEach(task => {
        if (task && task.title) {
          const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
          const priorityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[task.priority] || '';
          
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${priorityEmoji} *<${taskUrl}|${task.title}>*\n📁 ${task.board?.name || 'Unknown Project'}`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Done',
                emoji: true
              },
              style: 'primary',
              action_id: `complete_task_${task._id}`,
              value: task._id.toString()
            }
          });
        }
      });

      if (dueTodayTasks.length > 5) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_+${dueTodayTasks.length - 5} more due today..._`
          }]
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ALL ASSIGNED TASKS (Grouped by Status)
    // ═══════════════════════════════════════════════════════════════
    if (assignedTasks && assignedTasks.length > 0) {
      blocks.push({ type: 'divider' });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📌 *My Tasks* (${assignedTasks.length})`
        }
      });

      // Group by status
      const inProgress = assignedTasks.filter(t => t.status === 'in-progress');
      const todo = assignedTasks.filter(t => t.status === 'todo' || !t.status);
      const inReview = assignedTasks.filter(t => t.status === 'in-review');

      // In Progress Tasks
      if (inProgress.length > 0) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `*🔄 In Progress (${inProgress.length})*`
          }]
        });

        inProgress.slice(0, 3).forEach(task => {
          if (task && task.title) {
            const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
            const priorityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[task.priority] || '⚪';
            const dueDateStr = task.dueDate ? ` • 📅 ${new Date(task.dueDate).toLocaleDateString()}` : '';
            
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${priorityEmoji} *<${taskUrl}|${task.title}>*\n${task.board?.name || 'Project'}${dueDateStr}`
              },
              accessory: {
                type: 'static_select',
                action_id: `change_status_${task._id}`,
                placeholder: {
                  type: 'plain_text',
                  text: 'Status'
                },
                initial_option: {
                  text: { type: 'plain_text', text: '🔄 In Progress' },
                  value: 'in-progress'
                },
                options: [
                  { text: { type: 'plain_text', text: '📋 Todo' }, value: 'todo' },
                  { text: { type: 'plain_text', text: '🔄 In Progress' }, value: 'in-progress' },
                  { text: { type: 'plain_text', text: '👀 In Review' }, value: 'in-review' },
                  { text: { type: 'plain_text', text: '✅ Completed' }, value: 'completed' }
                ]
              }
            });
          }
        });
      }

      // Todo Tasks
      if (todo.length > 0) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `*📋 Todo (${todo.length})*`
          }]
        });

        todo.slice(0, 3).forEach(task => {
          if (task && task.title) {
            const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
            const priorityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[task.priority] || '⚪';
            
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${priorityEmoji} *<${taskUrl}|${task.title}>*\n${task.board?.name || 'Project'}`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '▶️ Start',
                  emoji: true
                },
                action_id: `start_task_${task._id}`,
                value: task._id.toString()
              }
            });
          }
        });
      }

      // In Review Tasks
      if (inReview.length > 0) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `*👀 In Review (${inReview.length})*`
          }]
        });

        inReview.slice(0, 2).forEach(task => {
          if (task && task.title) {
            const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
            
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `👀 *<${taskUrl}|${task.title}>*\n${task.board?.name || 'Project'}`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Approve',
                  emoji: true
                },
                style: 'primary',
                action_id: `complete_task_${task._id}`,
                value: task._id.toString()
              }
            });
          }
        });
      }

      // Show "more tasks" count
      const totalShown = Math.min(inProgress.length, 3) + Math.min(todo.length, 3) + Math.min(inReview.length, 2);
      if (assignedTasks.length > totalShown) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_View all ${assignedTasks.length} tasks in FlowTask →_`
          }]
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // RECENTLY UPDATED
    // ═══════════════════════════════════════════════════════════════
    if (recentlyUpdated && recentlyUpdated.length > 0) {
      blocks.push({ type: 'divider' });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔄 *Recently Updated*`
        }
      });

      const recentItems = recentlyUpdated.slice(0, 3).map(task => {
        const taskUrl = `${frontendUrl}/project/${task.board?._id || task.board}/task/${task._id}`;
        const timeAgo = this.getTimeAgo(task.updatedAt);
        return `• *<${taskUrl}|${task.title}>* - ${timeAgo}`;
      });

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: recentItems.join('\n')
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // EMPTY STATE
    // ═══════════════════════════════════════════════════════════════
    if ((!assignedTasks || assignedTasks.length === 0) && 
        (!overdueTasks || overdueTasks.length === 0) && 
        (!dueTodayTasks || dueTodayTasks.length === 0)) {
      blocks.push({ type: 'divider' });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🎉 *All caught up!*\n\nYou have no pending tasks. Time to relax or pick up something new!'
        }
      });

      blocks.push({
        type: 'image',
        image_url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
        alt_text: 'Celebration'
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // QUICK ACTIONS FOOTER
    // ═══════════════════════════════════════════════════════════════
    blocks.push({ type: 'divider' });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 All Tasks',
            emoji: true
          },
          url: `${frontendUrl}/list-view`,
          action_id: 'view_all_tasks'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📁 Projects',
            emoji: true
          },
          url: `${frontendUrl}/`,
          action_id: 'view_projects'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '➕ Create Task',
            emoji: true
          },
          style: 'primary',
          action_id: 'create_task_modal'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh',
            emoji: true
          },
          action_id: 'refresh_home'
        }
      ]
    });

    // Footer with preferences link
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `🔔 Notifications enabled • <${frontendUrl}/settings/integrations/slack|⚙️ Settings>`
      }]
    });

    return {
      type: 'home',
      blocks
    };
  }

  /**
   * Helper: Get human-readable time ago string
   */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * Build modal for task creation
   */
  buildTaskCreationModal(data = {}) {
    return {
      type: 'modal',
      callback_id: 'create_task_modal',
      title: {
        type: 'plain_text',
        text: '📝 Create New Task',
        emoji: true
      },
      submit: {
        type: 'plain_text',
        text: 'Create',
        emoji: true
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true
      },
      blocks: [
        {
          type: 'input',
          block_id: 'task_title',
          element: {
            type: 'plain_text_input',
            action_id: 'title_input',
            placeholder: {
              type: 'plain_text',
              text: 'Enter task title'
            }
          },
          label: {
            type: 'plain_text',
            text: 'Task Title',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'task_description',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'description_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Enter task description (optional)'
            }
          },
          label: {
            type: 'plain_text',
            text: 'Description',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'task_project',
          element: {
            type: 'external_select',
            action_id: 'project_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select a project'
            },
            min_query_length: 0
          },
          label: {
            type: 'plain_text',
            text: '📁 Project',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'task_priority',
          optional: true,
          element: {
            type: 'static_select',
            action_id: 'priority_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select priority'
            },
            options: [
              { text: { type: 'plain_text', text: '🟢 Low', emoji: true }, value: 'low' },
              { text: { type: 'plain_text', text: '🟡 Medium', emoji: true }, value: 'medium' },
              { text: { type: 'plain_text', text: '🟠 High', emoji: true }, value: 'high' },
              { text: { type: 'plain_text', text: '🔴 Critical', emoji: true }, value: 'critical' }
            ]
          },
          label: {
            type: 'plain_text',
            text: 'Priority',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'task_due_date',
          optional: true,
          element: {
            type: 'datepicker',
            action_id: 'due_date_picker',
            placeholder: {
              type: 'plain_text',
              text: 'Select due date'
            }
          },
          label: {
            type: 'plain_text',
            text: '📅 Due Date',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'task_assignees',
          optional: true,
          element: {
            type: 'multi_users_select',
            action_id: 'assignees_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select assignees'
            }
          },
          label: {
            type: 'plain_text',
            text: '👥 Assignees',
            emoji: true
          }
        }
      ]
    };
  }

  /**
   * Build status update modal
   */
  buildStatusUpdateModal(task) {
    return {
      type: 'modal',
      callback_id: 'update_status_modal',
      private_metadata: JSON.stringify({ taskId: task._id }),
      title: {
        type: 'plain_text',
        text: '🔄 Update Status',
        emoji: true
      },
      submit: {
        type: 'plain_text',
        text: 'Update',
        emoji: true
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true
      },
      blocks: [
        this.section(`*Task:* ${task.title}`),
        this.divider(),
        {
          type: 'input',
          block_id: 'new_status',
          element: {
            type: 'static_select',
            action_id: 'status_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select new status'
            },
            options: [
              { text: { type: 'plain_text', text: '📋 Todo', emoji: true }, value: 'todo' },
              { text: { type: 'plain_text', text: '🔄 In Progress', emoji: true }, value: 'in-progress' },
              { text: { type: 'plain_text', text: '👀 In Review', emoji: true }, value: 'in-review' },
              { text: { type: 'plain_text', text: '🚫 Blocked', emoji: true }, value: 'blocked' },
              { text: { type: 'plain_text', text: '✅ Completed', emoji: true }, value: 'completed' }
            ],
            initial_option: task.status ? {
              text: { type: 'plain_text', text: `${STATUS_EMOJI[task.status] || '📋'} ${task.status}`, emoji: true },
              value: task.status
            } : undefined
          },
          label: {
            type: 'plain_text',
            text: 'New Status',
            emoji: true
          }
        },
        {
          type: 'input',
          block_id: 'status_note',
          optional: true,
          element: {
            type: 'plain_text_input',
            action_id: 'note_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Add a note (optional)'
            }
          },
          label: {
            type: 'plain_text',
            text: '📝 Note',
            emoji: true
          }
        }
      ]
    };
  }

  /**
   * Build comment reply modal
   */
  buildCommentReplyModal(task, comment) {
    return {
      type: 'modal',
      callback_id: 'reply_comment_modal',
      private_metadata: JSON.stringify({ taskId: task._id, commentId: comment?._id }),
      title: {
        type: 'plain_text',
        text: '💬 Reply',
        emoji: true
      },
      submit: {
        type: 'plain_text',
        text: 'Post Reply',
        emoji: true
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
        emoji: true
      },
      blocks: [
        this.section(`*Task:* ${task.title}`),
        comment ? this.section(`> ${comment.text.substring(0, 200)}...`) : null,
        this.divider(),
        {
          type: 'input',
          block_id: 'reply_text',
          element: {
            type: 'plain_text_input',
            action_id: 'reply_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Write your reply...'
            }
          },
          label: {
            type: 'plain_text',
            text: 'Your Reply',
            emoji: true
          }
        }
      ].filter(Boolean)
    };
  }

  // Helper methods
  getNotificationTitle(type, taskTitle, userName) {
    const titles = {
      task_assigned: `Task Assigned: ${taskTitle}`,
      task_updated: `Task Updated: ${taskTitle}`,
      task_due_soon: `Deadline Approaching: ${taskTitle}`,
      task_overdue: `Task Overdue: ${taskTitle}`,
      task_created: `New Task Created: ${taskTitle}`,
      task_deleted: `Task Deleted: ${taskTitle}`,
      task_moved: `Task Moved: ${taskTitle}`,
      task_completed: `Task Completed: ${taskTitle}`,
      comment_added: `New Comment on ${taskTitle}`,
      comment_mention: `You were mentioned in ${taskTitle}`
    };
    return titles[type] || `Update: ${taskTitle}`;
  }

  getActionVerb(type) {
    const verbs = {
      task_assigned: 'assigned this task',
      task_updated: 'updated this task',
      task_created: 'created this task',
      task_deleted: 'deleted this task',
      task_completed: 'completed this task',
      task_moved: 'moved this task',
      comment_added: 'commented',
      comment_mention: 'mentioned you'
    };
    return verbs[type] || 'made changes';
  }

  getTaskActionButtons(type, task, board) {
    const buttons = [];
    const taskValue = JSON.stringify({ taskId: task._id, boardId: board?._id });

    // Always add View Task button
    buttons.push(this.linkButton('📋 View Task', this.taskUrl(task._id, board?._id || task.board), 'view_task'));

    // Context-specific buttons
    switch (type) {
      case 'task_assigned':
        buttons.push(this.button('✅ Accept', 'accept_task', taskValue, 'primary'));
        buttons.push(this.button('🔄 Start Working', 'start_task', taskValue));
        break;
      case 'task_due_soon':
      case 'task_overdue':
        buttons.push(this.button('✅ Mark Done', 'mark_complete', taskValue, 'primary'));
        buttons.push(this.button('📅 Extend', 'extend_deadline', taskValue));
        break;
      case 'task_updated':
        buttons.push(this.button('👍 Acknowledge', 'acknowledge', taskValue));
        break;
      default:
        buttons.push(this.button('✅ Mark Done', 'mark_complete', taskValue));
    }

    // Add project link if available
    if (board?._id) {
      buttons.push(this.linkButton('📁 Project', this.boardUrl(board._id, board?.department), 'open_project'));
    }

    return buttons.slice(0, 5); // Slack limit is 5 buttons per action block
  }

  formatGroupName(name) {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export default SlackBlockKitBuilder;
export { PRIORITY_COLORS, STATUS_COLORS, PRIORITY_EMOJI, STATUS_EMOJI, NOTIFICATION_EMOJI };

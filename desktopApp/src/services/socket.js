import { io } from 'socket.io-client';

const baseURL = import.meta.env.VITE_BACKEND_URL;

class SocketService {
  constructor() {
    this.socket = null;
    this.rooms = new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect(userId, token, workspaceId) {
    const nextIdentity = JSON.stringify([userId, token || localStorage.getItem('token'), workspaceId || localStorage.getItem('workspaceId')]);
    if (this.socket && this.identity !== nextIdentity) {
      const previous = JSON.parse(this.identity);
      const next = JSON.parse(nextIdentity);
      const remembered = previous[0] === next[0] && previous[2] === next[2] ? new Map(this.rooms) : new Map();
      this.disconnect();
      this.rooms = remembered;
    }
    this.identity = nextIdentity;
    if (this.socket) {
      if (import.meta.env.DEV) console.log('Socket already initialized');

      // If we're not connected but have a socket, we might want to ensure we're trying to connect
      if (!this.connected) {
        this.socket.connect();
      }
      return;
    }

    if (import.meta.env.DEV) console.log('Connecting to socket server...');

    this.socket = io(baseURL, {
      auth: {
        userId,
        token: token || localStorage.getItem('token'),
        workspaceId: workspaceId || localStorage.getItem('workspaceId')
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling']
    });

    this.socket.onAny((type, payload) => window.dispatchEvent(new CustomEvent('flowtask:realtime', { detail: { type, payload } })));
    this.setupEventListeners();
  }

  /**
   * connect() is a no-op if a socket already exists (see above) — a
   * workspace switch needs an actual re-authentication with the new
   * workspaceId, not another connect() call on the same socket, so this
   * explicitly disconnects first.
   */
  switchWorkspace(userId, token, workspaceId) {
    this.disconnect();
    this.connect(userId, token, workspaceId);
  }

  setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('realtime-recover', () => window.dispatchEvent(new Event('socket-connected')));
    this.socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected successfully');
      this.connected = true;
      this.reconnectAttempts = 0;

      for (const [event, value] of this.rooms) this.socket.emit(event.split('|')[0], value);
      // Dispatch custom event for connection
      window.dispatchEvent(new CustomEvent('socket-connected'));
    });

    this.socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('Socket disconnected:', reason);
      this.connected = false;

      // Dispatch custom event for disconnection
      window.dispatchEvent(new CustomEvent('socket-disconnected', { detail: reason }));
      // Access updates deliberately disconnect old rooms. Socket.IO does not
      // automatically reconnect a server-disconnected socket; reauthenticate
      // it so subsequent leave/department updates continue without a login.
      if (reason === 'io server disconnect') this.socket?.connect();
    });

    this.socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      if (/Invalid or expired token|Authentication required|Invalid token payload/.test(error.message)) {
        window.dispatchEvent(new Event('socket-auth-expired'));
      } else if (/Not a member|Inactive account or workspace/.test(error.message)) {
        this.rooms.clear();
        window.dispatchEvent(new Event('socket-workspace-rejected'));
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (import.meta.env.DEV) console.error('Max reconnection attempts reached');
        window.dispatchEvent(new CustomEvent('socket-connection-failed'));
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      if (import.meta.env.DEV) console.log('Socket reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
    });

    // Real-time data events
    this.socket.on('card-updated', (data) => {
      if (import.meta.env.DEV) console.log('Card updated:', data);
      window.dispatchEvent(new CustomEvent('socket-card-updated', { detail: data }));
    });

    this.socket.on('card-created', (data) => {
      if (import.meta.env.DEV) console.log('Card created:', data);
      window.dispatchEvent(new CustomEvent('socket-card-created', { detail: data }));
    });

    this.socket.on('card-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Card deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-card-deleted', { detail: data }));
    });

    this.socket.on('card-moved', (data) => {
      if (import.meta.env.DEV) console.log('Card moved:', data);
      window.dispatchEvent(new CustomEvent('socket-card-moved', { detail: data }));
    });

    // Copy/Move cross-board events
    this.socket.on('task-copied', (data) => {
      if (import.meta.env.DEV) console.log('Task copied:', data);
      window.dispatchEvent(new CustomEvent('socket-task-copied', { detail: data }));
    });

    this.socket.on('task-moved-cross', (data) => {
      if (import.meta.env.DEV) console.log('Task moved cross-board:', data);
      window.dispatchEvent(new CustomEvent('socket-task-moved-cross', { detail: data }));
    });

    this.socket.on('comment-added', (data) => {
      if (import.meta.env.DEV) console.log('Comment added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-added', { detail: data }));
    });

    this.socket.on('comment-updated', (data) => {
      if (import.meta.env.DEV) console.log('Comment updated:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-updated', { detail: data }));
    });

    this.socket.on('comment-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Comment deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-deleted', { detail: data }));
    });

    // New comment events
    this.socket.on('comment-reaction-added', (data) => {
      if (import.meta.env.DEV) console.log('Comment reaction added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reaction-added', { detail: data }));
    });

    this.socket.on('comment-reaction-removed', (data) => {
      if (import.meta.env.DEV) console.log('Comment reaction removed:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reaction-removed', { detail: data }));
    });

    this.socket.on('comment-pinned', (data) => {
      if (import.meta.env.DEV) console.log('Comment pinned:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-pinned', { detail: data }));
    });

    this.socket.on('comment-unpinned', (data) => {
      if (import.meta.env.DEV) console.log('Comment unpinned:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-unpinned', { detail: data }));
    });

    this.socket.on('comment-reply-added', (data) => {
      if (import.meta.env.DEV) console.log('Comment reply added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reply-added', { detail: data }));
    });

    this.socket.on('hierarchy-subtask-changed', (data) => {
      if (import.meta.env.DEV) console.log('Subtask hierarchy changed:', data);
      window.dispatchEvent(new CustomEvent('socket-subtask-hierarchy', { detail: data }));
    });

    this.socket.on('hierarchy-nano-changed', (data) => {
      if (import.meta.env.DEV) console.log('Subtask-Nano hierarchy changed:', data);
      window.dispatchEvent(new CustomEvent('socket-nano-hierarchy', { detail: data }));
    });

    this.socket.on('card-cover-updated', (data) => {
      if (import.meta.env.DEV) console.log('Card cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-card-cover-updated', { detail: data }));
    });

    this.socket.on('subtask-cover-updated', (data) => {
      if (import.meta.env.DEV) console.log('Subtask cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-subtask-cover-updated', { detail: data }));
    });

    this.socket.on('nanoSubtask-cover-updated', (data) => {
      if (import.meta.env.DEV) console.log('Nano-Subtask cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-nano-cover-updated', { detail: data }));
    });

    // Recurring task events
    this.socket.on('recurrence-created', (data) => {
      if (import.meta.env.DEV) console.log('Recurrence created:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-created', { detail: data }));
    });

    this.socket.on('recurrence-updated', (data) => {
      if (import.meta.env.DEV) console.log('Recurrence updated:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-updated', { detail: data }));
    });

    this.socket.on('recurrence-stopped', (data) => {
      if (import.meta.env.DEV) console.log('Recurrence stopped:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-stopped', { detail: data }));
    });

    this.socket.on('recurrence-triggered', (data) => {
      if (import.meta.env.DEV) console.log('Recurrence triggered:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-triggered', { detail: data }));
    });

    this.socket.on('attachment-added', (data) => {
      if (import.meta.env.DEV) console.log('Attachment added:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-added', { detail: data }));
    });

    this.socket.on('attachment-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Attachment deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-deleted', { detail: data }));
    });

    this.socket.on('attachment-restored', (data) => {
      if (import.meta.env.DEV) console.log('Attachment restored:', data);
      // Reuse the same consumer path as added
      window.dispatchEvent(new CustomEvent('socket-attachment-added', { detail: data }));
    });

    this.socket.on('attachment-permanently-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Attachment permanently deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-permanently-deleted', { detail: data }));
    });

    this.socket.on('time-logged', (data) => {
      if (import.meta.env.DEV) console.log('Time logged:', data);
      window.dispatchEvent(new CustomEvent('socket-time-logged', { detail: data }));
    });

    this.socket.on('estimation-updated', (data) => {
      if (import.meta.env.DEV) console.log('Estimation updated:', data);
      window.dispatchEvent(new CustomEvent('socket-estimation-updated', { detail: data }));
    });

    this.socket.on('list-created', (data) => {
      if (import.meta.env.DEV) console.log('List created:', data);
      window.dispatchEvent(new CustomEvent('socket-list-created', { detail: data }));
    });

    this.socket.on('list-updated', (data) => {
      if (import.meta.env.DEV) console.log('List updated:', data);
      window.dispatchEvent(new CustomEvent('socket-list-updated', { detail: data }));
    });

    this.socket.on('list-deleted', (data) => {
      if (import.meta.env.DEV) console.log('List deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-list-deleted', { detail: data }));
    });

    this.socket.on('board-updated', (data) => {
      if (import.meta.env.DEV) console.log('Board updated:', data);
      window.dispatchEvent(new CustomEvent('socket-board-updated', { detail: data }));
    });

    // Notification events
    this.socket.on('notification-state-changed', (data) => window.dispatchEvent(new CustomEvent('socket-notification-state-changed', { detail: data })));
    this.socket.on('notification', (data) => {
      if (import.meta.env.DEV) console.log('New notification:', data);
      window.dispatchEvent(new CustomEvent('socket-notification', { detail: data }));
    });

    this.socket.on('task-assigned', (data) => {
      if (import.meta.env.DEV) console.log('Task assigned:', data);
      window.dispatchEvent(new CustomEvent('socket-task-assigned', { detail: data }));
    });

    // User verification events
    this.socket.on('user-verified', (data) => {
      if (import.meta.env.DEV) console.log('User verified:', data);
      window.dispatchEvent(new CustomEvent('socket-user-verified', { detail: data }));
    });

    // User role change events
    this.socket.on('user-role-changed', (data) => {
      if (import.meta.env.DEV) console.log('User role changed:', data);
      window.dispatchEvent(new CustomEvent('socket-user-role-changed', { detail: data }));
    });

    // Access permission updated (SaaS access control)
    this.socket.on('user:access-updated', (data) => {
      if (import.meta.env.DEV) console.log('User access permissions updated:', data);
      window.dispatchEvent(new CustomEvent('socket-user-access-updated', { detail: data }));
    });

    // Project-level access changed via task/subtask/nano-subtask assignment
    this.socket.on('user:project-access-changed', (data) => {
      window.dispatchEvent(new CustomEvent('socket-user-project-access-changed', { detail: data }));
    });

    // Department assignment events
    this.socket.on('user-assigned', (data) => {
      if (import.meta.env.DEV) console.log('User assigned to department:', data);
      window.dispatchEvent(new CustomEvent('socket-user-assigned', { detail: data }));
    });

    this.socket.on('user-unassigned', (data) => {
      if (import.meta.env.DEV) console.log('User unassigned from department:', data);
      window.dispatchEvent(new CustomEvent('socket-user-unassigned', { detail: data }));
    });

    // Bulk department assignment events
    this.socket.on('department-bulk-assigned', (data) => {
      if (import.meta.env.DEV) console.log('Bulk users assigned to department:', data);
      window.dispatchEvent(new CustomEvent('socket-department-bulk-assigned', { detail: data }));
    });

    this.socket.on('department-bulk-unassigned', (data) => {
      if (import.meta.env.DEV) console.log('Bulk users unassigned from department:', data);
      window.dispatchEvent(new CustomEvent('socket-department-bulk-unassigned', { detail: data }));
    });

    // Avatar update event
    this.socket.on('avatar-updated', (data) => {
      if (import.meta.env.DEV) console.log('Avatar updated:', data);
      window.dispatchEvent(new CustomEvent('socket-avatar-updated', { detail: data }));
    });

    // Workspace icon update event — lets every member's switcher update
    // live without a refresh, per the branding requirement.
    this.socket.on('workspace-icon-updated', (data) => {
      if (import.meta.env.DEV) console.log('Workspace icon updated:', data);
      window.dispatchEvent(new CustomEvent('socket-workspace-icon-updated', { detail: data }));
    });

    this.socket.on('workspace-updated', (data) => {
      if (import.meta.env.DEV) console.log('Workspace metadata updated:', data);
      window.dispatchEvent(new CustomEvent('socket-workspace-updated', { detail: data }));
    });

    // Fired when this user is added/restored to a workspace from another
    // session (HR Panel add-member, invite accept) — refreshes their
    // switcher's workspace list live, no logout/refresh required.
    this.socket.on('workspace-membership-added', (data) => {
      if (import.meta.env.DEV) console.log('Workspace membership added:', data);
      window.dispatchEvent(new CustomEvent('socket-workspace-membership-added', { detail: data }));
    });

    // Fired on a self-serve upgrade/downgrade or a Super Admin billing
    // change (entitlementService.js#notifyWorkspacePlanUpdated) — lets
    // Open Chat become available/hidden live, no logout/login required.
    this.socket.on('workspace-plan-updated', (data) => {
      if (import.meta.env.DEV) console.log('Workspace plan updated:', data);
      window.dispatchEvent(new CustomEvent('socket-workspace-plan-updated', { detail: data }));
    });

    // Finance page events - for real-time finance updates
    this.socket.on('finance:page:pending', (data) => {
      if (import.meta.env.DEV) console.log('Finance page pending approval:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-pending', { detail: data }));
    });

    this.socket.on('finance:page:published', (data) => {
      if (import.meta.env.DEV) console.log('Finance page published:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-published', { detail: data }));
    });

    this.socket.on('finance:page:status-changed', (data) => {
      if (import.meta.env.DEV) console.log('Finance page status changed:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-status', { detail: data }));
    });

    this.socket.on('finance:page:updated', (data) => {
      if (import.meta.env.DEV) console.log('Finance page updated:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-updated', { detail: data }));
    });

    this.socket.on('finance:page:deleted', (data) => {
      if (import.meta.env.DEV) console.log('Finance page deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-deleted', { detail: data }));
    });

    // Finance data refresh event (for real-time data changes)
    this.socket.on('finance:data:refresh', (data) => {
      if (import.meta.env.DEV) console.log('Finance data refresh:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-refresh', { detail: data }));
    });

    // Finance permissions update (admin changed access for a user)
    this.socket.on('finance:permissions:updated', (data) => {
      if (import.meta.env.DEV) console.log('Finance permissions updated via socket:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-permissions-updated', { detail: data }));
    });

    // My Shortcuts real-time events
    this.socket.on('my-shortcuts:summary-updated', (data) => {
      if (import.meta.env.DEV) console.log('My Shortcuts summary updated:', data);
      window.dispatchEvent(new CustomEvent('socket-my-shortcuts-summary', { detail: data }));
    });

    this.socket.on('my-shortcuts:new-activity', (data) => {
      if (import.meta.env.DEV) console.log('My Shortcuts new activity:', data);
      window.dispatchEvent(new CustomEvent('socket-my-shortcuts-activity', { detail: data }));
    });

    this.socket.on('my-shortcuts:task-count-changed', (data) => {
      if (import.meta.env.DEV) console.log('My Shortcuts task count changed:', data);
      window.dispatchEvent(new CustomEvent('socket-my-shortcuts-task-count', { detail: data }));
    });

    this.socket.on('my-shortcuts:time-logged', (data) => {
      if (import.meta.env.DEV) console.log('My Shortcuts time logged:', data);
      window.dispatchEvent(new CustomEvent('socket-my-shortcuts-time', { detail: data }));
    });

    this.socket.on('my-shortcuts:announcement', (data) => {
      if (import.meta.env.DEV) console.log('My Shortcuts announcement:', data);
      window.dispatchEvent(new CustomEvent('socket-my-shortcuts-announcement', { detail: data }));
    });

    // Sales real-time events
    this.socket.on('sales:row:created', (data) => {
      if (import.meta.env.DEV) console.log('Sales row created:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-row-created', { detail: data }));
    });

    this.socket.on('sales:row:updated', (data) => {
      if (import.meta.env.DEV) console.log('Sales row updated:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-row-updated', { detail: data }));
    });

    this.socket.on('sales:row:deleted', (data) => {
      if (import.meta.env.DEV) console.log('Sales row deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-row-deleted', { detail: data }));
    });

    this.socket.on('sales:rows:bulk-updated', (data) => {
      if (import.meta.env.DEV) console.log('Sales rows bulk updated:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-rows-bulk-updated', { detail: data }));
    });

    this.socket.on('sales:rows:bulk-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Sales rows bulk deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-rows-bulk-deleted', { detail: data }));
    });

    this.socket.on('sales:row:locked', (data) => {
      if (import.meta.env.DEV) console.log('Sales row locked:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-row-locked', { detail: data }));
    });

    this.socket.on('sales:row:unlocked', (data) => {
      if (import.meta.env.DEV) console.log('Sales row unlocked:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-row-unlocked', { detail: data }));
    });

    this.socket.on('sales:dropdown:updated', (data) => {
      if (import.meta.env.DEV) console.log('Sales dropdown updated:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-dropdown-updated', { detail: data }));
    });

    this.socket.on('sales:column:created', (data) => {
      if (import.meta.env.DEV) console.log('Sales column created:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-column-created', { detail: data }));
    });

    this.socket.on('sales:column:deleted', (data) => {
      if (import.meta.env.DEV) console.log('Sales column deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-column-deleted', { detail: data }));
    });

    this.socket.on('sales:rows:imported', (data) => {
      if (import.meta.env.DEV) console.log('Sales rows imported:', data);
      window.dispatchEvent(new CustomEvent('socket-sales-rows-imported', { detail: data }));
    });
    
    // Unified access-control update (admin changed any resource override,
    // via the centralized Access & Permissions engine)
    this.socket.on('access-control:updated', (data) => {
      if (import.meta.env.DEV) console.log('Access control updated via socket:', data);
      window.dispatchEvent(new CustomEvent('socket-access-control-updated', { detail: data }));
    });
    this.socket.on('authz:changed', (data) => {
      window.dispatchEvent(new CustomEvent('socket-authz-changed', { detail: data }));
    });

    // Sales permissions update (admin changed access for a user)
    this.socket.on('sales:permissions:updated', (data) => {
      if (import.meta.env.DEV) console.log('Sales permissions updated via socket:', data);
      // Dispatch both socket-prefixed and generic event to support components listening for either
      window.dispatchEvent(new CustomEvent('socket-sales-permissions-updated', { detail: data }));

    });

    // Sales Tab events
    this.socket.on('sales:tab:created', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-created', { detail: data }));
    });
    this.socket.on('sales:tab:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-updated', { detail: data }));
    });
    this.socket.on('sales:tab:deleted', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-deleted', { detail: data }));
    });
    this.socket.on('sales:tab:approved', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-approved', { detail: data }));
    });
    this.socket.on('sales:tab:ignored', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-ignored', { detail: data }));
    });
    this.socket.on('sales:tab:alert', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-alert', { detail: data }));
    });
    this.socket.on('sales:tab:unread-update', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-unread-update', { detail: data }));
    });
    this.socket.on('sales:tab:approval-pending', (data) => {
      window.dispatchEvent(new CustomEvent('socket-sales-tab-approval-pending', { detail: data }));
    });

    // Leave events
    this.socket.on('leave:request:created', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-request-created', { detail: data }));
    });
    this.socket.on('leave:request:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-request-updated', { detail: data }));
    });
    this.socket.on('leave:approval:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-approval-updated', { detail: data }));
    });
    this.socket.on('leave:balance:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-balance-updated', { detail: data }));
    });
    this.socket.on('leave:policy:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-policy-updated', { detail: data }));
    });
    this.socket.on('leave:calendar:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-leave-calendar-updated', { detail: data }));
    });

    this.socket.on('attendance:checked-in', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-checked-in', { detail: data }));
    });
    this.socket.on('attendance:checked-out', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-checked-out', { detail: data }));
    });
    this.socket.on('attendance:updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-updated', { detail: data }));
    });
    this.socket.on('attendance:wfh-requested', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-wfh-requested', { detail: data }));
    });
    this.socket.on('attendance:wfh-decided', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-wfh-decided', { detail: data }));
    });
    this.socket.on('attendance:regularization-requested', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-regularization-requested', { detail: data }));
    });
    this.socket.on('attendance:regularization-decided', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-regularization-decided', { detail: data }));
    });
    this.socket.on('attendance:work-mode-override-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-work-mode-override-updated', { detail: data }));
    });
    this.socket.on('attendance:office-hours-override-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-office-hours-override-updated', { detail: data }));
    });
    this.socket.on('attendance:policy-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-policy-updated', { detail: data }));
    });
    this.socket.on('attendance:locations-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-attendance-locations-updated', { detail: data }));
    });

    // Announcement events
    this.socket.on('announcement-created', (data) => {
      if (import.meta.env.DEV) console.log('Announcement created:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-created', { detail: data }));
    });

    this.socket.on('announcement-updated', (data) => {
      if (import.meta.env.DEV) console.log('Announcement updated:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-updated', { detail: data }));
    });

    this.socket.on('announcement-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Announcement deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-deleted', { detail: data }));
    });

    this.socket.on('announcement-archived', (data) => {
      if (import.meta.env.DEV) console.log('Announcement archived:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-archived', { detail: data }));
    });

    this.socket.on('announcement-comment-added', (data) => {
      if (import.meta.env.DEV) console.log('Announcement comment added:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-comment-added', { detail: data }));
    });

    this.socket.on('announcement-comment-deleted', (data) => {
      if (import.meta.env.DEV) console.log('Announcement comment deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-comment-deleted', { detail: data }));
    });

    this.socket.on('announcement-reaction-added', (data) => {
      if (import.meta.env.DEV) console.log('Announcement reaction added:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-reaction-added', { detail: data }));
    });

    this.socket.on('announcement-reaction-removed', (data) => {
      if (import.meta.env.DEV) console.log('Announcement reaction removed:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-reaction-removed', { detail: data }));
    });

    this.socket.on('announcement-pin-toggled', (data) => {
      if (import.meta.env.DEV) console.log('Announcement pin toggled:', data);
      window.dispatchEvent(new CustomEvent('socket-announcement-pin-toggled', { detail: data }));
    });

    // Join Request events — Approval Dashboard. The server only ever emits
    // these to the personal room of a socket it has already verified holds
    // canApproveJoinRequests in the request's workspace (see
    // realtime/emitters.js#emitJoinRequestCreated/Approved/Rejected), so
    // every socket that receives one is already authorized for it — no
    // additional client-side permission check is needed before dispatching.
    this.socket.on('join-request:created', (data) => {
      window.dispatchEvent(new CustomEvent('socket-join-request-created', { detail: data }));
    });

    this.socket.on('join-request:approved', (data) => {
      window.dispatchEvent(new CustomEvent('socket-join-request-approved', { detail: data }));
    });

    this.socket.on('join-request:rejected', (data) => {
      window.dispatchEvent(new CustomEvent('socket-join-request-rejected', { detail: data }));
    });

    // Super Admin Dashboard events — "core events" real-time scope only
    // (workspace status changes + the platform audit log). Only ever fire
    // for a socket the server itself verified as isSuperAdmin; a non-super-admin
    // socket simply never joins the platform-admin room, so these listeners
    // are inert no-ops for everyone else.
    this.socket.on('super-admin:workspace:status-changed', (data) => {
      window.dispatchEvent(new CustomEvent('socket-super-admin-workspace-status-changed', { detail: data }));
    });

    this.socket.on('super-admin:audit-log:created', (data) => {
      window.dispatchEvent(new CustomEvent('socket-super-admin-audit-log-created', { detail: data }));
    });
  }

  disconnect() {
    this.rooms.clear();
    if (this.socket) {
      if (import.meta.env.DEV) console.log('Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  subscribeRoom(event, value) {
    this.rooms.set(event + '|' + (value || ''), value);
    if (this.socket?.connected) this.socket.emit(event, value);
  }
  unsubscribeRoom(event, value) {
    this.rooms.delete(event.replace('leave-', 'join-') + '|' + (value || ''));
    if (this.socket?.connected) this.socket.emit(event, value);
  }
  // Room management
  joinBoard(boardId) {
    this.subscribeRoom('join-board', boardId);
  }

  leaveBoard(boardId) {
    this.unsubscribeRoom('leave-board', boardId);
  }

  joinRoom(roomId) {
    this.subscribeRoom('join-room', roomId);
  }

  leaveRoom(roomId) {
    this.unsubscribeRoom('leave-room', roomId);
  }

  // Finance room management
  joinFinance() {
    this.subscribeRoom('join-finance');
  }

  leaveFinance() {
    this.unsubscribeRoom('leave-finance');
  }

  // My Shortcuts room management
  joinMyShortcuts() {
    this.subscribeRoom('join-my-shortcuts');
  }

  leaveMyShortcuts() {
    this.unsubscribeRoom('leave-my-shortcuts');
  }

  // Announcement room management
  joinAnnouncements() {
    this.subscribeRoom('join-announcements');
  }

  leaveAnnouncements() {
    this.unsubscribeRoom('leave-announcements');
  }

  // Super Admin room management
  joinSuperAdmin() {
    this.subscribeRoom('join-super-admin');
  }

  leaveSuperAdmin() {
    this.unsubscribeRoom('leave-super-admin');
  }

  // Sales room management
  joinSales() {
    this.subscribeRoom('join-sales');
  }

  leaveSales() {
    this.unsubscribeRoom('leave-sales');
  }

  // Emit events
  emitCardUpdate(cardId, updates) {
    if (this.socket && this.connected) {
      this.socket.emit('update-card', { cardId, updates });
    }
  }

  emitCardMove(cardId, sourceListId, destinationListId, newPosition) {
    if (this.socket && this.connected) {
      this.socket.emit('move-card', { 
        cardId, 
        sourceListId, 
        destinationListId, 
        newPosition 
      });
    }
  }

  emitCommentAdded(cardId, comment) {
    if (this.socket && this.connected) {
      this.socket.emit('add-comment', { cardId, comment });
    }
  }

  emitListUpdate(listId, updates) {
    if (this.socket && this.connected) {
      this.socket.emit('update-list', { listId, updates });
    }
  }

  emitBoardUpdate(boardId, updates) {
    if (this.socket && this.connected) {
      this.socket.emit('update-board', { boardId, updates });
    }
  }

  // Typing indicators
  startTyping(cardId, userId, userName) {
    if (this.socket && this.connected) {
      this.socket.emit('typing-start', { cardId, userId, userName });
    }
  }

  stopTyping(cardId, userId) {
    if (this.socket && this.connected) {
      this.socket.emit('typing-stop', { cardId, userId });
    }
  }

  // Online status
  getUsersOnline(boardId) {
    if (this.socket && this.connected) {
      return new Promise((resolve) => {
        this.socket.emit('get-users-online', boardId, (users) => {
          resolve(users);
        });
      });
    }
    return Promise.resolve([]);
  }

  // Utility methods
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  getSocket() {
    return this.socket;
  }
}

const socketService = new SocketService();
export default socketService;

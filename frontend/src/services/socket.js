import { io } from 'socket.io-client';

const baseURL = import.meta.env.VITE_BACKEND_URL;

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect(userId, token) {
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
        token: token || localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected successfully');
      this.connected = true;
      this.reconnectAttempts = 0;

      // Dispatch custom event for connection
      window.dispatchEvent(new CustomEvent('socket-connected'));
    });

    this.socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('Socket disconnected:', reason);
      this.connected = false;

      // Dispatch custom event for disconnection
      window.dispatchEvent(new CustomEvent('socket-disconnected', { detail: reason }));
    });

    this.socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) console.error('Socket connection error:', error);
      this.reconnectAttempts++;

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
      console.log('Card updated:', data);
      window.dispatchEvent(new CustomEvent('socket-card-updated', { detail: data }));
    });

    this.socket.on('card-created', (data) => {
      console.log('Card created:', data);
      window.dispatchEvent(new CustomEvent('socket-card-created', { detail: data }));
    });

    this.socket.on('card-deleted', (data) => {
      console.log('Card deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-card-deleted', { detail: data }));
    });

    this.socket.on('card-moved', (data) => {
      console.log('Card moved:', data);
      window.dispatchEvent(new CustomEvent('socket-card-moved', { detail: data }));
    });

    this.socket.on('comment-added', (data) => {
      console.log('Comment added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-added', { detail: data }));
    });

    this.socket.on('comment-updated', (data) => {
      console.log('Comment updated:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-updated', { detail: data }));
    });

    this.socket.on('comment-deleted', (data) => {
      console.log('Comment deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-deleted', { detail: data }));
    });

    // New comment events
    this.socket.on('comment-reaction-added', (data) => {
      console.log('Comment reaction added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reaction-added', { detail: data }));
    });

    this.socket.on('comment-reaction-removed', (data) => {
      console.log('Comment reaction removed:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reaction-removed', { detail: data }));
    });

    this.socket.on('comment-pinned', (data) => {
      console.log('Comment pinned:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-pinned', { detail: data }));
    });

    this.socket.on('comment-unpinned', (data) => {
      console.log('Comment unpinned:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-unpinned', { detail: data }));
    });

    this.socket.on('comment-reply-added', (data) => {
      console.log('Comment reply added:', data);
      window.dispatchEvent(new CustomEvent('socket-comment-reply-added', { detail: data }));
    });

    this.socket.on('hierarchy-subtask-changed', (data) => {
      console.log('Subtask hierarchy changed:', data);
      window.dispatchEvent(new CustomEvent('socket-subtask-hierarchy', { detail: data }));
    });

    this.socket.on('hierarchy-nano-changed', (data) => {
      console.log('Subtask-Nano hierarchy changed:', data);
      window.dispatchEvent(new CustomEvent('socket-nano-hierarchy', { detail: data }));
    });

    this.socket.on('card-cover-updated', (data) => {
      console.log('Card cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-card-cover-updated', { detail: data }));
    });

    this.socket.on('subtask-cover-updated', (data) => {
      console.log('Subtask cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-subtask-cover-updated', { detail: data }));
    });

    this.socket.on('nanoSubtask-cover-updated', (data) => {
      console.log('Nano-Subtask cover updated:', data);
      window.dispatchEvent(new CustomEvent('socket-nano-cover-updated', { detail: data }));
    });

    // Recurring task events
    this.socket.on('recurrence-created', (data) => {
      console.log('Recurrence created:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-created', { detail: data }));
    });

    this.socket.on('recurrence-updated', (data) => {
      console.log('Recurrence updated:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-updated', { detail: data }));
    });

    this.socket.on('recurrence-stopped', (data) => {
      console.log('Recurrence stopped:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-stopped', { detail: data }));
    });

    this.socket.on('recurrence-triggered', (data) => {
      console.log('Recurrence triggered:', data);
      window.dispatchEvent(new CustomEvent('socket-recurrence-triggered', { detail: data }));
    });

    this.socket.on('attachment-added', (data) => {
      console.log('Attachment added:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-added', { detail: data }));
    });

    this.socket.on('attachment-deleted', (data) => {
      console.log('Attachment deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-deleted', { detail: data }));
    });

    this.socket.on('attachment-restored', (data) => {
      console.log('Attachment restored:', data);
      // Reuse the same consumer path as added
      window.dispatchEvent(new CustomEvent('socket-attachment-added', { detail: data }));
    });

    this.socket.on('attachment-permanently-deleted', (data) => {
      console.log('Attachment permanently deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-attachment-permanently-deleted', { detail: data }));
    });

    this.socket.on('time-logged', (data) => {
      console.log('Time logged:', data);
      window.dispatchEvent(new CustomEvent('socket-time-logged', { detail: data }));
    });

    this.socket.on('estimation-updated', (data) => {
      console.log('Estimation updated:', data);
      window.dispatchEvent(new CustomEvent('socket-estimation-updated', { detail: data }));
    });

    this.socket.on('list-created', (data) => {
      console.log('List created:', data);
      window.dispatchEvent(new CustomEvent('socket-list-created', { detail: data }));
    });

    this.socket.on('list-updated', (data) => {
      console.log('List updated:', data);
      window.dispatchEvent(new CustomEvent('socket-list-updated', { detail: data }));
    });

    this.socket.on('list-deleted', (data) => {
      console.log('List deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-list-deleted', { detail: data }));
    });

    this.socket.on('board-updated', (data) => {
      console.log('Board updated:', data);
      window.dispatchEvent(new CustomEvent('socket-board-updated', { detail: data }));
    });

    // Notification events
    this.socket.on('notification', (data) => {
      console.log('New notification:', data);
      window.dispatchEvent(new CustomEvent('socket-notification', { detail: data }));
    });

    this.socket.on('task-assigned', (data) => {
      console.log('Task assigned:', data);
      window.dispatchEvent(new CustomEvent('socket-task-assigned', { detail: data }));
    });

    // User verification events
    this.socket.on('user-verified', (data) => {
      console.log('User verified:', data);
      window.dispatchEvent(new CustomEvent('socket-user-verified', { detail: data }));
    });

    // Department assignment events
    this.socket.on('user-assigned', (data) => {
      console.log('User assigned to department:', data);
      window.dispatchEvent(new CustomEvent('socket-user-assigned', { detail: data }));
    });

    this.socket.on('user-unassigned', (data) => {
      console.log('User unassigned from department:', data);
      window.dispatchEvent(new CustomEvent('socket-user-unassigned', { detail: data }));
    });

    // Bulk department assignment events
    this.socket.on('department-bulk-assigned', (data) => {
      console.log('Bulk users assigned to department:', data);
      window.dispatchEvent(new CustomEvent('socket-department-bulk-assigned', { detail: data }));
    });

    this.socket.on('department-bulk-unassigned', (data) => {
      console.log('Bulk users unassigned from department:', data);
      window.dispatchEvent(new CustomEvent('socket-department-bulk-unassigned', { detail: data }));
    });

    // Avatar update event
    this.socket.on('avatar-updated', (data) => {
      console.log('Avatar updated:', data);
      window.dispatchEvent(new CustomEvent('socket-avatar-updated', { detail: data }));
    });

    // Finance page events - for real-time finance updates
    this.socket.on('finance:page:pending', (data) => {
      console.log('Finance page pending approval:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-pending', { detail: data }));
    });

    this.socket.on('finance:page:published', (data) => {
      console.log('Finance page published:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-published', { detail: data }));
    });

    this.socket.on('finance:page:status-changed', (data) => {
      console.log('Finance page status changed:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-status', { detail: data }));
    });

    this.socket.on('finance:page:updated', (data) => {
      console.log('Finance page updated:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-updated', { detail: data }));
    });

    this.socket.on('finance:page:deleted', (data) => {
      console.log('Finance page deleted:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-page-deleted', { detail: data }));
    });

    // Finance data refresh event (for real-time data changes)
    this.socket.on('finance:data:refresh', (data) => {
      console.log('Finance data refresh:', data);
      window.dispatchEvent(new CustomEvent('socket-finance-refresh', { detail: data }));
    });
  }

  disconnect() {
    if (this.socket) {
      if (import.meta.env.DEV) console.log('Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // Room management
  joinBoard(boardId) {
    if (this.socket && this.connected) {
      console.log('Joining board:', boardId);
      this.socket.emit('join-board', boardId);
    }
  }

  leaveBoard(boardId) {
    if (this.socket && this.connected) {
      console.log('Leaving board:', boardId);
      this.socket.emit('leave-board', boardId);
    }
  }

  joinRoom(roomId) {
    if (this.socket && this.connected) {
      console.log('Joining room:', roomId);
      this.socket.emit('join-room', roomId);
    }
  }

  leaveRoom(roomId) {
    if (this.socket && this.connected) {
      console.log('Leaving room:', roomId);
      this.socket.emit('leave-room', roomId);
    }
  }

  // Finance room management
  joinFinance() {
    if (this.socket && this.connected) {
      console.log('Joining finance room');
      this.socket.emit('join-finance');
    }
  }

  leaveFinance() {
    if (this.socket && this.connected) {
      console.log('Leaving finance room');
      this.socket.emit('leave-finance');
    }
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
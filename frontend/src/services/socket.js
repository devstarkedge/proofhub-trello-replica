import { io } from 'socket.io-client';

const baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(userId) {
    if (this.connected) return;

    this.socket = io(baseURL, {
      auth: {
        userId,
        token: localStorage.getItem('token')
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.connected = false;
    });

    // Listen for card updates
    this.socket.on('card-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-card-updated', { detail: data }));
    });

    // Listen for new comments
    this.socket.on('comment-added', (data) => {
      window.dispatchEvent(new CustomEvent('socket-comment-added', { detail: data }));
    });

    // Listen for notifications
    this.socket.on('notification', (data) => {
      window.dispatchEvent(new CustomEvent('socket-notification', { detail: data }));
    });

    // Listen for list updates
    this.socket.on('list-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-list-updated', { detail: data }));
    });

    // Listen for board updates
    this.socket.on('board-updated', (data) => {
      window.dispatchEvent(new CustomEvent('socket-board-updated', { detail: data }));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  joinBoard(boardId) {
    if (this.socket && this.connected) {
      this.socket.emit('join-board', boardId);
    }
  }

  leaveBoard(boardId) {
    if (this.socket && this.connected) {
      this.socket.emit('leave-board', boardId);
    }
  }

  emitCardUpdate(cardId, updates) {
    if (this.socket && this.connected) {
      this.socket.emit('update-card', { cardId, updates });
    }
  }

  emitCommentAdded(cardId, comment) {
    if (this.socket && this.connected) {
      this.socket.emit('add-comment', { cardId, comment });
    }
  }
}

const socketService = new SocketService();
export default socketService;
/**
 * Socket.IO Manager
 * 
 * Initializes Socket.IO, handles authentication, room management,
 * and connection lifecycle. Extracted from server.js for modularity.
 * 
 * Usage:
 *   import socketManager from './realtime/socketManager.js';
 *   const io = socketManager.init(httpServer, config);
 *   // later: socketManager.getIO()
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { setIO } from './emitters.js';
import { ROOM } from './events.js';

let _io = null;

/**
 * Initialize Socket.IO on the given HTTP server.
 * Returns the io instance.
 */
function init(httpServer) {
  if (_io) {
    console.warn('[SocketManager] Already initialized — returning existing io instance');
    return _io;
  }

  _io = new Server(httpServer, {
    cors: {
      origin: config.allowedOrigins,
      methods: ['GET', 'POST'],
    },
    transports: config.socket.transports,
    pingTimeout: config.socket.pingTimeout,
    pingInterval: config.socket.pingInterval,
    maxHttpBufferSize: config.socket.maxHttpBufferSize,
    allowEIO3: true,
    perMessageDeflate: {
      threshold: config.socket.perMessageDeflateThreshold,
    },
  });

  // Wire up emitters module so it can reference io
  setIO(_io);

  // ─── Authentication Middleware ──────────────────────────────────────────
  _io.use((socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decodedUser = jwt.verify(token, config.jwt.secret);
      const userId = decodedUser?.id || decodedUser?._id;
      if (!userId) {
        return next(new Error('Invalid token payload'));
      }

      socket.data.user = decodedUser;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── Connection Handler ────────────────────────────────────────────────
  _io.on('connection', (socket) => {
    if (config.isDev) console.log('New socket connection attempt:', socket.id);
    if (config.isDev) console.log('Handshake auth:', socket.handshake.auth);

    const decodedUser = socket.data.user || {};
    const userId = decodedUser.id || decodedUser._id?.toString();

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // ── Auto-join rooms based on user attributes ──
    socket.join(ROOM.user(userId));

    if (decodedUser.role === 'admin') {
      socket.join(ROOM.admin);
      console.log(`Admin user ${userId} joined admin room`);
    }

    if (decodedUser.role === 'manager') {
      socket.join(ROOM.managers);
      console.log(`User ${userId} joined managers room`);
    }

    if (decodedUser.department) {
      const departments = Array.isArray(decodedUser.department)
        ? decodedUser.department
        : [decodedUser.department];
      departments.forEach((deptId) => {
        if (deptId) {
          socket.join(ROOM.department(deptId));
          if (config.isDev) console.log(`User ${userId} joined department room: department-${deptId}`);
        }
      });
    }

    console.log(`User ${userId} connected`);

    // ── Card rooms ──
    socket.on('join-card', (cardId) => {
      socket.join(ROOM.card(cardId));
      if (config.isDev) console.log(`User ${userId} joined card room: card-${cardId}`);
    });
    socket.on('leave-card', (cardId) => {
      socket.leave(ROOM.card(cardId));
      if (config.isDev) console.log(`User ${userId} left card room: card-${cardId}`);
    });

    // ── Team rooms ──
    socket.on('join-team', (teamId) => {
      socket.join(ROOM.team(teamId));
      if (config.isDev) console.log(`User ${userId} joined team ${teamId}`);
    });
    socket.on('leave-team', (teamId) => {
      socket.leave(ROOM.team(teamId));
      if (config.isDev) console.log(`User ${userId} left team ${teamId}`);
    });

    // ── Board rooms ──
    socket.on('join-board', (boardId) => {
      socket.join(ROOM.board(boardId));
      if (config.isDev) console.log(`User ${userId} joined board ${boardId}`);
    });
    socket.on('leave-board', (boardId) => {
      socket.leave(ROOM.board(boardId));
      if (config.isDev) console.log(`User ${userId} left board ${boardId}`);
    });

    // ── Client-side real-time relay ──
    socket.on('update-card', ({ cardId, updates, boardId }) => {
      _io.to(ROOM.board(boardId)).emit('card-updated', { cardId, updates });
    });
    socket.on('add-comment', ({ cardId, comment, boardId }) => {
      _io.to(ROOM.board(boardId)).emit('comment-added', { cardId, comment });
    });

    // ── Announcement rooms ──
    socket.on('join-announcements', () => {
      socket.join(ROOM.announcements);
      if (config.isDev) console.log(`User ${userId} joined announcements room`);
    });
    socket.on('leave-announcements', () => {
      socket.leave(ROOM.announcements);
      if (config.isDev) console.log(`User ${userId} left announcements room`);
    });
    socket.on('join-announcement', (announcementId) => {
      socket.join(ROOM.announcement(announcementId));
      if (config.isDev) console.log(`User ${userId} joined announcement room: announcement-${announcementId}`);
    });
    socket.on('leave-announcement', (announcementId) => {
      socket.leave(ROOM.announcement(announcementId));
      if (config.isDev) console.log(`User ${userId} left announcement room: announcement-${announcementId}`);
    });

    // ── Finance rooms ──
    socket.on('join-finance', () => {
      socket.join(ROOM.finance);
      if (config.isDev) console.log(`User ${userId} joined finance room`);
    });
    socket.on('leave-finance', () => {
      socket.leave(ROOM.finance);
      if (config.isDev) console.log(`User ${userId} left finance room`);
    });

    // ── My Shortcuts rooms ──
    socket.on('join-my-shortcuts', () => {
      socket.join(ROOM.userShortcuts(userId));
      if (config.isDev) console.log(`User ${userId} joined my-shortcuts room`);
    });
    socket.on('leave-my-shortcuts', () => {
      socket.leave(ROOM.userShortcuts(userId));
      if (config.isDev) console.log(`User ${userId} left my-shortcuts room`);
    });

    // ── Sales rooms ──
    socket.on('join-sales', () => {
      socket.join(ROOM.sales);
      if (config.isDev) console.log(`User ${userId} joined sales room`);
    });
    socket.on('leave-sales', () => {
      socket.leave(ROOM.sales);
      if (config.isDev) console.log(`User ${userId} left sales room`);
    });

    // ── Push notification subscription ──
    socket.on('subscribe-push', async (subscription) => {
      try {
        const User = (await import('../models/User.js')).default;
        await User.findByIdAndUpdate(userId, { pushSubscription: subscription });
        if (config.isDev) console.log(`User ${userId} subscribed to push notifications`);
      } catch (error) {
        if (config.isDev) console.error('Error saving push subscription:', error);
      }
    });

    socket.on('unsubscribe-push', async () => {
      try {
        const User = (await import('../models/User.js')).default;
        await User.findByIdAndUpdate(userId, { $unset: { pushSubscription: 1 } });
        if (config.isDev) console.log(`User ${userId} unsubscribed from push notifications`);
      } catch (error) {
        if (config.isDev) console.error('Error removing push subscription:', error);
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      if (config.isDev) console.log(`User ${userId} disconnected`);
    });
  });

  return _io;
}

/**
 * Get the initialized Socket.IO instance.
 */
function getIO() {
  if (!_io) {
    throw new Error('[SocketManager] Not initialized. Call init() first.');
  }
  return _io;
}

export default { init, getIO };

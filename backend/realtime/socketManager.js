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
import logger from '../utils/logger.js';
import { setIO } from './emitters.js';
import { ROOM } from './events.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

let _io = null;

/**
 * Initialize Socket.IO on the given HTTP server.
 * Returns the io instance.
 */
function init(httpServer) {
  if (_io) {
    logger.warn('SocketManager: already initialized — returning existing io instance');
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
  _io.use(async (socket, next) => {
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

      // The frontend sends its active workspace in the handshake auth
      // payload (same value it sends as the x-workspace-id header for HTTP
      // requests); fall back to the default workspace for older clients /
      // single-workspace users who never set it.
      const requestedWorkspaceId =
        socket.handshake?.auth?.workspaceId ||
        (await ensureDefaultWorkspace())?.toString();

      if (!requestedWorkspaceId) {
        return next(new Error('No workspace context available'));
      }

      const membership = await WorkspaceMembership.findOne({
        user: userId,
        workspace: requestedWorkspaceId,
        status: 'active'
      }).lean();

      if (!membership) {
        // Not a member of the requested/default workspace — before
        // rejecting, check whether this is a Super Admin (User is exempt
        // from workspaceScopePlugin, so no context is needed for this
        // lookup). A platform-level account may have no workspace
        // membership at all, so it must still be able to connect — just
        // without joining any workspace-scoped room. This is a
        // server-verified DB lookup, not a claim trusted off the JWT
        // payload — the JWT here carries only {id}, and trusting a
        // decodedUser.role-style claim is exactly the mistake that already
        // left ROOM.admin/ROOM.managers unreachable elsewhere in this file.
        const dbUser = await User.findById(userId).select('isSuperAdmin').lean();
        if (dbUser?.isSuperAdmin === true) {
          socket.data.user = decodedUser;
          socket.data.workspaceId = null;
          socket.data.isSuperAdmin = true;
          return next();
        }
        return next(new Error('Not a member of this workspace'));
      }

      socket.data.user = decodedUser;
      socket.data.workspaceId = requestedWorkspaceId;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── Connection Handler ────────────────────────────────────────────────
  _io.on('connection', (socket) => {
    if (config.isDev) logger.debug('New socket connection attempt', { socketId: socket.id });
    if (config.isDev) logger.debug('Handshake auth', { auth: socket.handshake.auth });

    const decodedUser = socket.data.user || {};
    const userId = decodedUser.id || decodedUser._id?.toString();
    const socketWorkspaceId = socket.data.workspaceId;
    const isSuperAdmin = socket.data.isSuperAdmin === true;

    if (!userId || (!socketWorkspaceId && !isSuperAdmin)) {
      socket.disconnect(true);
      return;
    }

    // ── Auto-join rooms based on user attributes ──
    socket.join(ROOM.user(userId));

    if (decodedUser.role === 'admin') {
      socket.join(ROOM.admin);
      logger.debug(`Admin user ${userId} joined admin room`);
    }

    if (decodedUser.role === 'manager') {
      socket.join(ROOM.managers);
      logger.debug(`User ${userId} joined managers room`);
    }

    if (decodedUser.department) {
      const departments = Array.isArray(decodedUser.department)
        ? decodedUser.department
        : [decodedUser.department];
      departments.forEach((deptId) => {
        if (deptId) {
          socket.join(ROOM.department(deptId));
    if (config.isDev) logger.debug(`User ${userId} joined department room: department-${deptId}`);
        }
      });
    }

    logger.debug('User connected', { userId });

    // ── Card rooms ──
    socket.on('join-card', async (cardId) => {
      try {
        await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        const Card = (await import('../models/Card.js')).default;
        const card = await Card.findById(cardId).lean();
        if (!card) {
          if (config.isDev) logger.debug(`join-card: card not found ${cardId}`);
          return;
        }

        // A stale/switched socket must not join another workspace's room —
        // the plugin already filtered the query above to this workspace,
        // so a non-null result here is already guaranteed to match, but the
        // explicit check documents the invariant and stays correct even if
        // this query is ever changed to bypass the plugin.
        if (card.workspaceId?.toString() !== socketWorkspaceId) {
          if (config.isDev) logger.debug(`join-card: workspace mismatch for card ${cardId}`);
          return;
        }

        // Allow if admin
        if (decodedUser.role === 'admin') {
          socket.join(ROOM.card(cardId));
          if (config.isDev) logger.debug(`User ${userId} joined card room (admin): card-${cardId}`);
          return;
        }

        // Direct card membership or assignee
        const userIdStr = userId.toString();
        if (Array.isArray(card.members) && card.members.map(m => m.toString()).includes(userIdStr)) {
          socket.join(ROOM.card(cardId));
          if (config.isDev) logger.debug(`User ${userId} joined card room (member): card-${cardId}`);
          return;
        }
        if (Array.isArray(card.assignees) && card.assignees.map(a => a.toString()).includes(userIdStr)) {
          socket.join(ROOM.card(cardId));
          if (config.isDev) logger.debug(`User ${userId} joined card room (assignee): card-${cardId}`);
          return;
        }

        // Fallback: check board membership/visibility
        if (card.board) {
          const Board = (await import('../models/Board.js')).default;
          const board = await Board.findById(card.board).lean();
          if (board) {
            if (board.visibility === 'public') {
              socket.join(ROOM.card(cardId));
              if (config.isDev) logger.debug(`User ${userId} joined card room (public board): card-${cardId}`);
              return;
            }
            if (board.owner?.toString() === userIdStr) {
              socket.join(ROOM.card(cardId));
              if (config.isDev) logger.debug(`User ${userId} joined card room (board owner): card-${cardId}`);
              return;
            }
            if (Array.isArray(board.members) && board.members.map(m => m.toString()).includes(userIdStr)) {
              socket.join(ROOM.card(cardId));
              if (config.isDev) logger.debug(`User ${userId} joined card room (board member): card-${cardId}`);
              return;
            }
          }
        }

        if (config.isDev) logger.debug(`join-card: user ${userId} unauthorized for card ${cardId}`);
        });
      } catch (error) {
        if (config.isDev) logger.error('join-card error', { error: error.message });
      }
    });
    socket.on('leave-card', (cardId) => {
      socket.leave(ROOM.card(cardId));
      if (config.isDev) logger.debug(`User ${userId} left card room: card-${cardId}`);
    });

    // ── Team rooms ──
    socket.on('join-team', async (teamId) => {
      try {
        await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        const Team = (await import('../models/Team.js')).default;
        const team = await Team.findById(teamId).lean();
        if (!team) {
          if (config.isDev) logger.debug(`join-team: team not found ${teamId}`);
          return;
        }

        if (team.workspaceId?.toString() !== socketWorkspaceId) {
          if (config.isDev) logger.debug(`join-team: workspace mismatch for team ${teamId}`);
          return;
        }

        // Admins or managers can join
        if (decodedUser.role === 'admin' || decodedUser.role === 'manager') {
          socket.join(ROOM.team(teamId));
          if (config.isDev) logger.debug(`User ${userId} joined team ${teamId} (privileged)`);
          return;
        }

        const userIdStr = userId.toString();
        if (Array.isArray(team.members) && team.members.map(m => m.toString()).includes(userIdStr)) {
          socket.join(ROOM.team(teamId));
          if (config.isDev) logger.debug(`User ${userId} joined team ${teamId}`);
          return;
        }

        if (config.isDev) logger.debug(`join-team: user ${userId} unauthorized for team ${teamId}`);
        });
      } catch (error) {
        if (config.isDev) logger.error('join-team error', { error: error.message });
      }
    });
    socket.on('leave-team', (teamId) => {
      socket.leave(ROOM.team(teamId));
      if (config.isDev) logger.debug(`User ${userId} left team ${teamId}`);
    });

    // ── Board rooms ──
    socket.on('join-board', async (boardId) => {
      try {
        await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        const Board = (await import('../models/Board.js')).default;
        const board = await Board.findById(boardId).lean();
        if (!board) {
          if (config.isDev) logger.debug(`join-board: board not found ${boardId}`);
          return;
        }

        if (board.workspaceId?.toString() !== socketWorkspaceId) {
          if (config.isDev) logger.debug(`join-board: workspace mismatch for board ${boardId}`);
          return;
        }

        // Admins always allowed
        if (decodedUser.role === 'admin') {
          socket.join(ROOM.board(boardId));
          if (config.isDev) logger.debug(`User ${userId} joined board ${boardId} (admin)`);
          return;
        }

        const userIdStr = userId.toString();
        if (board.visibility === 'public') {
          socket.join(ROOM.board(boardId));
          if (config.isDev) logger.debug(`User ${userId} joined board ${boardId} (public)`);
          return;
        }
        if (board.owner?.toString() === userIdStr) {
          socket.join(ROOM.board(boardId));
          if (config.isDev) logger.debug(`User ${userId} joined board ${boardId} (owner)`);
          return;
        }
        if (Array.isArray(board.members) && board.members.map(m => m.toString()).includes(userIdStr)) {
          socket.join(ROOM.board(boardId));
          if (config.isDev) logger.debug(`User ${userId} joined board ${boardId} (member)`);
          return;
        }

        if (config.isDev) logger.debug(`join-board: user ${userId} unauthorized for board ${boardId}`);
        });
      } catch (error) {
        if (config.isDev) logger.error('join-board error', { error: error.message });
      }
    });
    socket.on('leave-board', (boardId) => {
      socket.leave(ROOM.board(boardId));
      if (config.isDev) logger.debug(`User ${userId} left board ${boardId}`);
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
      if (config.isDev) logger.debug(`User ${userId} joined announcements room`);
    });
    socket.on('leave-announcements', () => {
      socket.leave(ROOM.announcements);
      if (config.isDev) logger.debug(`User ${userId} left announcements room`);
    });
    socket.on('join-announcement', (announcementId) => {
      socket.join(ROOM.announcement(announcementId));
      if (config.isDev) logger.debug(`User ${userId} joined announcement room: announcement-${announcementId}`);
    });
    socket.on('leave-announcement', (announcementId) => {
      socket.leave(ROOM.announcement(announcementId));
      if (config.isDev) logger.debug(`User ${userId} left announcement room: announcement-${announcementId}`);
    });

    // ── Finance rooms ──
    socket.on('join-finance', () => {
      socket.join(ROOM.finance(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined finance room`);
    });
    socket.on('leave-finance', () => {
      socket.leave(ROOM.finance(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left finance room`);
    });

    // ── My Shortcuts rooms ──
    socket.on('join-my-shortcuts', () => {
      socket.join(ROOM.userShortcuts(userId));
      if (config.isDev) logger.debug(`User ${userId} joined my-shortcuts room`);
    });
    socket.on('leave-my-shortcuts', () => {
      socket.leave(ROOM.userShortcuts(userId));
      if (config.isDev) logger.debug(`User ${userId} left my-shortcuts room`);
    });

    // ── Sales rooms ──
    socket.on('join-sales', () => {
      socket.join(ROOM.sales(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined sales room`);
    });
    socket.on('leave-sales', () => {
      socket.leave(ROOM.sales(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left sales room`);
    });

    // ── Super Admin room ── (explicit join-on-mount, matching Finance/Sales
    // below rather than auto-joining at connection — the dashboard is the
    // only consumer, so an idle Super Admin browsing the rest of the app
    // shouldn't receive platform events on every tab.)
    socket.on('join-super-admin', () => {
      if (isSuperAdmin) {
        socket.join(ROOM.platformAdmin);
        if (config.isDev) logger.debug(`User ${userId} joined platform-admin room`);
      }
    });
    socket.on('leave-super-admin', () => {
      socket.leave(ROOM.platformAdmin);
      if (config.isDev) logger.debug(`User ${userId} left platform-admin room`);
    });

    // ── Push notification subscription ──
    socket.on('subscribe-push', async (subscription) => {
      try {
        const { saveUserPushSubscription } = await import('../utils/pushNotification.js');
        await saveUserPushSubscription(userId, subscription || {});
        if (config.isDev) logger.debug(`User ${userId} subscribed to push notifications`);
      } catch (error) {
        if (config.isDev) logger.error('Error saving push subscription', { error: error.message });
      }
    });

    socket.on('unsubscribe-push', async () => {
      try {
        const { removeUserPushSubscription } = await import('../utils/pushNotification.js');
        await removeUserPushSubscription(userId, {});
        if (config.isDev) logger.debug(`User ${userId} unsubscribed from push notifications`);
      } catch (error) {
        if (config.isDev) logger.error('Error removing push subscription', { error: error.message });
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      if (config.isDev) logger.debug(`User ${userId} disconnected`);
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

import Workspace from '../models/Workspace.js';
import { userCanAccessEntity } from '../utils/entityAccess.js';
import { hasResourceAction } from '../modules/permissions/permissionEngine.js';
import { isSuperAdminEmailAllowed } from '../middleware/requireSuperAdmin.js';
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
      if (decodedUser.type !== 'access' || !Number.isInteger(decodedUser.tokenVersion)) return next(new Error('Invalid session'));
      socket.data.tokenExpiresAt = decodedUser.exp ? decodedUser.exp * 1000 : null;
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
        // left ROOM.admin(socketWorkspaceId)/ROOM.managers(socketWorkspaceId) unreachable elsewhere in this file.
        const dbUser = await User.findById(userId).select('isSuperAdmin isActive email tokenVersion forcePasswordChange').lean();
        if (dbUser?.isActive && !dbUser.forcePasswordChange && decodedUser.tokenVersion === (dbUser.tokenVersion || 0) && dbUser.isSuperAdmin === true && isSuperAdminEmailAllowed(dbUser.email)) {
          socket.data.user = decodedUser;
          socket.data.workspaceId = null;
          socket.data.isSuperAdmin = true;
          return next();
        }
        return next(new Error('Not a member of this workspace'));
      }

      const [account, workspace] = await Promise.all([User.findById(userId).select('isActive tokenVersion forcePasswordChange').lean(), Workspace.findById(requestedWorkspaceId).select('isActive status').lean()]);
      if (!account?.isActive || account.forcePasswordChange || decodedUser.tokenVersion !== (account.tokenVersion || 0) || !workspace?.isActive || ['suspended', 'archived'].includes(workspace.status) || membership.kind === 'guest') return next(new Error('Inactive account, session or workspace'));
      socket.data.tokenExpiresAt = decodedUser.exp ? decodedUser.exp * 1000 : null;
      socket.data.membership = membership;
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


    const decodedUser = socket.data.user || {};
    const userId = decodedUser.id || decodedUser._id?.toString();
    const socketWorkspaceId = socket.data.workspaceId;
    const isSuperAdmin = socket.data.isSuperAdmin === true;

    if (!userId || (!socketWorkspaceId && !isSuperAdmin)) {
      socket.disconnect(true);
      return;
    }

    // Roles and department rooms come from the server-resolved membership.
    const membership = socket.data.membership;
    if (socketWorkspaceId && membership) {
      socket.join(ROOM.user(userId, socketWorkspaceId));
      socket.join(ROOM.workspace(socketWorkspaceId));
      if (membership.role === 'admin') socket.join(ROOM.admin(socketWorkspaceId));
      if (membership.role === 'manager') socket.join(ROOM.managers(socketWorkspaceId));
      for (const departmentId of membership.department || []) socket.join(ROOM.department(departmentId, socketWorkspaceId));
    }

    logger.debug('User connected', { userId });

    const expiresIn = socket.data.tokenExpiresAt ? socket.data.tokenExpiresAt - Date.now() : null;
    const expiryTimer = expiresIn == null ? null : setTimeout(() => socket.disconnect(true), Math.max(0, Math.min(expiresIn, 2147483647)));
    expiryTimer?.unref();
    socket.once('disconnect', () => clearTimeout(expiryTimer));

    // ── Card rooms ──
    socket.on('join-card', async (cardId) => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      try {
        await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        if (await userCanAccessEntity({ userId, entityType: 'Card', entityId: cardId })) {
          socket.join(ROOM.card(cardId, socketWorkspaceId));
        }
        });
      } catch (error) {
        if (config.isDev) logger.error('join-card error', { error: error.message });
      }
    });
    socket.on('leave-card', (cardId) => {
      socket.leave(ROOM.card(cardId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left card room: card-${cardId}`);
    });

    // ── Team rooms ──
    socket.on('join-team', async (teamId) => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
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
        if (fresh.role === 'admin' || fresh.role === 'manager') {
          socket.join(ROOM.team(teamId, socketWorkspaceId));
          if (config.isDev) logger.debug(`User ${userId} joined team ${teamId} (privileged)`);
          return;
        }

        const userIdStr = userId.toString();
        if (Array.isArray(team.members) && team.members.map(m => m.toString()).includes(userIdStr)) {
          socket.join(ROOM.team(teamId, socketWorkspaceId));
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
      socket.leave(ROOM.team(teamId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left team ${teamId}`);
    });

    // ── Board rooms ──
    socket.on('join-board', async (boardId) => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      try {
        await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        if (await userCanAccessEntity({ userId, entityType: 'Board', entityId: boardId })) {
          socket.join(ROOM.board(boardId, socketWorkspaceId));
        }
        });
      } catch (error) {
        if (config.isDev) logger.error('join-board error', { error: error.message });
      }
    });
    socket.on('leave-board', (boardId) => {
      socket.leave(ROOM.board(boardId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left board ${boardId}`);
    });

    // ── Announcement rooms ──
    socket.on('join-announcements', async () => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      socket.join(ROOM.announcements(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined announcements room`);
    });
    socket.on('leave-announcements', () => {
      socket.leave(ROOM.announcements(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left announcements room`);
    });
    socket.on('join-announcement', async (announcementId) => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      const { default: Announcement } = await import('../models/Announcement.js');
      const { announcementAudience } = await import('../services/workspaceAudience.js');
      const permitted = await workspaceContext.run({ workspaceId: socketWorkspaceId }, async () => {
        const announcement = await Announcement.findById(announcementId).lean();
        return announcement && (String(announcement.createdBy) === String(userId) || (await announcementAudience(announcement.subscribers)).some(id => String(id) === String(userId)));
      });
      if (!permitted) return;
      socket.join(ROOM.announcement(announcementId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined announcement room: announcement-${announcementId}`);
    });
    socket.on('leave-announcement', (announcementId) => {
      socket.leave(ROOM.announcement(announcementId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left announcement room: announcement-${announcementId}`);
    });

    // ── Finance rooms ──
    socket.on('join-finance', async () => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      const permitted = await workspaceContext.run({ workspaceId: socketWorkspaceId }, () => hasResourceAction({ _id: userId, role: fresh.role, workspaceId: socketWorkspaceId }, 'finance', 'view', socketWorkspaceId));
      if (!permitted) return;
      socket.join(ROOM.finance(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined finance room`);
    });
    socket.on('leave-finance', () => {
      socket.leave(ROOM.finance(socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left finance room`);
    });

    // ── My Shortcuts rooms ──
    socket.on('join-my-shortcuts', async () => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      socket.join(ROOM.userShortcuts(userId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} joined my-shortcuts room`);
    });
    socket.on('leave-my-shortcuts', () => {
      socket.leave(ROOM.userShortcuts(userId, socketWorkspaceId));
      if (config.isDev) logger.debug(`User ${userId} left my-shortcuts room`);
    });

    // ── Sales rooms ──
    socket.on('join-sales', async () => {
      const fresh = await WorkspaceMembership.findOne({ workspace: socketWorkspaceId, user: userId, status: 'active' }).lean().catch(() => null);
      if (!fresh) { socket.disconnect(true); return; }
      const permitted = await workspaceContext.run({ workspaceId: socketWorkspaceId }, () => hasResourceAction({ _id: userId, role: fresh.role, workspaceId: socketWorkspaceId }, 'sales', 'view', socketWorkspaceId));
      if (!permitted) return;
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

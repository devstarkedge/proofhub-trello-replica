import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/auth.js';
import boardsRoutes from './routes/boards.js';
import listsRoutes from './routes/lists.js';
import cardsRoutes from './routes/cards.js';
import teamsRoutes from './routes/teams.js';
import departmentRoutes from './routes/departmentRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import analyticsRoutes from './routes/analytics.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import uploadsRoutes from './routes/uploads.js';
import subtaskRoutes from './routes/subtasks.js';
import subtaskNanoRoutes from './routes/subtaskNanos.js';
import announcementsRoutes from './routes/announcements.js';
import recurrenceRoutes from './routes/recurrence.js';
import remindersRoutes from './routes/reminders.js';
import labelsRoutes from './routes/labels.js';
import rolesRoutes from './routes/roles.js';
import attachmentsRoutes from './routes/attachments.js';
import versionsRoutes from './routes/versions.js';
import projectsRoutes from './routes/projects.js';
import slackRoutes from './routes/slack.js';
import teamAnalyticsRoutes from './routes/teamAnalytics.js';
import pmSheetRoutes from './routes/pmSheet.js';
import calendarRoutes from './routes/calendar.js';
import financeRoutes from './routes/finance.js';
import myShortcutsRoutes from './routes/myShortcuts.js';
import salesRoutes from './routes/sales.js';
import salesPermissionsRoutes from './routes/salesPermissions.js';
import projectOptionsRoutes from './routes/projectOptions.js';
import { captureRawBody } from './middleware/slackMiddleware.js';
import path from 'path';
import { errorHandler } from './middleware/errorHandler.js';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
// Allowed CORS origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://172.16.16.20:5173'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  },
  // Socket.IO optimizations for high concurrency
  transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
  pingTimeout: 60000, // 60 seconds ping timeout
  pingInterval: 25000, // 25 seconds ping interval
  maxHttpBufferSize: 1e6, // 1MB max buffer size
  allowEIO3: true, // Allow Engine.IO v3 clients
  perMessageDeflate: {
    threshold: 1024, // Compress messages over 1KB
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Capture raw body for Slack signature verification (before JSON parsing)
// Slack sends different content types: JSON for events, URL-encoded for interactive
app.use('/api/slack', express.json({ verify: captureRawBody }));
app.use('/api/slack', express.urlencoded({ extended: true, verify: captureRawBody }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Compression middleware
import compression from 'compression';
app.use(compression());


// Caching middleware - DISABLED
// import { cacheMiddleware } from './middleware/cache.js';
// app.use('/api/', cacheMiddleware(300)); // 5 minutes cache

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/subtasks', subtaskRoutes);
app.use('/api/subtask-nanos', subtaskNanoRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/recurrence', recurrenceRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/attachments', attachmentsRoutes);
app.use('/api/versions', versionsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/team-analytics', teamAnalyticsRoutes);
app.use('/api/pm-sheet', pmSheetRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/my-shortcuts', myShortcutsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/sales-permissions', salesPermissionsRoutes);
app.use('/api/project-options', projectOptionsRoutes);

import jwt from 'jsonwebtoken';

// Socket.IO connection
io.on('connection', (socket) => {
  if (process.env.NODE_ENV !== 'production') console.log('New socket connection attempt:', socket.id);
  if (process.env.NODE_ENV !== 'production') console.log('Handshake auth:', socket.handshake.auth);
  const { userId, token } = socket.handshake.auth;

  if (!userId) {
    socket.disconnect();
    return;
  }

  // Verify token if provided
  let decodedUser = { _id: userId };
  if (token) {
    try {
      decodedUser = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.log('Invalid token');
    }
  }

  // Join user room for personal notifications
  socket.join(`user-${userId}`);

  // Join admin room if user is admin
  if (decodedUser.role === 'admin') {
    socket.join('admin');
    console.log(`Admin user ${userId} joined admin room`);
  }

  // Join managers room if user is manager (for finance updates and announcements)
  if (decodedUser.role === 'manager') {
    socket.join('managers');
    console.log(`User ${userId} joined managers room`);
  }

  // Join department rooms for batched announcement delivery
  if (decodedUser.department) {
    const departments = Array.isArray(decodedUser.department) 
      ? decodedUser.department 
      : [decodedUser.department];
    departments.forEach(deptId => {
      if (deptId) {
        socket.join(`department-${deptId}`);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`User ${userId} joined department room: department-${deptId}`);
        }
      }
    });
  }

  console.log(`User ${userId} connected`);

  // Handle real-time updates for cards and related entities
  socket.on('join-card', (cardId) => {
    socket.join(`card-${cardId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined card room: card-${cardId}`);
  });

  socket.on('leave-card', (cardId) => {
    socket.leave(`card-${cardId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left card room: card-${cardId}`);
  });

  // Handle joining teams and boards
  socket.on('join-team', (teamId) => {
    socket.join(`team-${teamId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined team ${teamId}`);
  });

  socket.on('leave-team', (teamId) => {
    socket.leave(`team-${teamId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left team ${teamId}`);
  });

  // Handle real-time events (optional, can be emitted from controllers)
  socket.on('update-card', ({ cardId, updates, boardId }) => {
    // Broadcast to board room
    io.to(`board-${boardId}`).emit('card-updated', { cardId, updates });
  });

  socket.on('add-comment', ({ cardId, comment, boardId }) => {
    // Broadcast to board room
    io.to(`board-${boardId}`).emit('comment-added', { cardId, comment });
  });

  // Announcement Socket events
  socket.on('join-announcements', () => {
    socket.join('announcements');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined announcements room`);
  });

  socket.on('leave-announcements', () => {
    socket.leave('announcements');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left announcements room`);
  });

  socket.on('join-announcement', (announcementId) => {
    socket.join(`announcement-${announcementId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined announcement room: announcement-${announcementId}`);
  });

  socket.on('leave-announcement', (announcementId) => {
    socket.leave(`announcement-${announcementId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left announcement room: announcement-${announcementId}`);
  });

  socket.on('join-board', (boardId) => {
    socket.join(`board-${boardId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined board ${boardId}`);
  });

  socket.on('leave-board', (boardId) => {
    socket.leave(`board-${boardId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left board ${boardId}`);
  });

  // Finance room events - for real-time finance updates
  socket.on('join-finance', () => {
    socket.join('finance');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined finance room`);
  });

  socket.on('leave-finance', () => {
    socket.leave('finance');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left finance room`);
  });

  // My Shortcuts room events - for real-time user-specific updates
  socket.on('join-my-shortcuts', () => {
    socket.join(`user-shortcuts-${userId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined my-shortcuts room`);
  });

  socket.on('leave-my-shortcuts', () => {
    socket.leave(`user-shortcuts-${userId}`);
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left my-shortcuts room`);
  });

  // Sales room events - for real-time sales updates
  socket.on('join-sales', () => {
    socket.join('sales');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} joined sales room`);
  });

  socket.on('leave-sales', () => {
    socket.leave('sales');
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} left sales room`);
  });

  // Push notification subscription management
  socket.on('subscribe-push', async (subscription) => {
    try {
      const User = (await import('./models/User.js')).default;
      await User.findByIdAndUpdate(userId, {
        pushSubscription: subscription
      });
      if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} subscribed to push notifications`);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error('Error saving push subscription:', error);
    }
  });

  socket.on('unsubscribe-push', async () => {
    try {
      const User = (await import('./models/User.js')).default;
      await User.findByIdAndUpdate(userId, {
        $unset: { pushSubscription: 1 }
      });
      if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} unsubscribed from push notifications`);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error('Error removing push subscription:', error);
    }
  });

  socket.on('disconnect', () => {
    if (process.env.NODE_ENV !== 'production') console.log(`User ${userId} disconnected`);
  });
});

// Helper function to emit notification to user
export const emitNotification = (userId, notification) => {
  console.log(`[Socket] Emitting notification to user-${userId}:`, notification?.title || notification?.type);
  io.to(`user-${userId}`).emit('notification', notification);
};

// Helper function to emit to specific user
export const emitToUser = (userId, event, data) => {
  io.to(`user-${userId}`).emit(event, data);
};

// Helper function to emit to team
export const emitToTeam = (teamId, event, data) => {
  io.to(`team-${teamId}`).emit(event, data);
};

// Helper function to emit to board
export const emitToBoard = (boardId, event, data) => {
  io.to(`board-${boardId}`).emit(event, data);
};

// Helper function to emit to all connected clients
export const emitToAll = (event, data) => {
  io.emit(event, data);
};

// Helper function to emit to user's My Shortcuts room
export const emitToUserShortcuts = (userId, event, data) => {
  io.to(`user-shortcuts-${userId}`).emit(event, data);
};

// Export io for use in other modules
export { io };

import seedAdmin from './utils/seed.js';
import { startBackgroundJobs } from './utils/backgroundTasks.js';
import { startRecurringTaskScheduler } from './utils/recurrenceScheduler.js';
import { startReminderScheduler } from './utils/reminderScheduler.js';
import { startArchivedCardCleanup } from './utils/archiveCleanup.js';
import { startTrashCleanup } from './utils/trashCleanup.js';
import { startBoardCleanup } from './utils/boardCleanup.js';
import { initializeSlackServices, shutdownSlackServices } from './services/slack/index.js';

// MongoDB connection with connection pooling
mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 100, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
})
  .then(() => {
    if (process.env.NODE_ENV !== 'production') console.log('Connected to MongoDB with connection pooling');
    // Seed the admin user
    seedAdmin();
    // Start background jobs for scheduled announcements and expiry
    startBackgroundJobs();
    // Start recurring task scheduler
    startRecurringTaskScheduler();
    // Start reminder scheduler
    startReminderScheduler();
    // Start archived card cleanup
    startArchivedCardCleanup();
    // Start trashed attachments cleanup
    startTrashCleanup();
    // Start soft-deleted boards permanent cleanup
    startBoardCleanup();
    // Initialize Slack services (queues, etc.)
    initializeSlackServices().then(() => {
      console.log('Slack services initialized');
    }).catch(err => {
      console.error('Slack services initialization error (non-fatal):', err.message);
    });
    server.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await shutdownSlackServices();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await shutdownSlackServices();
  process.exit(0);
});

// Error handling middleware

app.use(errorHandler);

// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ message: 'Something went wrong!' });
// });
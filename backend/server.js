import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import { socketManager } from './realtime/index.js';
// Re-export emitters for any remaining legacy imports
export {
  emitNotification,
  emitToUser,
  emitToTeam,
  emitToBoard,
  emitToAll,
  emitToUserShortcuts,
  emitToDepartment,
  getIO as io, // legacy compat: import { io } from '../server.js' → getIO()
} from './realtime/index.js';

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
import authzRoutes from './modules/authorization/routes/index.js';
import { captureRawBody } from './middleware/slackMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO via the realtime module (all socket logic is in realtime/)
socketManager.init(server);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true
}));

// ─── Request Logger ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000 || res.statusCode >= 400) {
      console.log(`[${req.method}] ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ─── Body Parsing ────────────────────────────────────────────────────────────
// Slack signature verification requires raw body (before JSON parsing)
app.use('/api/slack', express.json({ verify: captureRawBody }));
app.use('/api/slack', express.urlencoded({ extended: true, verify: captureRawBody }));

app.use(express.json({ limit: config.http.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.http.bodyLimit }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Compression ─────────────────────────────────────────────────────────────
app.use(compression());


// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      chatWebhook: config.chat.enabled ? 'enabled' : 'disabled',
    }
  };
  try {
    await mongoose.connection.db.admin().ping();
    healthcheck.services.database = 'connected';
  } catch {
    healthcheck.services.database = 'disconnected';
    healthcheck.status = 'degraded';
  }
  const statusCode = healthcheck.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthcheck);
});

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
app.use('/api/authorization', authzRoutes);

// ─── Startup ─────────────────────────────────────────────────────────────────
import seedAdmin from './utils/seed.js';
import { startBackgroundJobs } from './utils/backgroundTasks.js';
import { startRecurringTaskScheduler } from './utils/recurrenceScheduler.js';
import { startReminderScheduler } from './utils/reminderScheduler.js';
import { startArchivedCardCleanup } from './utils/archiveCleanup.js';
import { startTrashCleanup } from './utils/trashCleanup.js';
import { startBoardCleanup } from './utils/boardCleanup.js';
import { initializeSlackServices, shutdownSlackServices } from './services/slack/index.js';
import { initQueues, shutdownQueues } from './queues/queueManager.js';

mongoose.connect(config.db.uri, {
  maxPoolSize: config.db.maxPoolSize,
  serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
  socketTimeoutMS: config.db.socketTimeoutMS,
})
  .then(async () => {
    if (config.isDev) console.log('Connected to MongoDB with connection pooling');

    // Initialize BullMQ queues (probes Redis, starts workers if available)
    const queuesActive = await initQueues();
    if (config.isDev) console.log(`BullMQ queues: ${queuesActive ? 'ACTIVE' : 'FALLBACK (in-process)'}`);

    seedAdmin();
    startBackgroundJobs();      // no-op if BullMQ handles scheduled tasks
    startRecurringTaskScheduler();
    startReminderScheduler();
    startArchivedCardCleanup();
    startTrashCleanup();
    startBoardCleanup();

    initializeSlackServices().then(() => {
      console.log('Slack services initialized');
    }).catch(err => {
      console.error('Slack services initialization error (non-fatal):', err.message);
    });

    server.listen(config.port, () => {
      if (config.isDev) console.log(`Server running on port ${config.port}`);
    });

    // HTTP keep-alive tuning for load balancer compatibility
    server.keepAliveTimeout = config.http.keepAliveTimeout;
    server.headersTimeout = config.http.headersTimeout;
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  try {
    await Promise.allSettled([
      shutdownSlackServices(),
      shutdownQueues(),
    ]);
  } catch (err) {
    console.error('Error during service shutdown:', err);
  }
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Error Handler (must be last middleware) ─────────────────────────────────
app.use(errorHandler);
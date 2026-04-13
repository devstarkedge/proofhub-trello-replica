import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import logger from './utils/logger.js';
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
import salesTabRoutes from './modules/salesTabs/salesTab.routes.js';
import projectOptionsRoutes from './routes/projectOptions.js';
import authzRoutes from './modules/authorization/routes/index.js';
import chatIntegrationRoutes from './routes/chatIntegration.js';
import { captureRawBody } from './middleware/slackMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO via the realtime module (all socket logic is in realtime/)
socketManager.init(server);

// ─── Security ────────────────────────────────────────────────────────────────
// Function-based CORS: logs every blocked request so you can see the exact
// mismatch in the console / Render logs.
const corsHandler = cors({
  origin: (incomingOrigin, callback) => {
    // Allow server-to-server / same-origin requests (no Origin header)
    if (!incomingOrigin) return callback(null, true);
    const normalized = incomingOrigin.replace(/\/+$/, '');
    if (config.allowedOrigins.includes(normalized)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', {
        origin: normalized,
        allowedOrigins: config.allowedOrigins,
        hint: `Add "${normalized}" to FRONTEND_URL, CHATAPP_URL, or EXTRA_ALLOWED_ORIGIN in your env.`,
      });
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

// Explicit OPTIONS preflight handler must come BEFORE Helmet and all routes
app.options('*', corsHandler);
app.use(corsHandler);



// ─── Request Logger ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000 || res.statusCode >= 400) {
      logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
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

// ─── Frontend Static Assets ───────────────────────────────────────────────────
// Serve compiled frontend assets. Hashed filenames (/assets/*.js, /assets/*.css)
// get a 1-year immutable cache. index: false defers index.html to the SPA fallback
// so we can always set Cache-Control: no-cache on HTML (critical after re-deploys).
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(
  express.static(frontendDist, {
    maxAge: '1y',
    immutable: true,
    etag: true,
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  })
);

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
app.use('/api/sales-tabs', salesTabRoutes);
app.use('/api/project-options', projectOptionsRoutes);
app.use('/api/authorization', authzRoutes);
app.use('/api/chat-integration', chatIntegrationRoutes);

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
// Must come AFTER all API routes. Serves index.html for every non-API GET so
// React Router can handle client-side navigation (direct URL, page refresh).
// Never cache HTML — browsers must re-fetch after each deployment so they pick
// up the new hashed asset filenames embedded in the freshly built index.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res
    .set('Cache-Control', 'no-cache, no-store, must-revalidate')
    .set('Pragma', 'no-cache')
    .set('Expires', '0')
    .sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => {
      if (err) next(err);
    });
});

// ─── Startup ─────────────────────────────────────────────────────────────────
import seedAdmin from './utils/seed.js';
import { initializeSlackServices, shutdownSlackServices } from './services/slack/index.js';
import { initQueues, shutdownQueues } from './queues/queueManager.js';

mongoose.connect(config.db.uri, {
  maxPoolSize: config.db.maxPoolSize,
  serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
  socketTimeoutMS: config.db.socketTimeoutMS,
})
  .then(async () => {
    logger.info('Connected to MongoDB with connection pooling');

    // Initialize BullMQ queues (probes Redis, starts workers, recovery scans)
    const queuesActive = await initQueues();
    logger.info(`BullMQ queues: ${queuesActive ? 'ACTIVE' : 'FALLBACK (in-process)'}`);

    seedAdmin();

    initializeSlackServices().then(() => {
      logger.info('Slack services initialized');
    }).catch(err => {
      logger.error('Slack services initialization error (non-fatal)', { error: err.message });
    });

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { env: config.env });
    });

    // HTTP keep-alive tuning for load balancer compatibility
    server.keepAliveTimeout = config.http.keepAliveTimeout;
    server.headersTimeout = config.http.headersTimeout;
  })
  .catch((error) => {
    logger.error('MongoDB connection error', { error: error.message });
  });

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  try {
    await Promise.allSettled([
      shutdownSlackServices(),
      shutdownQueues(),
    ]);
  } catch (err) {
    logger.error('Error during service shutdown', { error: err.message });
  }
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Error Handler (must be last middleware) ─────────────────────────────────
app.use(errorHandler);
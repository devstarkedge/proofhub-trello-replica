import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet'; // Add to package.json
import compression from 'compression'; // Add to package.json
import mongoSanitize from 'express-mongo-sanitize'; // Add to package.json

// Routes
import authRoutes from './routes/auth.js';
import boardsRoutes from './routes/boards.js';
import listsRoutes from './routes/lists.js';
import cardsRoutes from './routes/cards.js';
import teamsRoutes from './routes/teams.js';
import departmentRoutes from './routes/departmentRoutes.js';
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import analyticsRoutes from './routes/analytics.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import seedAdmin from './utils/seed.js';

import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Security Middleware
if (isProduction) {
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for now, configure based on needs
    crossOriginEmbedderPolicy: false
  }));
}

// Compression
app.use(compression());

// Sanitize data
app.use(mongoSanitize());

// CORS Configuration
const corsOptions = {
  origin: isProduction 
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting (only in production)
if (isProduction) {
  app.use('/api', rateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 100
  }));
}

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// Serve frontend for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// Socket.IO with enhanced error handling
io.on('connection', (socket) => {
  try {
    const { userId, token } = socket.handshake.auth;

    if (!userId) {
      console.warn('Socket connection rejected: No user ID');
      socket.disconnect();
      return;
    }

    // Join user room
    socket.join(`user-${userId}`);
    console.log(`User ${userId} connected (Socket ID: ${socket.id})`);

    // Room management
    socket.on('join-board', (boardId) => {
      socket.join(`board-${boardId}`);
      console.log(`User ${userId} joined board ${boardId}`);
    });

    socket.on('leave-board', (boardId) => {
      socket.leave(`board-${boardId}`);
      console.log(`User ${userId} left board ${boardId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`User ${userId} disconnected: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`Socket error for user ${userId}:`, error);
    });
  } catch (error) {
    console.error('Socket connection error:', error);
    socket.disconnect();
  }
});

// Helper functions for real-time updates
export const emitNotification = (userId, notification) => {
  try {
    io.to(`user-${userId}`).emit('notification', notification);
  } catch (error) {
    console.error('Error emitting notification:', error);
  }
};

export const emitToBoard = (boardId, event, data) => {
  try {
    io.to(`board-${boardId}`).emit(event, data);
  } catch (error) {
    console.error('Error emitting to board:', error);
  }
};

// Error Handler (must be last)
app.use(errorHandler);

// MongoDB Connection with retry logic
const connectDB = async (retries = 5) => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Seed admin user
    await seedAdmin();
    
    return conn;
  } catch (error) {
    console.error(`MongoDB connection error (${retries} retries left):`, error.message);
    
    if (retries > 0) {
      console.log('Retrying connection in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    }
    
    console.error('Failed to connect to MongoDB after multiple retries');
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (isProduction) {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (isProduction) {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

// Start server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`📱 API: http://localhost:${PORT}`);
    console.log(`🌐 Frontend: http://localhost:5173`);
    console.log('='.repeat(50));
  });
});

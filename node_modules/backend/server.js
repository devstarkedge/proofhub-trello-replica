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
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import analyticsRoutes from './routes/analytics.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// In production, set FRONTEND_URL to your deployed URL, e.g., 'https://flowtask-x3z4.onrender.com'
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use('/uploads', express.static('uploads'));

// Routes
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

import jwt from 'jsonwebtoken';

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('New socket connection attempt:', socket.id);
  console.log('Handshake auth:', socket.handshake.auth);
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
      console.log('Invalid token');
    }
  }

  // Join user room for personal notifications
  socket.join(`user-${userId}`);

  console.log(`User ${userId} connected`);

  // Handle joining teams and boards
  socket.on('join-team', (teamId) => {
    socket.join(`team-${teamId}`);
    console.log(`User ${userId} joined team ${teamId}`);
  });

  socket.on('leave-team', (teamId) => {
    socket.leave(`team-${teamId}`);
    console.log(`User ${userId} left team ${teamId}`);
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

  socket.on('join-board', (boardId) => {
    socket.join(`board-${boardId}`);
    console.log(`User ${userId} joined board ${boardId}`);
  });

  socket.on('leave-board', (boardId) => {
    socket.leave(`board-${boardId}`);
    console.log(`User ${userId} left board ${boardId}`);
  });

  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
  });
});

// Helper function to emit notification to user
export const emitNotification = (userId, notification) => {
  io.to(`user-${userId}`).emit('notification', notification);
};

// Helper function to emit to team
export const emitToTeam = (teamId, event, data) => {
  io.to(`team-${teamId}`).emit(event, data);
};

// Helper function to emit to board
export const emitToBoard = (boardId, event, data) => {
  io.to(`board-${boardId}`).emit(event, data);
};

import seedAdmin from './utils/seed.js';

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Seed the admin user
    seedAdmin();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});
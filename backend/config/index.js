/**
 * Centralized Configuration Module
 * 
 * Single source of truth for all environment variables and application settings.
 * Validates required variables at startup to fail fast on misconfiguration.
 * 
 * Usage: import config from './config/index.js';
 */

import dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV || 'development';
const isDev = env === 'development';
const isProd = env === 'production';
const isTest = env === 'test';

// ─── Required Environment Variables ─────────────────────────────────────────
const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0 && !isTest) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── Configuration Object ───────────────────────────────────────────────────
const config = {
  env,
  isDev,
  isProd,
  isTest,

  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowedOrigins: [
    process.env.FRONTEND_URL,
    'http://172.16.16.20:5173',
  ].filter(Boolean),

  // Database
  db: {
    uri: process.env.MONGO_URI,
    maxPoolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 100,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },

  // Redis (for BullMQ, rate limiting, Socket.IO adapter)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  },

  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  // Auth cache (in-memory LRU)
  authCache: {
    maxSize: parseInt(process.env.AUTH_CACHE_MAX_SIZE, 10) || 1000,
    ttlMs: parseInt(process.env.AUTH_CACHE_TTL_MS, 10) || 60000, // 60 seconds
  },

  // Email
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  },

  // Push Notifications (VAPID)
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: `mailto:${process.env.EMAIL_USER || 'noreply@flowtask.com'}`,
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  // Slack Integration
  slack: {
    enabled: process.env.SLACK_ENABLED === 'true',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  },

  // Chat Webhook
  chat: {
    enabled: process.env.CHAT_ENABLED === 'true',
    webhookUrl: process.env.CHAT_WEBHOOK_URL,
    webhookSecret: process.env.CHAT_WEBHOOK_SECRET,
  },

  // Admin Seed
  admin: {
    email: process.env.ADMIN_EMAIL || 'dev@starkedge.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@1234',
  },

  // Rate Limiting
  rateLimit: {
    global: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    },
    auth: {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },
    upload: {
      windowMs: 60 * 1000,
      maxRequests: 20,
    },
    search: {
      windowMs: 60 * 1000,
      maxRequests: 30,
    },
  },

  // Socket.IO
  socket: {
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    perMessageDeflateThreshold: 1024,
  },

  // Background Jobs (BullMQ)
  queues: {
    defaultAttempts: 3,
    defaultBackoff: { type: 'exponential', delay: 1000 },
    email: { concurrency: 5 },
    notification: { concurrency: 10 },
    analytics: { concurrency: 3 },
    fileProcessing: { concurrency: 3 },
    slack: { concurrency: 5 },
  },

  // HTTP Server
  http: {
    bodyLimit: '10mb',
    keepAliveTimeout: 65000, // Above typical LB timeout of 60s
    headersTimeout: 66000,   // Slightly above keepAliveTimeout
  },
};

export default config;

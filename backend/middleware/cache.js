import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60 }); // 1 minute default TTL

// Define paths that should have shorter cache times or no cache
const DYNAMIC_PATHS = [
  '/api/cards/list/',
  '/api/cards/board/',
  '/api/boards/',
  '/api/departments/',
  '/api/teams/',
  '/api/users', // Skip caching for all user-related endpoints
  '/api/auth/admin-create-user', // Skip caching for admin user creation
  '/api/reminders', // Skip caching for all reminder endpoints
  '/api/reminders/' // Skip caching for all reminder-related endpoints
];

export const cacheMiddleware = (ttl = 60) => {
  // Skip caching for specific endpoints that need real-time data
  const skipPaths = [
    '/api/cards/list/',
    '/api/cards/board/',
    '/api/cards/', // Skip individual card endpoints for real-time updates
    '/api/lists/', // Skip lists endpoint to ensure new projects show default lists
    '/api/comments/', // Skip all comment endpoints for real-time updates
    '/api/departments',
    '/api/departments/',
    '/api/teams/',
    '/api/users', // Skip all user endpoints for real-time updates
    '/api/auth/me', // Skip user profile endpoint
    '/api/auth/verify', // Skip session verification endpoint for user-specific data
    '/api/auth/admin-create-user', // Skip admin user creation for real-time updates
    '/api/notifications', // Skip notifications endpoint for user-specific data
    '/api/analytics/dashboard', // Skip dashboard analytics for real-time updates
    '/api/reminders', // Skip all reminder endpoints for real-time updates
    '/api/reminders/', // Skip all reminder-related endpoints
    '/api/reminders/dashboard', // Skip reminder dashboard stats
    '/api/reminders/calendar', // Skip reminder calendar data
    '/api/announcements', // Skip announcements to avoid clone issues with Mongoose documents
    '/api/announcements/', // Skip all announcement-related endpoints
    '/api/attachments', // Skip caching for all attachment endpoints
    '/api/attachments/', // Skip caching for all attachment-related endpoints
    '/api/attachments/', // Skip caching for all attachment-related endpoints
    '/api/users/profile', // Skip caching for user profile (avatar updates)
    '/api/labels', // Skip labels fetching to prevent stale data after delete
    '/api/labels/' // Skip all label-related endpoints
  ];
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for specific endpoints that need real-time data
    if (skipPaths.some(path => req.originalUrl.includes(path))) {
      return next();
    }

    const key = req.originalUrl;

    // Check if response is cached
    const cachedResponse = cache.get(key);
    if (cachedResponse) {
      console.log(`Cache hit for ${key}`);
      return res.json(cachedResponse);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache response
    res.json = function(data) {
      // Cache the response
      cache.set(key, data, ttl);
      console.log(`Cache set for ${key}`);

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

// Cache invalidation helper
export const invalidateCache = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter(key => key.includes(pattern));

  matchingKeys.forEach(key => {
    cache.del(key);
    console.log(`Cache invalidated for ${key}`);
  });
};

export default cache;

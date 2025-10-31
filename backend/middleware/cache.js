import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes default TTL

export const cacheMiddleware = (ttl = 300) => {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
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

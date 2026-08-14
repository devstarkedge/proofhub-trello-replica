export const rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    message = 'Too many requests, please try again later',
    // Defaults to the existing per-IP behavior — every call site before this
    // option existed keeps working unmodified. Pass e.g.
    // (req) => `ws:${req.params.id}` or (req) => req.user?.id to bound a
    // single account/workspace across many IPs instead of (or in addition
    // to, via a second rateLimiter instance) per-IP.
    keyFn = (req) => req.ip || req.connection.remoteAddress
  } = options;

  // One Map per rateLimiter(...) call, not one shared module-level Map —
  // otherwise every route using this factory (register, login, check-slug,
  // invite, forgot-password, ...) would collide on the same per-IP counter,
  // so a burst against ANY one of them could 429 a completely unrelated
  // route for that same IP (confirmed empirically: hitting check-slug
  // repeatedly while filling out the workspace wizard was enough to
  // immediately 429 a user's very first /login attempt afterward).
  const rateLimitStore = new Map();

  // Clean up old entries periodically — scoped to this instance's own Map.
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Clean up every minute

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = rateLimitStore.get(key);

    if (now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message
      });
    }

    record.count++;
    rateLimitStore.set(key, record);
    next();
  };
};

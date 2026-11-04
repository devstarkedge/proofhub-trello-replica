// Fixed buckets and bounded route labels keep observability inexpensive.
// No request bodies, URLs, query strings, identities or credentials are stored.
const bounds = [25, 50, 100, 250, 500, 1000, 2000, 5000];
const namespaces = new Set(['auth', 'authz', 'boards', 'lists', 'cards', 'departments', 'users', 'roles', 'notifications', 'announcements', 'attendance', 'leave', 'tracking', 'workspaces', 'sales', 'finance', 'reports', 'analytics', 'hubspot', 'slack', 'plans', 'super-admin', 'calendar', 'subtasks', 'teams']);
export function createRequestMetrics({ logger, intervalMs = 60000, maxRoutes = 100, now = () => performance.now(), memoryUsage = () => process.memoryUsage() } = {}) {
  let routes = new Map(), startedAt = now();
  const flush = () => {
    if (!routes.size) return;
    const elapsedMs = Math.max(1, now() - startedAt);
    const records = [...routes].map(([route, value]) => ({ route, ...value }));
    const memory = memoryUsage();
    logger?.info('[Performance] request summary', {
      windowMs: Math.round(elapsedMs), requests: records.reduce((n, row) => n + row.count, 0),
      latencyBucketUpperMs: [...bounds, '>5000'], rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
      routes: records.sort((a, b) => b.totalMs - a.totalMs)
    });
    routes = new Map(); startedAt = now();
  };
  const timer = intervalMs > 0 ? setInterval(flush, intervalMs) : null;
  timer?.unref();
  const middleware = (req, res, next) => {
    const start = now();
    res.once('finish', () => {
      // Only allowlisted static API namespaces and route templates become
      // labels; dynamic mount parameters and unmatched URLs are never logged.
      const namespace = req.baseUrl?.split('/')[2];
      const prefix = namespaces.has(namespace) ? `/api/${namespace}` : '';
      let route = `${req.method} ${prefix}${typeof req.route?.path === 'string' ? req.route.path : '<unmatched>'}`;
      if (!routes.has(route) && routes.size >= maxRoutes) route = '<other>';
      let row = routes.get(route);
      if (!row) { row = { count: 0, errors4xx: 0, errors5xx: 0, totalMs: 0, latencyBuckets: Array(bounds.length + 1).fill(0) }; routes.set(route, row); }
      const duration = Math.max(0, now() - start);
      row.count++; row.totalMs += Math.round(duration);
      if (res.statusCode >= 500) row.errors5xx++; else if (res.statusCode >= 400) row.errors4xx++;
      const bucket = bounds.findIndex(bound => duration <= bound);
      row.latencyBuckets[bucket < 0 ? bounds.length : bucket]++;
    });
    next();
  };
  middleware.flush = flush;
  middleware.stop = () => { if (timer) clearInterval(timer); };
  return middleware;
}

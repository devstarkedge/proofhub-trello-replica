/**
 * Slack Middleware
 * Handles Slack request verification and signature validation
 */

import crypto from 'crypto';

/**
 * Validate Slack request signature
 * Ensures requests are genuinely from Slack
 */
export const validateSlackSignature = (req, res, next) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET not configured');
    return res.status(500).json({ error: 'Slack integration not properly configured' });
  }

  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];

  if (!timestamp || !slackSignature) {
    console.error('Missing Slack signature headers');
    return res.status(400).json({ error: 'Missing Slack signature' });
  }

  // Check timestamp to prevent replay attacks (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('Slack request timestamp too old');
    return res.status(400).json({ error: 'Request timestamp too old' });
  }

  // Get raw body for signature verification
  let rawBody;
  
  if (req.rawBody) {
    rawBody = req.rawBody;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else if (typeof req.body === 'object') {
    // For URL-encoded bodies
    rawBody = new URLSearchParams(req.body).toString();
  } else {
    rawBody = req.body;
  }

  // Compute signature
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  // Compare signatures using timing-safe comparison
  try {
    if (crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
      return next();
    }
  } catch (e) {
    // Buffers were different lengths
  }

  console.error('Slack signature verification failed');
  return res.status(400).json({ error: 'Invalid Slack signature' });
};

/**
 * Middleware to capture raw body for signature verification
 */
export const captureRawBody = (req, res, buf, encoding) => {
  req.rawBody = buf.toString(encoding || 'utf8');
};

/**
 * Rate limiter specific to Slack webhooks
 * Slack has its own retry logic, so we need to be careful
 */
export const slackRateLimiter = (maxRequests = 1000, windowMs = 60000) => {
  const requests = new Map();

  return (req, res, next) => {
    const teamId = req.body?.team_id || req.body?.team?.id || 'unknown';
    const key = `slack:${teamId}`;
    const now = Date.now();

    // Clean old entries
    const entry = requests.get(key);
    if (entry && now - entry.windowStart > windowMs) {
      requests.delete(key);
    }

    const current = requests.get(key) || { count: 0, windowStart: now };

    if (current.count >= maxRequests) {
      console.warn(`Slack rate limit exceeded for team: ${teamId}`);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    current.count++;
    requests.set(key, current);

    next();
  };
};

/**
 * Log Slack requests for debugging
 */
export const slackRequestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  console.log('Slack Request:', {
    method: req.method,
    path: req.path,
    teamId: req.body?.team_id || req.body?.team?.id,
    userId: req.body?.user_id || req.body?.user?.id,
    type: req.body?.type || req.body?.command
  });

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    console.log('Slack Response:', {
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
    return originalSend.apply(res, arguments);
  };

  next();
};

export default {
  validateSlackSignature,
  captureRawBody,
  slackRateLimiter,
  slackRequestLogger
};

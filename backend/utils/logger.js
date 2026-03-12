import winston from 'winston';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

/**
 * Centralized structured logger.
 *
 * Winston log levels (lowest number = highest priority):
 *   error (0)  warn (1)  info (2)  http (3)  verbose (4)  debug (5)  silly (6)
 *
 * Effective level by environment (overridable via LOG_LEVEL env var):
 *   development  →  debug  — all logs visible
 *   production   →  info   — only error, warn, info; debug and http suppressed
 *
 * To temporarily enable debug logs in production:
 *   Render → FlowTask Backend → Environment → LOG_LEVEL=debug → Manual Deploy
 */

// Development: colorized, human-readable output
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  }),
);

// Production: structured JSON — one parseable object per line.
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: IS_PRODUCTION ? prodFormat : devFormat,
  defaultMeta: { service: 'flowtask' },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

logger.info('Logger initialized', { level: LOG_LEVEL, env: NODE_ENV });

export default logger;

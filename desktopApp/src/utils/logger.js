/**
 * Environment-aware browser logger.
 *
 * In development (import.meta.env.DEV === true):
 *   All log levels are active — log, debug, info, warn, error.
 *
 * In production (import.meta.env.PROD === true):
 *   Only warn and error are active — log, debug, info are suppressed.
 *
 * Usage:
 *   import logger from '@/utils/logger';
 *   logger.info('User logged in', { userId });   // dev only
 *   logger.debug('Token decoded', payload);       // dev only
 *   logger.warn('Rate limit approaching');         // always
 *   logger.error('API call failed', error);        // always
 */

const noop = () => {};

const IS_DEV = import.meta.env.DEV;

const logger = {
  log:   IS_DEV ? console.log.bind(console)   : noop,
  debug: IS_DEV ? console.debug.bind(console) : noop,
  info:  IS_DEV ? console.info.bind(console)  : noop,
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;

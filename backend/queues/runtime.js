import { Queue as BullQueue, Worker as BullWorker, UnrecoverableError } from 'bullmq';
import config from '../config/index.js';
import { LocalQueue, LocalWorker } from './local.js';
import { getReadyConnection, reportRedisError, serviceUnavailable, withTimeout } from './connection.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import logger from '../utils/logger.js';

export { UnrecoverableError };

// Current schedulers use ':' in custom IDs. BullMQ rejects most such IDs.
const encodeId = id => id?.includes(':') && id.split(':').length !== 3 ? `ftid-${Buffer.from(id).toString('base64url')}` : id;
const decodeId = id => id?.startsWith('ftid-') ? Buffer.from(id.slice(5), 'base64url').toString() : id;
const wrapJob = job => job && new Proxy(job, { get(target, key) {
  if (key === 'id') return decodeId(target.id);
  const value = Reflect.get(target, key);
  return typeof value === 'function' ? value.bind(target) : value;
} });

export class Queue {
  constructor(name, opts = {}) { this.name = name; this.opts = opts; this.queue = null; }
  instance() {
    if (config.redis.enabled) getReadyConnection();
    if (!this.queue) {
      this.queue = config.redis.enabled ? new BullQueue(this.name, { ...this.opts, connection: getReadyConnection() }) : new LocalQueue(this.name, this.opts);
      this.queue.on('error', error => config.redis.enabled ? reportRedisError(`queue:${this.name}`, error) : logger.error('Local job service failed', { queue: this.name }));
    }
    return this.queue;
  }
  async call(method, ...args) {
    try {
      const operation = this.instance()[method](...args);
      return config.redis.enabled ? await withTimeout(operation, config.redis.commandTimeoutMs, 'Job') : await operation;
    } catch (error) {
      if (!config.redis.enabled) throw error;
      reportRedisError(`queue:${this.name}`, error);
      throw serviceUnavailable('Job');
    }
  }
  async add(name, data, opts = {}) {
    // BullMQ builds its own valid ID for repeat jobs. Preserve the repeat
    // identity so existing production schedules deduplicate after deployment.
    return wrapJob(await this.call('add', name, data, { ...opts, jobId: opts.repeat ? opts.jobId : encodeId(opts.jobId) }));
  }
  async getJob(id) { return wrapJob(await this.call('getJob', encodeId(id))); }
  async getJobs(types) { return (await this.call('getJobs', types)).map(wrapJob); }
  async getDelayed() { return (await this.call('getDelayed')).map(wrapJob); }
  getRepeatableJobs() { return this.call('getRepeatableJobs'); }
  removeRepeatableByKey(key) { return this.call('removeRepeatableByKey', key); }
  clean(...args) { return this.call('clean', ...args); }
  waitUntilReady() { return this.call('waitUntilReady'); }
  async close() {
    if (!this.queue) return;
    try { await withTimeout(this.queue.close(), config.redis.shutdownTimeoutMs, 'Job'); }
    finally { this.queue = null; }
  }
}

export class Worker {
  constructor(name, processor, opts = {}) {
    const processJob = job => job.data?.workspaceId
      ? workspaceContext.run({ workspaceId: job.data.workspaceId }, () => processor(wrapJob(job)))
      : workspaceContext.runUnscoped(() => processor(wrapJob(job)));
    const worker = config.redis.enabled ? new BullWorker(name, processJob, { ...opts, connection: getReadyConnection() }) : new LocalWorker(name, processJob, opts);
    worker.on('error', error => config.redis.enabled ? reportRedisError(`worker:${name}`, error) : logger.error('Local job execution failed', { queue: name }));
    return worker;
  }
}

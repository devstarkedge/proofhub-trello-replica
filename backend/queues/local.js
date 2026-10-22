import { EventEmitter } from 'node:events';

const channels = new Map();
const MAX_DELAY = 2 ** 31 - 1;
const MAX_JOBS = 10000;

function channel(name) {
  if (!channels.has(name)) channels.set(name, { jobs: new Map(), repeats: new Map(), workers: new Set(), timer: null, sequence: 0, closed: false });
  return channels.get(name);
}

function schedule(state) {
  clearTimeout(state.timer);
  if (state.closed || !state.workers.size) return;
  const now = Date.now();
  const available = [...state.workers].filter(worker => !worker.closing && worker.active.size < worker.opts.concurrency);
  const due = [...state.jobs.values()].filter(job => ['waiting', 'delayed'].includes(job.state));
  const deadlines = [...state.repeats.values()].map(repeat => repeat.next);
  if (available.length) deadlines.push(...due.map(job => Math.max(job.due, Math.min(...available.map(worker => worker.availableAt(now))))));
  if (!deadlines.length) return;
  const delay = Math.max(0, Math.min(MAX_DELAY, Math.min(...deadlines) - now));
  state.timer = setTimeout(() => tick(state), delay);
  state.timer.unref?.();
}

function tick(state) {
  if (state.closed) return;
  const now = Date.now();
  for (const repeat of state.repeats.values()) {
    if (repeat.next > now) continue;
    const due = repeat.next;
    repeat.next = now + repeat.every;
    repeat.queue.add(repeat.name, repeat.data, { ...repeat.opts, repeat: undefined, jobId: `${repeat.key}-${due}` })
      .catch(error => { for (const worker of state.workers) worker.emit('error', error); });
  }
  const due = [...state.jobs.values()].filter(job => ['waiting', 'delayed'].includes(job.state) && job.due <= now)
    .sort((a, b) => (a.opts.priority || 0) - (b.opts.priority || 0) || a.due - b.due);
  for (const job of due) {
    const worker = [...state.workers].find(item => !item.closing && item.active.size < item.opts.concurrency && item.availableAt(now) <= now);
    if (!worker) break;
    worker.execute(job);
  }
  schedule(state);
}

export class LocalQueue extends EventEmitter {
  constructor(name, opts = {}) { super(); this.name = name; this.opts = opts; this.state = channel(name); }
  async add(name, data, opts = {}) {
    const state = this.state;
    if (state.closed) throw new Error('Local job service is closed');
    opts = { ...this.opts.defaultJobOptions, ...opts };
    if (opts.repeat) {
      const every = opts.repeat.every;
      if (!Number.isSafeInteger(every) || every <= 0) throw new Error('Local jobs require repeat.every in milliseconds');
      const key = opts.jobId || `${name}-${every}`;
      if (!state.repeats.has(key)) state.repeats.set(key, { queue: this, key, name, data, opts, every, next: Date.now() + every });
      schedule(state);
      return { id: key };
    }
    const id = opts.jobId || `local-${++state.sequence}`;
    if (state.jobs.has(id)) return state.jobs.get(id);
    if (state.jobs.size >= MAX_JOBS) throw new Error('Local job backlog is full; retry after pending jobs finish');
    const job = {
      id, name, data: JSON.parse(JSON.stringify(data ?? {})), opts, attemptsMade: 0,
      due: Date.now() + Math.max(0, opts.delay || 0), state: opts.delay > 0 ? 'delayed' : 'waiting',
      getState: async () => job.state,
      remove: async () => {
        if (job.state === 'active') throw new Error('An active job cannot be removed');
        state.jobs.delete(id); schedule(state);
      },
    };
    state.jobs.set(id, job);
    schedule(state);
    return job;
  }
  async waitUntilReady() { return this; }
  async getJob(id) { return this.state.jobs.get(id); }
  async getJobs(types) { return [...this.state.jobs.values()].filter(job => types.includes(job.state)); }
  async getDelayed() { return this.getJobs(['delayed']); }
  async getRepeatableJobs() { return [...this.state.repeats.values()].map(({ key, name, every }) => ({ key, name, every })); }
  async removeRepeatableByKey(key) { this.state.repeats.delete(key); schedule(this.state); }
  async clean(grace, limit, type) {
    const removed = [];
    for (const job of this.state.jobs.values()) {
      if (job.state === type && job.finishedOn <= Date.now() - grace && removed.length < limit) { this.state.jobs.delete(job.id); removed.push(job.id); }
    }
    return removed;
  }
  async close() {
    this.state.closed = true;
    clearTimeout(this.state.timer);
    this.state.jobs.clear(); this.state.repeats.clear();
    channels.delete(this.name);
  }
}

export class LocalWorker extends EventEmitter {
  constructor(name, processor, opts = {}) {
    super(); this.name = name; this.processor = processor;
    this.opts = { concurrency: 1, ...opts }; this.state = channel(name);
    this.active = new Set(); this.closing = false; this.windowStart = 0; this.windowCount = 0;
    this.state.workers.add(this); schedule(this.state);
  }
  async waitUntilReady() { return this; }
  availableAt(now) {
    if (!this.opts.limiter) return now;
    if (now >= this.windowStart + this.opts.limiter.duration) { this.windowStart = now; this.windowCount = 0; }
    return this.windowCount >= this.opts.limiter.max ? this.windowStart + this.opts.limiter.duration : now;
  }
  execute(job) {
    job.state = 'active'; this.windowCount++;
    const work = Promise.resolve().then(() => this.processor(job)).then(result => {
      job.state = 'completed'; job.returnvalue = result; job.finishedOn = Date.now();
      this.emit('completed', job, result);
      this.retain(job, 'removeOnComplete');
    }, error => {
      job.attemptsMade++;
      if (error.name !== 'UnrecoverableError' && job.attemptsMade < (job.opts.attempts || 1) && !this.closing) {
        const backoff = job.opts.backoff;
        const delay = typeof backoff === 'number' ? backoff : (backoff?.delay || 0) * (backoff?.type === 'exponential' ? 2 ** (job.attemptsMade - 1) : 1);
        job.due = Date.now() + delay; job.state = 'delayed';
      } else { job.state = 'failed'; job.failedReason = error.message; job.finishedOn = Date.now(); }
      this.emit('failed', job, error);
      if (job.state === 'failed') this.retain(job, 'removeOnFail');
    }).catch(error => this.emit('error', error)).finally(() => { this.active.delete(work); schedule(this.state); });
    this.active.add(work);
  }
  retain(job, option) {
    const retention = job.opts[option];
    if (retention === true) { this.state.jobs.delete(job.id); return; }
    if (retention === false) return;
    const count = typeof retention === 'number' ? retention : retention?.count ?? 100;
    const age = retention?.age ? Date.now() - retention.age * 1000 : 0;
    const finished = [...this.state.jobs.values()].filter(item => item.state === job.state).sort((a, b) => b.finishedOn - a.finishedOn);
    finished.forEach((item, index) => { if (index >= count || item.finishedOn < age) this.state.jobs.delete(item.id); });
  }
  async close(force = false) {
    this.closing = true; this.state.workers.delete(this); schedule(this.state);
    if (!force) await Promise.allSettled([...this.active]);
  }
}

const { randomInt } = require('node:crypto');

const INACTIVITY_MS = 5 * 60 * 1000;
const JITTER_MS = 3 * 60 * 1000;
// Match the minimum configurable screenshot interval. Negative/zero delays
// for a 1–3 minute configuration must never cause a capture loop.
const MIN_DELAY_MS = 60 * 1000;
const MAX_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;

class CaptureSchedule {
  constructor({ now = () => performance.now(), random = randomInt } = {}) {
    this.now = now; this.random = random; this.active = false;
    this.scope = null; this.lastInputAt = null; this.nextAt = null; this.paused = false;
  }
  start(intervalSeconds, scope) {
    const now = this.now();
    const seconds = Number.isFinite(intervalSeconds) ? Math.min(3600, Math.max(60, intervalSeconds)) : 600;
    this.intervalMs = seconds * 1000;
    if (this.scope !== scope || this.lastInputAt === null) this.lastInputAt = now;
    this.scope = scope; this.active = true; this.paused = now - this.lastInputAt >= INACTIVITY_MS;
    this.nextAt = this.paused ? null : this.deadline(now);
  }
  deadline(now) {
    return now + this.random(Math.max(MIN_DELAY_MS, this.intervalMs - JITTER_MS), this.intervalMs + JITTER_MS + 1);
  }
  inactive(now = this.now()) {
    return this.active && (this.paused || now - this.lastInputAt >= INACTIVITY_MS);
  }
  updateInactivity(now = this.now()) {
    if (!this.active || this.paused || now - this.lastInputAt < INACTIVITY_MS) return false;
    this.paused = true; this.nextAt = null; return true;
  }
  input(now = this.now()) {
    if (!this.active) return false;
    const resumed = this.inactive(now);
    this.lastInputAt = now;
    if (resumed) { this.paused = false; this.nextAt = this.deadline(now); }
    return resumed;
  }
  due(now = this.now()) {
    return this.active && !this.inactive(now) && this.nextAt !== null && now >= this.nextAt;
  }
  completed(now = this.now()) {
    if (this.active && !this.inactive(now)) this.nextAt = this.deadline(now);
    else this.updateInactivity(now);
  }
  stop() { this.active = false; this.nextAt = null; }
}

module.exports = { CaptureSchedule, INACTIVITY_MS, MIN_DELAY_MS, MAX_ACTIVITY_WINDOW_MS };

/** Human-readable CLI progress. Final JSON stays on stdout; progress uses
 * stderr so an operator can still save the machine-readable report. */
export function createMigrationProgress({ write = line => console.error(line), now = () => Date.now(), heartbeatMs = 10000, throttleMs = 3000 } = {}) {
  const started = now(); let state = {}, printedAt = -Infinity;
  const print = waiting => {
    const parts = [`[+${Math.floor((now() - started) / 1000)}s]`, state.phase || 'starting'];
    if (state.checked !== undefined) parts.push(`checked ${state.checked}/${state.total ?? '?'}`);
    if (state.processed !== undefined) parts.push(`processed ${state.processed}/${state.total ?? '?'}`);
    for (const field of ['recoverable', 'quarantineCandidates', 'blocked', 'migrated', 'quarantined']) if (state[field] !== undefined) parts.push(`${field}=${state[field]}`);
    if (state.attachmentId) parts.push(`attachment=${state.attachmentId}`);
    if (state.stage) parts.push(state.stage);
    if (state.message) parts.push(state.message);
    if (waiting) parts.push('still working / waiting for current operation');
    write(parts.join(' | ')); printedAt = now();
  };
  const timer = setInterval(() => { if (now() - printedAt >= heartbeatMs) print(true); }, heartbeatMs);
  timer.unref?.();
  return {
    report(event) {
      const changed = event.phase !== state.phase;
      state = { ...event };
      if (changed || event.force || now() - printedAt >= throttleMs) print(false);
    },
    close() { clearInterval(timer); }
  };
}

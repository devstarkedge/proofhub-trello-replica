const sampleInterval = 20_000;
const sampleLifetime = 90_000;

// The shared session owner installs these listeners once per identity. Send
// only the latest observed input and never advance it from a timer alone.
export function retainAttendanceActivity({ current, readStatus, send }) {
  let latest = null;
  let timer;
  let sending = false;
  let nextSendAt = 0;
  let closed = false;

  const schedule = () => {
    if (!closed && latest && !sending && !timer) {
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, Math.max(0, nextSendAt - performance.now()));
    }
  };

  async function flush(keepalive = false) {
    if (sending || !latest || !current()) return;
    const sample = latest;
    latest = null;
    const now = performance.now();
    if (now - sample.observedAt >= sampleLifetime || readStatus()?.activeSession?._id !== sample.attendanceSessionId) return;
    sending = true;
    nextSendAt = now + sampleInterval;
    try {
      await send({ attendanceSessionId: sample.attendanceSessionId, activityAt: sample.activityAt }, keepalive);
    } catch {
      latest ||= sample;
    } finally {
      sending = false;
      schedule();
    }
  }

  function onInput(event) {
    if (!event.isTrusted || document.visibilityState !== 'visible' || !current()) return;
    const status = readStatus();
    const session = status?.activeSession;
    if (!session?.effectiveShiftEndAt || session.status !== 'ACTIVE') return;
    const observedAt = performance.now();
    const serverAt = +new Date(status.serverNow) + Math.max(0, observedAt - status.receivedAt);
    if (!Number.isFinite(serverAt)) return;
    latest = { attendanceSessionId: session._id, activityAt: Math.round(serverAt), observedAt };
    schedule();
  }

  const pageHide = () => { void flush(true); };
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'];
  for (const event of events) window.addEventListener(event, onInput, { capture: true, passive: true });
  window.addEventListener('pagehide', pageHide);
  return () => {
    closed = true;
    clearTimeout(timer);
    for (const event of events) window.removeEventListener(event, onInput, true);
    window.removeEventListener('pagehide', pageHide);
  };
}

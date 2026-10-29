import { summarize } from '../../modules/tracking/tracking.timeline.js';

const text = value => typeof value === 'string' ? value.slice(0, 1000) : '';
const id = value => value == null ? null : String(value._id || value);
export const REPORT_EVENTS = Object.freeze({
  checkin: 'attendance.checked_in', start: 'tracking.work_started', switch: 'tracking.work_switched',
  link: 'tracking.work_switched', pause: 'tracking.break_started', resume: 'tracking.work_resumed',
  checkout: 'attendance.checked_out',
});

// Explicit allowlist: desktop evidence, private storage, credentials and audit
// payloads must never cross the messaging boundary.
export function workContext(segment, includePreAssignment = false) {
  if (!segment) return null;
  const includedLink = (includePreAssignment && segment.linkedTask) || null;
  return { kind: segment.kind, projectId: id(segment.attributedProject || segment.project),
    project: text(segment.attributedProjectName || segment.projectName),
    taskId: id(segment.attributedTask || segment.task || includedLink), task: text(segment.attributedTaskTitle || segment.taskTitle || (includedLink ? segment.linkedTaskTitle : '')),
    agenda: text(segment.agendaTitle), description: text(segment.description),
    startedAt: segment.startedAt, endedAt: segment.endedAt || null,
    attributed: !!segment.attributionIncluded || !!includedLink };
}

export function dailyWorkSummary(sessions, attendanceRows, at) {
  const rows = new Map(); let workSeconds = 0, personalPauseSeconds = 0;
  for (const session of sessions) {
    const attendance = attendanceRows.find(a => id(a) === id(session.attendanceSession));
    if (!attendance) continue;
    const start = +new Date(attendance.checkInAt);
    const cutoff = Math.min(+new Date(at), +new Date(attendance.checkOutAt || at), +new Date(session.endedAt || at));
    // The tracking engine guarantees non-overlapping segments. Clip them to
    // the confirmed attendance interval; attribution changes labels, not time.
    for (const segment of session.segments || []) {
      const seconds = Math.max(0, (Math.min(+new Date(segment.endedAt || at), cutoff) - Math.max(start, +new Date(segment.startedAt))) / 1000);
      if (!seconds) continue;
      const context = workContext(segment, session.includePreAssignment);
      const key = JSON.stringify([context.projectId, context.taskId, context.kind, context.agenda, context.description]);
      const row = rows.get(key) || { ...context, seconds: 0 };
      row.seconds += seconds; rows.set(key, row); workSeconds += seconds;
    }
    for (const pause of session.pauses || []) personalPauseSeconds += Math.max(0,
      (Math.min(+new Date(pause.endedAt || at), cutoff) - Math.max(start, +new Date(pause.startedAt))) / 1000);
  }
  return { rows: [...rows.values()], workSeconds, personalPauseSeconds };
}

export function transitionSnapshot({ action, attendance, work, before, at, day, sessions, attendanceRows }) {
  const lastPause = (work?.pauses || []).at(-1);
  return {
    eventType: REPORT_EVENTS[action], occurredAt: at, attendanceSessionId: id(attendance), workDateKey: attendance.workDateKey,
    reportRevision: 1,
    checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt || null, workMode: attendance.checkIn?.workMode,
    previous: workContext(before?.segments?.at(-1)), current: workContext(work?.segments?.at(-1)),
    previousSeconds: before?.segments?.length ? Math.max(0, (+new Date(before.segments.at(-1).endedAt || at) - +new Date(before.segments.at(-1).startedAt)) / 1000) : 0,
    breakStartedAt: lastPause?.startedAt || null,
    breakSeconds: lastPause ? Math.max(0, (+new Date(lastPause.endedAt || at) - +new Date(lastPause.startedAt)) / 1000) : 0,
    workSeconds: work ? summarize(work, at).workSeconds : 0,
    trackingStarted: !!work,
    ...(action === 'checkout' ? {
      summary: dailyWorkSummary(sessions || [], attendanceRows || [attendance], at),
      attendanceSeconds: attendance.checkoutSummary?.attendanceSeconds ?? (day?.workedMinutes || 0) * 60,
      outcome: attendance.checkoutSummary?.outcome || { presenceState: day?.presenceState, leaveState: day?.leaveState },
      // Pending screenshots cannot change authoritative work time. They are
      // informational only and are never counted as work.
      pendingEvidenceUploads: attendance.checkoutSummary?.pendingUploads || 0,
    } : {}),
  };
}

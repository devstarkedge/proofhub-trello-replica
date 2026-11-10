import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone } from '../leave/leaveTimezone.util.js';
import { TrackingPolicy } from '../tracking/tracking.models.js';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const localTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export const workBreakFields = {
  startLocalTime: { type: String, required: true, match: localTime },
  endLocalTime: { type: String, required: true, match: localTime }
};

// Record only changes to the effective schedule. A delayed worker or a
// reconnect can still enforce the schedule that was active at the boundary.
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  ...workBreakFields,
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null }
});
schema.index({ workspaceId: 1, effectiveUntil: 1 });
schema.index({ workspaceId: 1 }, { unique: true, partialFilterExpression: { effectiveUntil: null } });
schema.plugin(workspaceScopePlugin);
export const AttendanceWorkBreak = mongoose.model('AttendanceWorkBreak', schema);

export function validateWorkBreak(value) {
  if (value == null) return;
  if (typeof value.startLocalTime !== 'string' || typeof value.endLocalTime !== 'string'
      || !localTime.test(value.startLocalTime) || !localTime.test(value.endLocalTime)
      || value.startLocalTime === value.endLocalTime) {
    throw new ErrorResponse('Scheduled break needs two different valid start and end times.', 400);
  }
}

export async function activateWorkBreak(workspaceId, previous, next, session) {
  if (previous?.startLocalTime === next?.startLocalTime && previous?.endLocalTime === next?.endLocalTime) return false;
  // Share the existing user-transition fence. Heartbeats only read this row.
  await TrackingPolicy.updateOne({ workspaceId }, { $inc: { __v: 1 } }, { session, timestamps: false });
  const at = new Date();
  await AttendanceWorkBreak.updateOne({ workspaceId, effectiveUntil: null }, { $set: { effectiveUntil: at } }, { session });
  if (next) await AttendanceWorkBreak.create([{
    workspaceId, effectiveFrom: at, startLocalTime: next.startLocalTime, endLocalTime: next.endLocalTime
  }], { session });
  return true;
}

export async function readWorkBreak(workspaceId, since, session = null) {
  const observedAt = new Date();
  const [schedule] = await AttendanceWorkBreak.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), $or: [
      { effectiveUntil: null }, { effectiveUntil: { $gte: since } }
    ] } },
    { $group: { _id: '$workspaceId', rules: { $push: {
      startLocalTime: '$startLocalTime', endLocalTime: '$endLocalTime',
      effectiveFrom: '$effectiveFrom', effectiveUntil: '$effectiveUntil'
    } } } },
    { $lookup: { from: Workspace.collection.name, localField: '_id', foreignField: '_id',
      pipeline: [{ $project: { _id: 0, timezone: 1 } }], as: 'workspace' } }
  ]).session(session);
  if (!schedule) return { rules: [], timezone: null, observedAt };
  return { rules: schedule.rules, timezone: getWorkspaceTimezone(schedule.workspace[0]), observedAt };
}

function wallTime(day, time) {
  const [hour, minute] = time.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

// Returns the earliest window intersecting [from, through]. The start is
// clamped to the policy activation, while the end is exclusive.
export function firstWorkBreak(schedule, from, through) {
  if (!schedule?.rules.length || +from > +through) return null;
  let first = null;
  for (const rule of schedule.rules) {
    const lower = Math.max(+from, +rule.effectiveFrom);
    const upper = Math.min(+through, rule.effectiveUntil ? +rule.effectiveUntil : Infinity);
    if (lower > upper) continue;
    const localDay = DateTime.fromMillis(lower, { zone: schedule.timezone }).startOf('day');
    for (const offset of [-1, 0, 1]) {
      const day = localDay.plus({ days: offset });
      const overnight = rule.endLocalTime < rule.startLocalTime;
      const start = Math.max(+wallTime(day, rule.startLocalTime), +rule.effectiveFrom);
      const end = Math.min(+wallTime(day.plus({ days: overnight ? 1 : 0 }), rule.endLocalTime),
        rule.effectiveUntil ? +rule.effectiveUntil : Infinity);
      if (start <= upper && start < end && end > lower && (!first || start < +first.startsAt)) {
        first = { startsAt: new Date(start), endsAt: new Date(end) };
      }
    }
  }
  return first;
}

export function workBreakState(schedule, at = new Date()) {
  const window = firstWorkBreak(schedule, at, new Date(+at + 36 * 3600000));
  return window ? { ...window, timezone: schedule.timezone } : null;
}

export async function readRecentWorkBreakWindows(workspaceId, at) {
  // An attendance session can authorize up to 24 hours of work. Only
  // still-open segments need this read-time cutoff; closed ones are durable.
  let cursor = new Date(+at - 24 * 3600000);
  const schedule = await readWorkBreak(workspaceId, cursor);
  const windows = [];
  while (+cursor <= +at) {
    const window = firstWorkBreak(schedule, cursor, at);
    if (!window) break;
    windows.push(window);
    cursor = window.endsAt;
  }
  return windows;
}

export const SCHEDULED_WORK_BREAK = 'SCHEDULED_WORK_BREAK';

export function pauseForWorkBreak(work, schedule, through) {
  const open = work.status === 'RUNNING' && work.segments.find(segment => !segment.endedAt);
  if (!open) return false;
  const observedThrough = schedule?.observedAt && +schedule.observedAt < +through ? schedule.observedAt : through;
  const window = firstWorkBreak(schedule, open.startedAt, observedThrough);
  if (!window) return false;
  open.endedAt = new Date(Math.max(+window.startsAt, +open.startedAt));
  work.status = 'PAUSED';
  work.pauses ||= [];
  work.pauses.push({ startedAt: open.endedAt, endedAt: window.endsAt, reason: SCHEDULED_WORK_BREAK });
  return true;
}

export function refreshWorkBreakPause(work, schedule) {
  const pause = work.pauses?.at(-1);
  if (work.status !== 'PAUSED' || pause?.reason !== SCHEDULED_WORK_BREAK) return false;
  const window = firstWorkBreak(schedule, pause.startedAt, pause.startedAt);
  if (!window || +window.endsAt >= +pause.endedAt) return false;
  pause.endedAt = window.endsAt;
  return true;
}

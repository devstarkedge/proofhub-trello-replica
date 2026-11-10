import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import Card from '../../models/Card.js';
import Board from '../../models/Board.js';
import Workspace from '../../models/Workspace.js';
import { emitToBoard, emitToWorkspace, emitFinanceDataRefresh } from '../../realtime/emitters.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { dateOnlyToInstant, getWorkspaceTimezone, instantToDateOnlyKey } from '../leave/leaveTimezone.util.js';
import { WorkSession } from './tracking.models.js';
import { firstWorkBreak, readWorkBreak } from '../attendance/attendanceWorkBreak.js';

const id = value => String(value?._id || value || '');
const asMs = ranges => ranges.reduce((total, range) => total + (+range.end - +range.start), 0);
export const autoTracked = entry => entry.timeSource === 'AUTO_TRACKED';
export const loggedTimeMinutes = entry => (entry.durationMs ?? ((entry.hours || 0) * 60 + (entry.minutes || 0)) * 60000) / 60000;

export function splitWorkDates(start, end, timezone) {
  const pieces = [];
  let from = +start;
  while (from < +end) {
    const day = DateTime.fromMillis(from, { zone: timezone }).startOf('day');
    const until = Math.min(+end, +day.plus({ days: 1 }).startOf('day'));
    pieces.push({ date: day.toJSDate(), dateKey: day.toISODate(), start: new Date(from), end: new Date(until) });
    from = until;
  }
  return pieces;
}

export function segmentDestination(segment, work) {
  if (segment.kind === 'TASK' && segment.task) return { task: segment.task, project: segment.project,
    taskTitle: segment.taskTitle, projectName: segment.projectName };
  if (segment.attributedTask && segment.attributionIncluded) return { task: segment.attributedTask, project: segment.attributedProject,
    taskTitle: segment.attributedTaskTitle, projectName: segment.attributedProjectName };
  if (work.includePreAssignment && segment.linkedTask) return { task: segment.linkedTask, project: segment.project,
    taskTitle: segment.taskTitle, projectName: segment.projectName };
  return null;
}

const overlaps = (left, right) => +left.start < +right.end && +right.start < +left.end;
const dateOfEntry = (entry, timezone) => instantToDateOnlyKey(entry.date, timezone);

function subtractManualRanges(ranges, entries) {
  for (const entry of entries) {
    const manual = { start: entry.startedAt, end: entry.endedAt };
    ranges = ranges.flatMap(range => !overlaps(range, manual) ? [range] : [
      ...(range.start < manual.start ? [{ start: range.start, end: manual.start }] : []),
      ...(range.end > manual.end ? [{ start: manual.end, end: range.end }] : [])
    ]);
  }
  return ranges;
}

function autoEntry(work, result) {
  const hours = Math.floor(result.durationMs / 3600000);
  return {
    _id: result._id, user: work.user, date: result.date, timeSource: 'AUTO_TRACKED',
    hours, minutes: (result.durationMs - hours * 3600000) / 60000, durationMs: result.durationMs,
    trackingSession: work._id, trackedProject: result.project, trackedProjectName: result.projectName,
    trackedTaskTitle: result.taskTitle, workDateKey: result.dateKey, description: 'Tracked work session'
  };
}

// Checkout owns the transaction for both the immutable receipt and card rows.
// The receipt and stable entry IDs also let event delivery retry independently.
export async function finalizeLoggedTime(attendance, timezone, dbSession) {
  const { workspaceId, user } = attendance;
  if (attendance.closureReason !== 'NORMAL_CHECKOUT' || !attendance.checkOutAt) return;
  const work = await WorkSession.findOne({ workspaceId, user, attendanceSession: attendance._id,
    status: 'CLOSED', autoLogEligible: true, loggedTimeFinalizedAt: null })
    .select('user segments includePreAssignment').session(dbSession).lean();
  if (!work) return;
  const groups = new Map();
  for (const segment of work.segments) {
    const destination = segmentDestination(segment, work);
    if (!destination?.task || !destination.project || !segment.endedAt) continue;
    for (const piece of splitWorkDates(segment.startedAt, segment.endedAt, timezone)) {
      const key = `${destination.project}:${destination.task}:${piece.dateKey}`;
      if (!groups.has(key)) groups.set(key, { ...destination, _id: new mongoose.Types.ObjectId(),
        date: piece.date, dateKey: piece.dateKey, ranges: [] });
      groups.get(key).ranges.push({ start: piece.start, end: piece.end });
    }
  }
  const rows = [...groups.values()];
  if (rows.length) {
    const cardIds = [...new Set(rows.map(row => id(row.task)))];
    const projects = await Board.find({ workspaceId, _id: { $in: rows.map(row => row.project) }, isDeleted: { $ne: true } })
      .select('_id').session(dbSession).lean();
    const validProjects = new Set(projects.map(id));
    const cards = await Card.find({ workspaceId, _id: { $in: cardIds }, isArchived: { $ne: true } })
      .select('board loggedTime').session(dbSession).lean();
    const byCard = new Map(cards.map(card => [id(card), card]));
    const updates = new Map();
    for (const row of rows) {
      const card = byCard.get(id(row.task));
      row.durationMs = asMs(row.ranges);
      if (!card || id(card.board) !== id(row.project) || !validProjects.has(id(row.project))) {
        row.status = 'UNAVAILABLE';
        continue;
      }
      const manual = (card.loggedTime || []).filter(entry => !autoTracked(entry) && id(entry.user) === id(user) && dateOfEntry(entry, timezone) === row.dateKey);
      row.ranges = subtractManualRanges(row.ranges, manual.filter(entry => entry.startedAt && entry.endedAt));
      row.durationMs = asMs(row.ranges);
      row.status = row.durationMs === 0 ? 'COVERED'
        : manual.some(entry => !entry.startedAt || !entry.endedAt) ? 'REVIEW' : 'POSTED';
      if (row.status === 'POSTED') {
        if (!updates.has(card)) updates.set(card, []);
        updates.get(card).push(autoEntry(work, row));
      }
    }
    if (updates.size) await Card.bulkWrite([...updates].map(([card, entries]) => ({
      updateOne: { filter: { workspaceId, _id: card._id, board: card.board },
        update: { $push: { loggedTime: { $each: entries } }, $inc: { __v: 1 } } }
    })), { session: dbSession });
  }
  await WorkSession.updateOne({ workspaceId, user, _id: work._id, loggedTimeFinalizedAt: null }, {
    $set: { loggedTimeFinalizedAt: attendance.checkOutAt, loggedTimeResults: rows }
  }, { session: dbSession });
  return {
    posted: rows.filter(row => row.status === 'POSTED').length,
    pendingReview: rows.filter(row => row.status === 'REVIEW').length,
    unavailable: rows.filter(row => row.status === 'UNAVAILABLE').length
  };
}

export async function publishLoggedTime(workspaceId, taskIds) {
  const cards = taskIds.length ? await Card.find({ workspaceId, _id: { $in: taskIds } }).select('board').lean() : [];
  for (const card of cards) {
    await emitToBoard(id(card.board), 'card-updated', { cardId: card._id, updates: {}, reloadLoggedTime: true });
    emitFinanceDataRefresh({ changeType: 'logged_time', cardId: id(card), boardId: id(card.board) });
  }
  emitToWorkspace('team-logged-time:changed', { workspaceId }, workspaceId);
}

export async function publishCheckoutLoggedTime(attendance) {
  const work = await WorkSession.findOne({ workspaceId: attendance.workspaceId, user: attendance.user,
    attendanceSession: attendance._id, loggedTimeFinalizedAt: { $ne: null } })
    .select('loggedTimeResults.task loggedTimeResults.status').lean();
  if (work) await publishLoggedTime(attendance.workspaceId, [...new Set(work.loggedTimeResults.map(row => id(row.task)))]);
}

export async function getLoggedTimeReviews(workspaceId, user, task) {
  const sessions = await WorkSession.find({ workspaceId, user, 'loggedTimeResults': { $elemMatch: { task, status: 'REVIEW' } } })
    .select('loggedTimeResults').lean();
  return sessions.flatMap(work => work.loggedTimeResults
    .filter(row => id(row.task) === id(task) && row.status === 'REVIEW')
    .map(({ _id, durationMs, dateKey }) => ({ _id, durationMs, dateKey })));
}

export async function resolveLoggedTimeReview({ workspaceId, user, task, entryId, decision, extraMinutes }) {
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      const work = await WorkSession.findOne({ workspaceId, user, loggedTimeResults: { $elemMatch: { _id: entryId, task } } })
        .select('user loggedTimeResults').session(transaction).lean();
      const row = work?.loggedTimeResults.find(result => id(result) === id(entryId));
      if (!row) throw new ErrorResponse('Tracked time review not found.', 404);
      if (row.status !== 'REVIEW') return;
      const durationMs = decision === 'separate' ? row.durationMs : decision === 'same' ? 0 : Math.round(Number(extraMinutes) * 60000);
      if (!['same', 'separate', 'partial'].includes(decision) || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > row.durationMs) {
        throw new ErrorResponse('Enter a valid amount of additional tracked time.', 400);
      }
      let status = 'COVERED';
      if (durationMs) {
        const board = await Board.exists({ workspaceId, _id: row.project, isDeleted: { $ne: true } }).session(transaction);
        const saved = board && await Card.updateOne({ workspaceId, _id: task, board: row.project, isArchived: { $ne: true } }, {
          $push: { loggedTime: autoEntry(work, { ...row, durationMs }) }
        }, { session: transaction });
        status = saved?.matchedCount ? 'POSTED' : 'UNAVAILABLE';
      }
      await WorkSession.updateOne({ workspaceId, user, _id: work._id, 'loggedTimeResults._id': row._id }, {
        $set: { 'loggedTimeResults.$.status': status, 'loggedTimeResults.$.durationMs': durationMs }
      }, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
  try { await publishLoggedTime(workspaceId, [task]); } catch { /* Reopening the card reads the committed review. */ }
}

export async function validateManualInterval({ workspaceId, user, task, entry, dbSession, manualRows = [] }) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').session(dbSession).lean();
  const timezone = getWorkspaceTimezone(workspace);
  const dateKey = entry.dateKey || dateOfEntry(entry, timezone);
  const start = dateOnlyToInstant(dateKey, timezone);
  if (!Number.isFinite(+start) || entry.dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(entry.dateKey)) {
    throw new ErrorResponse('Choose a valid work date.', 400);
  }
  if (entry.dateKey) {
    entry.date = start;
    entry.workDateKey = dateKey;
  }
  const end = DateTime.fromJSDate(start, { zone: timezone }).plus({ days: 1 }).toJSDate();
  const candidates = await WorkSession.find({ workspaceId, user, autoLogEligible: true, startedAt: { $lt: end },
    $and: [
      { $or: [{ endedAt: { $gt: start } }, { endedAt: null }] },
      { $or: [{ 'segments.task': task }, { 'segments.attributedTask': task }, { 'segments.linkedTask': task }] }
    ] }).select('segments includePreAssignment endedAt').session(dbSession).lean();
  const now = new Date();
  let tracked = candidates.flatMap(work => work.segments.filter(segment => id(segmentDestination(segment, work)?.task) === id(task))
    .map(segment => ({ start: segment.startedAt, end: segment.endedAt || work.endedAt || now, open: !segment.endedAt && !work.endedAt })))
    .filter(range => overlaps(range, { start, end }));
  const open = tracked.find(range => range.open);
  if (open) {
    const breakWindow = firstWorkBreak(await readWorkBreak(workspaceId, open.start, dbSession), open.start, now);
    if (breakWindow) open.end = new Date(Math.max(+open.start, +breakWindow.startsAt));
    tracked = tracked.filter(range => overlaps(range, { start, end }) && range.end > range.start);
  }
  if (!entry.startedAt && !entry.endedAt && !tracked.length) return;
  const resolveTime = value => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
    ? DateTime.fromISO(`${dateKey}T${value}`, { zone: timezone }).toJSDate() : new Date(value);
  const from = resolveTime(entry.startedAt);
  const to = entry.endedAt === '00:00' && from > start ? end : resolveTime(entry.endedAt);
  if (!entry.startedAt || !entry.endedAt || !(from >= start && to <= end && to > from) || +to - +from !== loggedTimeMinutes(entry) * 60000) {
    const error = new ErrorResponse('Enter the start and end of the untracked time on this date.', 409);
    error.code = 'MANUAL_TIME_INTERVAL_REQUIRED';
    error.trackedMinutes = tracked.reduce((total, range) => total + Math.max(0, Math.min(+range.end, +end) - Math.max(+range.start, +start)), 0) / 60000;
    throw error;
  }
  if (tracked.some(range => overlaps(range, { start: from, end: to }))) {
    const error = new ErrorResponse('This interval overlaps tracked work on this task. Choose the untracked interval.', 409);
    error.code = 'MANUAL_TIME_OVERLAP';
    throw error;
  }
  if (manualRows.some(row => id(row) !== id(entry._id) && id(row.user) === id(user) && row.startedAt && row.endedAt
      && overlaps({ start: row.startedAt, end: row.endedAt }, { start: from, end: to }))) {
    const error = new ErrorResponse('This interval overlaps another manual entry on this task.', 409);
    error.code = 'MANUAL_TIME_OVERLAP';
    throw error;
  }
  entry.startedAt = from;
  entry.endedAt = to;
}

// Card-backed task time is read from Card.loggedTime by analytics. Only
// separate agendas and task receipts without a surviving card entry come
// from tracking here, so a posted task segment can never count twice.
export async function readAdditionalTeamTime({ workspaceId, users, viewer, start, end, timezone, details = false, agendaOnly = false }) {
  const result = new Map();
  const add = (user, dateKey, category, durationMs, entry) => {
    const key = `${user}:${dateKey}`;
    if (!result.has(key)) result.set(key, { agendaMinutes: 0, detachedMinutes: 0, agendas: [], detached: [] });
    const row = result.get(key);
    row[`${category}Minutes`] += durationMs / 60000;
    if (details) row[category === 'agenda' ? 'agendas' : 'detached'].push({ ...entry, timeSource: 'AUTO_TRACKED', totalMinutes: durationMs / 60000 });
  };
  if (!users.length) return result;
  const sources = [{ segments: { $elemMatch: { agenda: { $type: 'objectId' } } } }];
  if (!agendaOnly) sources.push({ loggedTimeResults: { $elemMatch: { date: { $gte: start, $lt: end }, status: { $in: ['POSTED', 'UNAVAILABLE'] } } } });
  const historicalScope = viewer?.role === 'manager' ? {
    $and: [{ $or: [{ user: viewer._id || viewer.id }, { departmentIdsAtStart: { $in: [].concat(viewer.department || []) } }] }]
  } : {};
  const settled = [];
  for await (const work of WorkSession.find({ workspaceId, user: { $in: users }, status: 'CLOSED',
    startedAt: { $lt: end }, endedAt: { $gt: start }, $or: sources, ...historicalScope })
    .select('user segments includePreAssignment loggedTimeResults').lean().cursor({ batchSize: 50 })) {
    for (const segment of work.segments) {
      if (!segment.agenda || !segment.endedAt || segmentDestination(segment, work)) continue;
      for (const piece of splitWorkDates(Math.max(+start, +segment.startedAt), Math.min(+end, +segment.endedAt), timezone)) {
        add(work.user, piece.dateKey, 'agenda', +piece.end - +piece.start,
          { _id: segment._id, title: segment.agendaTitle || 'Agenda', description: segment.description });
      }
    }
    if (!agendaOnly) for (const row of work.loggedTimeResults || []) {
      if (row.date >= start && row.date < end && ['POSTED', 'UNAVAILABLE'].includes(row.status)) settled.push({ user: work.user, row });
    }
  }
  if (settled.length) {
    const posted = settled.filter(({ row }) => row.status === 'POSTED');
    const ids = [...new Set(posted.map(({ row }) => id(row.task)))];
    const present = new Set(ids.length ? (await Card.find({ workspaceId, _id: { $in: ids } }).select('_id').lean()).map(id) : []);
    for (const { user, row } of settled) {
      if (row.status === 'UNAVAILABLE' || !present.has(id(row.task))) add(user, row.dateKey, 'detached', row.durationMs, row);
    }
  }
  return result;
}

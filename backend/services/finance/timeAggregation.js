import mongoose from 'mongoose';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getActiveWorkspaceId } from '../../modules/workspaces/workspaceContext.js';
import Milestone from '../../models/Milestone.js';
import MilestoneApproval from '../../models/MilestoneApproval.js';

const oid = value => new mongoose.Types.ObjectId(String(value));
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Summaries cross the database boundary as board/user/day totals, never whole
// task documents or lifetime time-entry arrays. All-time reports group once
// per board/user. Date filtering precedes grouping; Mongo may spill to disk.
export async function aggregateFinanceTime(Model, projectIds, filters, { cards = false } = {}) {
  if (!projectIds.length) return [];
  const match = { workspaceId: oid(getActiveWorkspaceId()), board: { $in: projectIds.map(oid) } };
  if (cards) match.isArchived = { $ne: true };
  const bounded = Boolean(filters.startDate || filters.endDate);
  const pipeline = [
    { $match: match },
    { $project: { board: 1, entries: { $concatArrays: [
      { $map: { input: { $ifNull: ['$billedTime', []] }, as: 'e', in: { user: '$$e.user', date: '$$e.date', hours: '$$e.hours', minutes: '$$e.minutes', kind: 'billed' } } },
      { $map: { input: { $ifNull: ['$loggedTime', []] }, as: 'e', in: { user: '$$e.user', date: '$$e.date', hours: '$$e.hours', minutes: '$$e.minutes', kind: 'logged' } } }
    ] } } },
    { $unwind: '$entries' },
    { $set: { day: { $dateToString: { date: { $convert: { input: '$entries.date', to: 'date', onError: null, onNull: null } }, format: '%Y-%m-%d', timezone, onNull: '' } }, minutes: { $add: [{ $multiply: [{ $convert: { input: '$entries.hours', to: 'double', onError: 0, onNull: 0 } }, 60] }, { $convert: { input: '$entries.minutes', to: 'double', onError: 0, onNull: 0 } }] } } },
    { $match: { day: { $ne: '', ...(filters.startDate ? { $gte: filters.startDate } : {}), ...(filters.endDate ? { $lte: filters.endDate } : {}) }, minutes: { $gt: 0 }, ...(filters.userId ? { 'entries.user': oid(filters.userId) } : {}) } },
    { $group: { _id: { board: '$board', user: '$entries.user', kind: '$entries.kind', day: bounded ? '$day' : null }, minutes: { $sum: '$minutes' } } },
    { $limit: 100001 }
  ];
  const rows = await Model.aggregate(pipeline).allowDiskUse(true).option({ maxTimeMS: 20000 });
  if (rows.length > 100000) throw new ErrorResponse('Choose a narrower date range or project for this report', 413);
  const byBoard = new Map();
  for (const row of rows) {
    const id = String(row._id.board);
    if (!byBoard.has(id)) byBoard.set(id, { board: row._id.board, billedTime: [], loggedTime: [] });
    byBoard.get(id)[row._id.kind === 'billed' ? 'billedTime' : 'loggedTime'].push({ user: row._id.user, date: row._id.day ? new Date(`${row._id.day}T12:00:00`) : new Date(), hours: 0, minutes: row.minutes });
  }
  return [...byBoard.values()];
}

export async function aggregateLastActivity(Model, projectIds, type, cards = false) {
  if (!projectIds.length) return [];
  return Model.aggregate([
    { $match: { workspaceId: oid(getActiveWorkspaceId()), board: { $in: projectIds.map(oid) }, ...(cards ? { isArchived: { $ne: true } } : {}) } },
    { $sort: { board: 1, updatedAt: -1, _id: -1 } },
    { $group: { _id: '$board', title: { $first: '$title' }, updatedAt: { $first: '$updatedAt' } } },
    { $project: { board: '$_id', title: 1, updatedAt: 1, ...(type === 'subtask' ? { task: { $literal: true } } : type === 'nano-subtask' ? { subtask: { $literal: true } } : {}) } }
  ]).allowDiskUse(true).option({ maxTimeMS: 20000 });
}

export async function aggregateMilestoneFinance(projectIds, filters) {
  if (!projectIds.length) return { stats: new Map(), lifetime: new Map(), approvals: [] };
  const match = { workspaceId: oid(getActiveWorkspaceId()), board: { $in: projectIds.map(oid) } };
  const bounded = Boolean(filters.startDate || filters.endDate);
  const [stats, lifetime, approvals] = await Promise.all([
    Milestone.aggregate([{ $match: match }, { $group: { _id: '$board', total: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } } } }]).allowDiskUse(true).option({ maxTimeMS: 20000 }),
    MilestoneApproval.aggregate([{ $match: match }, { $group: { _id: '$board', amountCents: { $sum: '$amountCents' } } }]).allowDiskUse(true).option({ maxTimeMS: 20000 }),
    MilestoneApproval.aggregate([
      { $match: match },
      { $set: { day: { $dateToString: { date: '$approvedAt', format: '%Y-%m-%d', timezone, onNull: '' } } } },
      { $match: { day: { $ne: '', ...(filters.startDate ? { $gte: filters.startDate } : {}), ...(filters.endDate ? { $lte: filters.endDate } : {}) } } },
      { $group: { _id: { board: '$board', user: '$approvedBy', day: bounded ? '$day' : null }, amountCents: { $sum: '$amountCents' } } },
      { $limit: 100001 }
    ]).allowDiskUse(true).option({ maxTimeMS: 20000 })
  ]);
  if (approvals.length > 100000) throw new ErrorResponse('Choose a narrower date range or project for this report', 413);
  return {
    stats: new Map(stats.map(row => [String(row._id), row])), lifetime: new Map(lifetime.map(row => [String(row._id), row.amountCents])),
    approvals: approvals.map(row => ({ board: row._id.board, approvedBy: row._id.user, amountCents: row.amountCents, approvedAt: row._id.day ? new Date(`${row._id.day}T12:00:00`) : new Date() }))
  };
}

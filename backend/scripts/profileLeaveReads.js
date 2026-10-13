// Read-only diagnostics: no model initialization, index creation, or maintenance jobs.
import 'dotenv/config';
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import '../models/User.js';
import '../modules/leave/leavePolicyVersion.model.js';
import '../modules/leave/leavePolicy.model.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { queryLeaveRequests, queryLeaveSummary, getAuthorizedRequestDetail } from '../modules/leave/leaveRequestQuery.service.js';
import { getLeaveCalendarEvents } from '../modules/leave/leaveRead.service.js';
import { getFullBalanceBreakdown } from '../modules/leave/leaveBalance.service.js';
import { getPersonalLeaveHistory } from '../modules/leave/leaveHistory.service.js';
import { getEmployeeUsageReport, getMonthlyTrends, getApprovalTurnaround } from '../modules/leave/leaveReport.service.js';
import { getDayStatusForUsers } from '../modules/leave/leaveDayStatus.service.js';
import { resolveLeaveReadScope } from '../modules/leave/leaveRead.service.js';
import { dateOnlyToInstant, getWorkspaceTimezone } from '../modules/leave/leaveTimezone.util.js';

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const report = { capturedAt: new Date().toISOString(), mode: 'read-only service timings; excludes HTTP and browser', samples: [], explains: [], checks: [] };
let commands = [], capture = false;
try {
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, monitorCommands: true, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000 });
  const client = mongoose.connection.getClient();
  const pending = new Map();
  client.on('commandStarted', (event) => {
    if (capture && ['find', 'aggregate', 'distinct', 'count', 'getMore'].includes(event.commandName)) pending.set(event.requestId, { command: event.commandName, collection: event.command[event.commandName] });
  });
  client.on('commandSucceeded', (event) => {
    const row = pending.get(event.requestId);
    if (row) { commands.push({ ...row, ms: event.duration }); pending.delete(event.requestId); }
  });
  const db = mongoose.connection.db;
  // Require an explicit tenant for diagnostics as well as application reads.
  if (!/^[a-f\d]{24}$/i.test(process.env.LEAVE_PROFILE_WORKSPACE || '')) throw new Error('Set LEAVE_PROFILE_WORKSPACE to the workspace ObjectId to profile');
  const workspaceId = new mongoose.Types.ObjectId(process.env.LEAVE_PROFILE_WORKSPACE);
  const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active', role: { $in: ['manager', 'hr', 'admin', 'employee'] } }).select('user role department roleId').lean();
  const requestCount = await db.collection('leaverequests').countDocuments({ workspaceId });
  const dayCount = await db.collection('leaverequestdays').countDocuments({ workspaceId });
  report.dataset = { requests: requestCount, days: dayCount, activeMembers: members.length };
  const [range] = await db.collection('leaverequestdays').find({ workspaceId }).sort({ date: -1 }).limit(1).toArray();
  const month = (range?.date || new Date()).toISOString().slice(0, 7);
  const startDate = `${month}-01`, endDate = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()}`;
  async function measure(label, fn) {
    for (let sample = 0; sample < 3; sample++) {
      commands = []; capture = true;
      const start = performance.now();
      try {
        const result = await fn();
        capture = false;
        const invariant = result?.requests ? { summary: result.summary, total: result.total, requests: result.requests.map((row) => ({ id: row._id, status: row.status, actions: row.actions, progress: row.progress, start: row.startDateKey, end: row.endDateKey })) } : null;
        const row = { label, sample, ms: Math.round(performance.now() - start), queries: commands.length, dbCommandMs: Math.round(commands.reduce((sum, command) => sum + command.ms, 0)), bytes: Buffer.byteLength(JSON.stringify(result)), ...(invariant ? { invariantHash: createHash('sha256').update(JSON.stringify(invariant)).digest('hex') } : {}), slowest: [...commands].sort((a, b) => b.ms - a.ms).slice(0, 4) };
        report.samples.push(row); console.log(JSON.stringify(row));
      } catch (error) { capture = false; report.samples.push({ label, sample, error: error.message }); console.log(`${label}: ${error.message}`); break; }
    }
  }
  await run({ workspaceId }, async () => {
    for (const role of ['manager', 'admin', 'hr', 'employee']) {
      const member = members.find((row) => row.role === role);
      if (!member) continue;
      const viewer = { _id: member.user, id: String(member.user), role: member.role, roleId: member.roleId, department: member.department };
      await measure(`${role}:dashboard`, () => queryLeaveRequests({ workspaceId, viewer, status: 'all' }));
      await measure(`${role}:request-list`, () => queryLeaveRequests({ workspaceId, viewer, status: 'all', includeSummary: false }));
      await measure(`${role}:summary`, () => queryLeaveSummary({ workspaceId, viewer }));
      await measure(`${role}:dashboard-parallel`, async () => {
        const [list, summary] = await Promise.all([
          queryLeaveRequests({ workspaceId, viewer, status: 'all', includeSummary: false }),
          queryLeaveSummary({ workspaceId, viewer })
        ]);
        return { ...list, summary: summary.summary };
      });
      await measure(`${role}:approval-list`, () => queryLeaveRequests({ workspaceId, viewer, view: 'approval', includeSummary: false }));
      const scope = await resolveLeaveReadScope({ workspaceId, viewer });
      if (process.argv.includes('--verify')) {
        const list = await queryLeaveRequests({ workspaceId, viewer, status: 'all' });
        const summary = await queryLeaveSummary({ workspaceId, viewer });
        if (JSON.stringify(list.summary) !== JSON.stringify(summary.summary)) throw new Error(`${role}: summary/list mismatch`);
        const expectedTotal = await mongoose.model('LeaveRequest').countDocuments(scope);
        if (list.total !== expectedTotal) throw new Error(`${role}: authorized count mismatch`);
        let after;
        for (let page = 1; page <= Math.min(3, list.requests.length); page++) {
          const cursorPage = await queryLeaveRequests({ workspaceId, viewer, status: 'all', includeSummary: false, limit: 1, page, after });
          if (String(cursorPage.requests[0]?._id) !== String(list.requests[page - 1]._id) || cursorPage.total !== list.total) throw new Error(`${role}: cursor order/count mismatch`);
          after = cursorPage.nextCursor;
        }
        const timezone = getWorkspaceTimezone(await mongoose.model('Workspace').findById(workspaceId).select('timezone').lean());
        const dayIds = await mongoose.model('LeaveRequestDay').distinct('request', { workspaceId, date: { $gte: dateOnlyToInstant(startDate, timezone), $lte: dateOnlyToInstant(endDate, timezone) } });
        const expectedRange = await mongoose.model('LeaveRequest').countDocuments({ $and: [scope, { _id: { $in: dayIds } }] });
        const rangeList = await queryLeaveRequests({ workspaceId, viewer, startDate, endDate, includeSummary: false });
        if (rangeList.total !== expectedRange) throw new Error(`${role}: date filter mismatch`);
        const searchName = list.requests[0]?.requester?.name;
        if (searchName) {
          const searched = await queryLeaveRequests({ workspaceId, viewer, q: searchName, includeSummary: false });
          if (!searched.requests.some((row) => String(row._id) === String(list.requests[0]._id))) throw new Error(`${role}: employee search mismatch`);
        }
        report.checks.push({ role, summaryMatches: true, authorizedCountMatches: true, cursorPagesChecked: Math.min(3, list.requests.length), dateFilterMatches: true, searchChecked: Boolean(searchName) });
      }
      const first = await mongoose.model('LeaveRequest').findOne(scope).select('_id').lean();
      if (first) await measure(`${role}:detail`, () => getAuthorizedRequestDetail({ workspaceId, viewer, requestId: String(first._id) }));
      if (role === 'manager' || role === 'admin') await measure(`${role}:calendar`, () => getLeaveCalendarEvents({ workspaceId, viewer, startDate, endDate }));
      if (role === 'manager' || role === 'employee') {
        await measure(`${role}:balance`, () => getFullBalanceBreakdown({ workspaceId, user: member.user }));
        await measure(`${role}:history`, () => getPersonalLeaveHistory({ workspaceId, viewer }));
        await measure(`${role}:history-list`, () => getPersonalLeaveHistory({ workspaceId, viewer, includeBalances: false }));
        await measure(`${role}:usage`, () => getEmployeeUsageReport({ workspaceId, userId: member.user }));
        await measure(`${role}:day-status`, () => getDayStatusForUsers({ workspaceId, userIds: [member.user], startDate, endDate, includeLeave: false }));
      }
      if (role === 'admin') {
        await measure(`${role}:trends`, () => getMonthlyTrends({ workspaceId, startDate, endDate }));
        await measure(`${role}:turnaround`, () => getApprovalTurnaround({ workspaceId, startDate, endDate }));
      }
      const explanation = await db.collection('leaverequests').find(scope).sort({ createdAt: -1, _id: -1 }).limit(20).explain('executionStats');
      report.explains.push({ role, query: 'authorized newest page', ms: explanation.executionStats.executionTimeMillis, returned: explanation.executionStats.nReturned, docs: explanation.executionStats.totalDocsExamined, keys: explanation.executionStats.totalKeysExamined, plan: explanation.queryPlanner.winningPlan });
    }
  });
  report.indexes = await db.collection('leaverequests').indexes();
  const output = process.argv[2];
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ dataset: report.dataset, explains: report.explains.map(({ plan, ...rest }) => ({ ...rest, plan: JSON.stringify(plan) })) }));
} finally { await mongoose.disconnect(); }

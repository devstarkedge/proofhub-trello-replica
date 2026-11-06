// Read-only database diagnostics for the explicitly supplied test identity.
// Imports no server, schedulers, seeders or migration runner.
import 'dotenv/config';
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
const report = { mode: 'Read-only service diagnostics; sequential requests; no index or data writes', samples: [], explains: [] };
try {
  await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false, maxPoolSize: 3,
    monitorCommands: true, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 20000 });
  const { run, runUnscoped } = await import('../modules/workspaces/workspaceContext.js');
  const { getMyPermissions, getRoles } = await import('../controllers/roleController.js');
  const User = (await import('../models/User.js')).default;
  const Membership = (await import('../models/WorkspaceMembership.js')).default;
  await import('../models/Workspace.js');
  const identity = await runUnscoped(() => User.findOne({ email: process.env.AUDIT_EMAIL }).select('_id').lean());
  if (!identity) throw new Error('The supplied test identity was not found');
  const member = await runUnscoped(() => Membership.findOne({ user: identity._id, status: 'active' }).lean());
  if (!member || member.role !== 'admin') throw new Error('An active test admin membership is required');
  const workspaceId = member.workspace;
  let commands = [], capture = false;
  const started = new Map();
  mongoose.connection.getClient().on('commandStarted', event => {
    if (capture) started.set(event.requestId, { command: event.commandName, collection: typeof event.command[event.commandName] === 'string' ? event.command[event.commandName] : undefined });
  });
  mongoose.connection.getClient().on('commandSucceeded', event => {
    const row = started.get(event.requestId); if (row) { commands.push({ ...row, durationMs: event.duration }); started.delete(event.requestId); }
  });
  await run({ workspaceId, actorId: identity._id }, async () => {
    for (const [label, handler] of [['permissions', getMyPermissions], ['roles', getRoles]]) {
      for (let sample = 0; sample < 3; sample++) {
        commands = []; capture = true; const start = performance.now(); let bytes = 0;
        await new Promise((resolve, reject) => {
          handler({ user: { _id: identity._id, id: String(identity._id), role: member.role }, workspaceId, query: {} },
            { status() { return this; }, json(value) { bytes = Buffer.byteLength(JSON.stringify(value)); resolve(); } }, reject);
        });
        capture = false; report.samples.push({ label, sample, ms: performance.now() - start, bytes, commands: [...commands] });
      }
    }
  });
  const db = mongoose.connection.db;
  for (const [label, cursor] of [
    ['active-membership-used-by-auth', db.collection('workspacememberships').find({ user: identity._id, workspace: workspaceId, status: 'active' }).limit(1)],
    ['workspace-status-used-by-auth', db.collection('workspaces').find({ _id: workspaceId }, { projection: { isActive: 1, status: 1 } }).limit(1)]
  ]) {
    const plan = await cursor.explain('executionStats');
    report.explains.push({ label, returned: plan.executionStats.nReturned, keysExamined: plan.executionStats.totalKeysExamined,
      documentsExamined: plan.executionStats.totalDocsExamined, executionTimeMillis: plan.executionStats.executionTimeMillis,
      stages: JSON.stringify(plan.queryPlanner.winningPlan).match(/"stage":"[A-Z_]+"/g) });
  }
  // Read server counters and Redis metadata only when this account permits it.
  try { const status = await db.admin().serverStatus(); report.mongoSnapshot = { connections: status.connections,
    opcounters: status.opcounters, note: 'Shared server snapshot; not attributed to this workload' }; } catch { report.mongoSnapshot = { available: false }; }
  await writeFile(new URL('../../reports/performance-2026-11-06/database-reads.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ samples: report.samples.map(row => ({ label: row.label, ms: row.ms, operations: row.commands.length, bytes: row.bytes })), explains: report.explains }));
} catch (error) { console.error('Read-only database diagnostics failed:', error.code || error.name); process.exitCode = 1; }
finally { await mongoose.disconnect(); }

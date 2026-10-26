// Read-only browser-verification companion. Counts the existing per-content
// audit receipts, without taking tokens from the browser or changing records.
import mongoose from 'mongoose';
import { readFile, writeFile } from 'node:fs/promises';
import config from '../config/index.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import AuditLog from '../models/AuditLog.js';
import { WorkSession, TrackingScreenshot } from '../modules/tracking/tracking.models.js';
import { runUnscoped } from '../modules/workspaces/workspaceContext.js';

const [phase, workspaceName, ownerName, day] = process.argv.slice(2);
const output = process.env.SCREENSHOT_MEASURE_OUTPUT || new URL('../../reports/screenshot-browser-requests.json', import.meta.url);
if (!phase || !workspaceName || !ownerName || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) {
  throw new Error('Usage: node scripts/measureScreenshotRequests.mjs PHASE WORKSPACE OWNER YYYY-MM-DD');
}
try {
  await mongoose.connect(config.db.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  await runUnscoped(async () => {
    const workspaces = await Workspace.find({ name: workspaceName }).select('_id').lean();
    const users = await User.find({ name: ownerName }).select('_id').lean();
    if (workspaces.length !== 1 || users.length !== 1) throw new Error('Choose an unambiguous workspace and owner');
    const workspace = workspaces[0]._id;
    const sessions = await WorkSession.find({ workspaceId: workspace, user: users[0]._id, workDateKey: day }).select('_id').lean();
    const screenshots = await TrackingScreenshot.find({ workspaceId: workspace, session: { $in: sessions.map(s => s._id) } }).select('_id').lean();
    let report;
    try { report = JSON.parse(await readFile(output, 'utf8')); } catch { /* First measurement. */ }
    if (phase === 'start' || report?.day !== day || String(report?.workspace) !== String(workspace)) {
      report = { workspace: String(workspace), day, startedAt: new Date().toISOString(), samples: [] };
    }
    const contentReceipts = await AuditLog.countDocuments({ workspace, action: 'TRACKING_SCREENSHOT_VIEWED', targetType: 'TrackingScreenshot',
      targetId: { $in: screenshots.map(s => s._id) }, 'changes.after.kind': { $in: ['content', 'thumbnail'] }, createdAt: { $gte: new Date(report.startedAt) } });
    const sample = { phase, at: new Date().toISOString(), screenshots: screenshots.length, contentReceipts };
    report.samples.push(sample);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(sample));
  });
} catch (error) {
  console.error(JSON.stringify({ verificationFailed: true, code: error.code || 'MEASUREMENT_FAILED' }));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }

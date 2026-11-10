import 'dotenv/config';
import mongoose from 'mongoose';
import Workspace from '../models/Workspace.js';
import AttendancePolicy from '../modules/attendance/attendancePolicy.model.js';
import AttendancePolicyVersion from '../modules/attendance/attendancePolicyVersion.model.js';
import { editPolicy } from '../modules/attendance/attendancePolicy.service.js';
import { AttendanceWorkBreak, readWorkBreak, validateWorkBreak } from '../modules/attendance/attendanceWorkBreak.js';
import { getWorkspaceTimezone, instantToDateOnlyKey } from '../modules/leave/leaveTimezone.util.js';
import { run } from '../modules/workspaces/workspaceContext.js';

async function main() {
  const [name, startLocalTime, endLocalTime, applyFlag, expectedVersion] = process.argv.slice(2);
  if (!name || !startLocalTime || !endLocalTime || (applyFlag && (applyFlag !== '--apply' || !mongoose.isValidObjectId(expectedVersion)))) {
    throw new Error('Usage: node scripts/configureWorkspaceWorkBreak.js "Workspace name" HH:mm HH:mm [--apply CURRENT_VERSION_ID]');
  }
  const scheduledWorkBreak = { startLocalTime, endLocalTime };
  validateWorkBreak(scheduledWorkBreak);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MongoDB connection is not configured.');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 12000 });
  const matches = await Workspace.find({ name }).select('name timezone status isActive attendanceModuleEnabled').limit(2).lean();
  if (matches.length !== 1) throw new Error('Expected exactly one workspace with the supplied name.');
  const workspace = matches[0];
  if (!workspace.attendanceModuleEnabled || workspace.isActive === false || (workspace.status && workspace.status !== 'active')) {
    throw new Error('The workspace must be active with Attendance enabled.');
  }
  await run({ workspaceId: workspace._id }, async () => {
    const active = await AttendancePolicy.findOne({ workspaceId: workspace._id, isDefault: true, status: 'active' }).lean();
    if (!active?.currentVersion) throw new Error('The workspace has no active Attendance Policy.');
    const version = await AttendancePolicyVersion.findOne({ workspaceId: workspace._id, _id: active.currentVersion }).lean();
    if (!version) throw new Error('The current Attendance Policy version was not found.');
    const timezone = getWorkspaceTimezone(workspace);
    const result = {
      workspace: workspace.name, timezone, policy: active.name, currentVersion: String(version._id),
      pendingVersion: active.pendingVersion ? String(active.pendingVersion) : null,
      previous: version.scheduledWorkBreak || null, requested: scheduledWorkBreak
    };
    if (!applyFlag) {
      console.log(JSON.stringify({ ...result, dryRun: true }));
      return;
    }
    if (String(version._id) !== expectedVersion) throw new Error('The active policy version changed. Run the dry-run again.');
    if (active.pendingVersion) throw new Error('A future policy version is already scheduled. Review its break settings before applying.');
    const sameSchedule = rule => rule?.startLocalTime === startLocalTime && rule?.endLocalTime === endLocalTime;
    if (!sameSchedule(version.scheduledWorkBreak)) {
      await AttendanceWorkBreak.createIndexes();
      const { _id, workspaceId, policy, versionNumber, status, effectiveFrom, effectiveUntil,
        createdBy, publishedAt, supersededAt, createdAt, updatedAt, __v, ...content } = version;
      const updated = await editPolicy({
        workspaceId: workspace._id, policyId: active._id, expectedVersionId: version._id,
        effectiveDate: instantToDateOnlyKey(new Date(), timezone),
        content: { ...content, scheduledWorkBreak }
      });
      result.currentVersion = String(updated.version._id);
    }
    const [saved, schedule] = await Promise.all([
      AttendancePolicy.findOne({ workspaceId: workspace._id, isDefault: true, status: 'active' }).select('currentVersion').lean(),
      readWorkBreak(workspace._id, new Date())
    ]);
    if (String(saved?.currentVersion) !== result.currentVersion || !schedule.rules.some(rule => !rule.effectiveUntil && sameSchedule(rule))) {
      throw new Error('Could not verify the active break schedule.');
    }
    console.log(JSON.stringify({ ...result, verified: true }));
  });
}

try {
  await main();
} catch (error) {
  console.error(error.name === 'MongooseServerSelectionError' ? 'MongoDB connection failed.' : error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

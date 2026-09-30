/**
 * One-off: raise maximumGpsAccuracyMeters on a workspace's current
 * Attendance Policy to the new enterprise-scalable default (200m), via the
 * real editPolicy() service call — not a raw Mongo write — so this goes
 * through the same validation, versioning, and history the Policy
 * settings UI itself would produce.
 *
 *   node backend/scripts/bumpGpsAccuracyThreshold.js <workspaceId> [meters] [createdByUserId]
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { getPolicyConfiguration, editPolicy } from '../modules/attendance/attendancePolicy.service.js';
import { instantToDateOnlyKey } from '../modules/leave/leaveTimezone.util.js';
import { getWorkspaceTimezone } from '../modules/leave/leaveTimezone.util.js';
import Workspace from '../models/Workspace.js';

export async function bumpGpsAccuracyThreshold(workspaceId, meters = 200, createdBy = null) {
  return workspaceContext.run({ workspaceId }, async () => {
    const config = await getPolicyConfiguration({ workspaceId });
    if (!config?.currentVersion) {
      throw new Error(`No active Attendance Policy found for workspace ${workspaceId}.`);
    }
    const v = config.currentVersion;
    const before = v.gpsRequirements?.maximumGpsAccuracyMeters;

    const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
    const timezone = getWorkspaceTimezone(workspace);
    const todayKey = instantToDateOnlyKey(new Date(), timezone);

    // Full content clone — only the one field changes, everything else on
    // the current active version is preserved exactly as-is.
    const content = {
      allowedWorkModes: v.allowedWorkModes,
      officeHours: v.officeHours,
      graceMinutes: v.graceMinutes,
      earlyExitGraceMinutes: v.earlyExitGraceMinutes,
      minimumFullDayMinutes: v.minimumFullDayMinutes,
      minimumHalfDayMinutes: v.minimumHalfDayMinutes,
      halfDayTrigger: v.halfDayTrigger,
      gpsRequirements: { ...v.gpsRequirements, maximumGpsAccuracyMeters: meters },
      missingCheckout: v.missingCheckout,
      offDayAttendanceBehavior: v.offDayAttendanceBehavior,
      holidayAttendanceBehavior: v.holidayAttendanceBehavior,
      fullDayLeaveCheckInBehavior: v.fullDayLeaveCheckInBehavior,
      office: v.office,
      wfh: v.wfh,
      hybrid: v.hybrid,
      field: v.field,
      regularization: v.regularization,
      excludedRoles: v.excludedRoles,
      excludedUserIds: v.excludedUserIds
    };

    const { version } = await editPolicy({
      workspaceId, policyId: config._id, effectiveDate: todayKey, content, createdBy
    });
    return { before, after: version.gpsRequirements.maximumGpsAccuracyMeters, versionNumber: version.versionNumber };
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [workspaceId, metersArg, createdByArg] = process.argv.slice(2);
  if (!workspaceId) {
    console.error('Usage: node backend/scripts/bumpGpsAccuracyThreshold.js <workspaceId> [meters] [createdByUserId]');
    process.exit(1);
  }
  const meters = metersArg ? Number(metersArg) : 200;
  const createdBy = createdByArg || null;
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }

  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await bumpGpsAccuracyThreshold(workspaceId, meters, createdBy);
      console.log(`maximumGpsAccuracyMeters: ${result.before}m -> ${result.after}m (new policy version ${result.versionNumber})`);
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('bumpGpsAccuracyThreshold failed:', err.message);
      process.exit(1);
    });
}

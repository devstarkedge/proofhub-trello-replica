import { processAttendanceEvents } from '../attendance/attendanceEvents.service.js';
import { processAttendanceReports } from '../../services/chat/attendanceReporting.service.js';
import Workspace from '../../models/Workspace.js';
import { run } from '../workspaces/workspaceContext.js';
import { TrackingScreenshot, ActivityInterval } from './tracking.models.js';
import { reconcileWorkspaceSessions, policyFor } from './tracking.service.js';
import { removePrivateScreenshot, removePrivateThumbnail } from './tracking.storage.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { removeLegacyScreenshot } from './tracking.legacyStorage.js';
import { finishDisable } from './tracking.settings.js';
import { sendTrackingReminders } from './tracking.reminders.js';

// Operational maintenance interval (sessions, attendance events, reminders): 15 seconds
const OPERATIONAL_INTERVAL_MS = 15000;

// Screenshot retention cleanup interval (Cloudflare R2 deletion + interval purge):
// Configurable via SCREENSHOT_EXPIRY_CHECK_WORKER in .env (default: 12 hours)
export function getRetentionCleanupIntervalMs() {
  const hours = parseFloat(process.env.SCREENSHOT_EXPIRY_CHECK_WORKER || process.env.SCREENSHOT_CLEANUP_INTERVAL_HOURS);
  const validHours = !isNaN(hours) && hours > 0 ? hours : 12;
  return validHours * 60 * 60 * 1000;
}

let operationalTimer = null;
let reportingTimer = null;
let reportingRunning = false;
let retentionTimer = null;
let initialRetentionTimeout = null;
let operationalRunning = false;
let retentionRunning = false;

/**
 * Operational maintenance: attendance events, session reconciliation, disable recovery, reminders.
 * Runs at a fast cadence (every 15s) to keep user session states responsive.
 */
export async function trackingMaintenance() {
  if (operationalRunning) return;
  operationalRunning = true;
  try {
    for await (const workspace of Workspace.find({}).select('_id').cursor()) {
      await run({ workspaceId: workspace._id }, async () => {
        await processAttendanceEvents(workspace._id);
        await reconcileWorkspaceSessions(workspace._id);
        const policy = await policyFor(workspace._id);
        if (policy.disableRecoveryPending) await finishDisable(workspace._id, policy);
        await sendTrackingReminders(workspace._id, policy);
      });
    }
  } finally {
    operationalRunning = false;
  }
}

/**
 * Deletes expired screenshots from Cloudflare R2 and removes expired activity intervals.
 * Processes in batches to handle accumulated captures safely without infinite loops.
 */
export async function cleanExpiredScreenshotsForWorkspace(workspaceId) {
  const BATCH_SIZE = 100;
  const MAX_BATCHES = 50; // Safety cap: up to 5,000 screenshots per workspace per run
  let batchCount = 0;
  const failedIds = [];

  while (batchCount < MAX_BATCHES) {
    const filter = {
      workspaceId,
      expiresAt: { $ne: null, $lte: new Date() },
      status: { $ne: 'DELETED' }
    };
    if (failedIds.length > 0) {
      filter._id = { $nin: failedIds };
    }

    const expired = await TrackingScreenshot.find(filter).limit(BATCH_SIZE).lean();
    if (!expired || expired.length === 0) break;

    for (const screenshot of expired) {
      try {
        if (screenshot.storageProvider === 'cloudflare-r2') {
          await removePrivateScreenshot(screenshot);
        } else if (screenshot.thumbnail?.storageKey) {
          await removePrivateThumbnail(screenshot);
        }
        await removeLegacyScreenshot(screenshot);

        await TrackingScreenshot.updateOne(
          { _id: screenshot._id },
          { $set: { status: 'DELETED', uploadStatus: 'DELETED', deletedAt: new Date() } }
        );

        await recordAuditLog({
          action: 'TRACKING_SCREENSHOT_RETENTION_DELETED',
          targetType: 'TrackingScreenshot',
          targetId: screenshot._id,
          category: 'attendance_management',
          summary: 'Expired private screenshot deleted',
          meta: { workspaceId }
        });
      } catch (error) {
        console.error(`[Tracking] retention cleanup retry for screenshot ${screenshot._id}:`, error.message);
        failedIds.push(screenshot._id);
      }
    }

    batchCount++;
    if (expired.length < BATCH_SIZE) break;
  }

  // Retry recent tombstones beyond upload capability window (120s)
  try {
    const recentTombstones = await TrackingScreenshot.find({
      workspaceId,
      expiresAt: { $ne: null, $lte: new Date() },
      status: 'DELETED',
      deletedAt: { $gte: new Date(Date.now() - 300000) }
    }).limit(100).lean();

    for (const screenshot of recentTombstones) {
      try {
        if (screenshot.storageProvider === 'cloudflare-r2') {
          await removePrivateScreenshot(screenshot);
        } else if (screenshot.thumbnail?.storageKey) {
          await removePrivateThumbnail(screenshot);
        }
        await removeLegacyScreenshot(screenshot);
      } catch {
        // Tombstone retry is best-effort
      }
    }
  } catch (err) {
    console.error('[Tracking] tombstone cleanup error:', err.message);
  }

  await ActivityInterval.deleteMany({ workspaceId, expiresAt: { $ne: null, $lte: new Date() } });
}

/**
 * Retention maintenance: loops through all workspaces and permanently removes expired
 * screenshots and thumbnails from Cloudflare R2 storage and database records.
 * Scheduled to run every 12 hours.
 */
export async function trackingRetentionMaintenance() {
  if (retentionRunning) return;
  retentionRunning = true;
  try {
    for await (const workspace of Workspace.find({}).select('_id').cursor()) {
      await run({ workspaceId: workspace._id }, async () => {
        await cleanExpiredScreenshotsForWorkspace(workspace._id);
      });
    }
  } catch (error) {
    console.error('[Tracking] retention maintenance:', error.message);
  } finally {
    retentionRunning = false;
  }
}

export function startTrackingMaintenance() {
  if (!reportingTimer) {
    reportingTimer = setInterval(async () => {
      if (reportingRunning) return;
      reportingRunning = true;
      try {
        for await (const workspace of Workspace.find({}).select('_id').cursor()) {
          await run({ workspaceId: workspace._id }, () => processAttendanceReports(workspace._id));
        }
      } catch (error) { console.error('[Reporting] maintenance:', error.message); }
      finally { reportingRunning = false; }
    }, OPERATIONAL_INTERVAL_MS);
    reportingTimer.unref();
  }
  if (!operationalTimer) {
    operationalTimer = setInterval(
      () => trackingMaintenance().catch(e => console.error('[Tracking] maintenance:', e.message)),
      OPERATIONAL_INTERVAL_MS
    );
    operationalTimer.unref();
  }

  if (!retentionTimer) {
    const intervalMs = getRetentionCleanupIntervalMs();
    retentionTimer = setInterval(
      () => trackingRetentionMaintenance().catch(e => console.error('[Tracking] retention maintenance:', e.message)),
      intervalMs
    );
    retentionTimer.unref();
  }

  // Run initial retention sweep shortly after startup so any backlog while offline is cleared
  if (!initialRetentionTimeout) {
    initialRetentionTimeout = setTimeout(
      () => trackingRetentionMaintenance().catch(e => console.error('[Tracking] initial retention sweep:', e.message)),
      5000
    );
    initialRetentionTimeout.unref();
  }
}

export function stopTrackingMaintenance() {
  if (reportingTimer) { clearInterval(reportingTimer); reportingTimer = null; }
  if (operationalTimer) {
    clearInterval(operationalTimer);
    operationalTimer = null;
  }
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
  if (initialRetentionTimeout) {
    clearTimeout(initialRetentionTimeout);
    initialRetentionTimeout = null;
  }
}

import Workspace from '../../models/Workspace.js';
import { run } from '../workspaces/workspaceContext.js';
import { TrackingScreenshot, ActivityInterval } from './tracking.models.js';
import { reconcileWorkspaceSessions, policyFor } from './tracking.service.js';
import { removePrivateScreenshot,removePrivateThumbnail } from './tracking.storage.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import {removeLegacyScreenshot} from './tracking.legacyStorage.js';
import {finishDisable} from './tracking.settings.js';
import {sendTrackingReminders} from './tracking.reminders.js';

let timer, running = false;
export async function trackingMaintenance() {
  if (running) return; running = true;
  try {
    for await (const workspace of Workspace.find({}).select('_id').cursor()) {
      await run({ workspaceId: workspace._id }, async () => {
        await reconcileWorkspaceSessions(workspace._id);
        const policy=await policyFor(workspace._id);if(policy.disableRecoveryPending)await finishDisable(workspace._id,policy);
        await sendTrackingReminders(workspace._id,policy);
        // Retry recent tombstones beyond the longest upload capability (120s),
        // so a PUT issued before expiry cannot recreate an abandoned object.
        const expired = await TrackingScreenshot.find({ workspaceId: workspace._id, expiresAt:{$ne:null,$lte:new Date()},$or:[{status:{$ne:'DELETED'}},{deletedAt:{$gte:new Date(Date.now()-300000)}}] }).limit(100).lean();
        for (const screenshot of expired) {
          try { if(screenshot.storageProvider==='cloudflare-r2')await removePrivateScreenshot(screenshot);else if(screenshot.thumbnail?.storageKey)await removePrivateThumbnail(screenshot);
            await removeLegacyScreenshot(screenshot);
            if(screenshot.status!=='DELETED'){
              await TrackingScreenshot.updateOne({ _id: screenshot._id }, { $set: { status: 'DELETED', uploadStatus:'DELETED', deletedAt: new Date() } });
              await recordAuditLog({action:'TRACKING_SCREENSHOT_RETENTION_DELETED',targetType:'TrackingScreenshot',targetId:screenshot._id,category:'attendance_management',summary:'Expired private screenshot deleted',meta:{workspaceId:workspace._id}});
            }
          } catch (error) { console.error('[Tracking] retention cleanup will retry:', error.message); }
        }
        await ActivityInterval.deleteMany({workspaceId:workspace._id,expiresAt:{$ne:null,$lte:new Date()}});
      });
    }
  } finally { running = false; }
}
export function startTrackingMaintenance() {
  if (timer) return;
  timer = setInterval(() => trackingMaintenance().catch(e => console.error('[Tracking] maintenance:',e.message)), 15000);
  timer.unref();
}
export function stopTrackingMaintenance() { clearInterval(timer); timer = null; }

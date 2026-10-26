// Read-only MongoDB checks plus short-lived Redis metadata. Reuses the exact
// command connection used by the application; never prints connection URLs.
import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { WorkSession } from '../modules/tracking/tracking.models.js';
import { gallery } from '../modules/tracking/tracking.gallery.js';
import { observeTrackingRead, trackingReadCacheStats } from '../modules/tracking/tracking.readCache.js';
import { connectRedis, getSharedConnection, closeSharedConnection } from '../queues/connection.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';

const [workspaceName, viewerName, ownerName, day] = process.argv.slice(2);
try {
  if (!workspaceName || !viewerName || !ownerName || !day) throw new Error('Supply workspace, viewer, owner and date');
  const client = await connectRedis({ cacheOnly: true });
  if (!client) throw new Error('Redis cache is not configured');
  await mongoose.connect(config.db.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const { workspace, viewer, session } = await runUnscoped(async () => {
    const workspaces = await Workspace.find({ name: workspaceName }).select('_id').lean();
    const viewers = await User.find({ name: viewerName }).select('_id').lean();
    const owners = await User.find({ name: ownerName }).select('_id').lean();
    if (workspaces.length !== 1 || viewers.length !== 1 || owners.length !== 1) throw new Error('Ambiguous verification input');
    const sessions = await WorkSession.find({ workspaceId: workspaces[0]._id, user: owners[0]._id, workDateKey: day }).select('_id').lean();
    if (sessions.length !== 1) throw new Error('Choose exactly one day');
    return { workspace: workspaces[0], viewer: viewers[0], session: sessions[0] };
  });
  const samples = [];
  const read = phase => run({ workspaceId: workspace._id }, async () => {
    const result = await observeTrackingRead(() => gallery(workspace._id, viewer._id, { sessionId: String(session._id) }));
    samples.push({ phase, ...result.metrics, milliseconds: Math.round(result.durationMs), screenshots: result.data.screenshots.length });
    return result;
  });
  await read('cold'); await read('warm');
  client.disconnect(); // Only this verification process; app sockets stay intact.
  await read('disconnected-fallback');
  await connectRedis({ cacheOnly: true });
  await read('reconnected'); await read('warm-after-reconnect');
  if (client !== getSharedConnection() || !samples[1].hit || !samples[2].bypass || !samples[4].hit) throw new Error('Cache verification failed');
  console.log(JSON.stringify({ sharedConnectionReused: true, samples, counters: trackingReadCacheStats() }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ verificationFailed: true, code: error.code || 'CACHE_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect(); await closeSharedConnection();
  // Imported domain services own maintenance timers. This verification CLI
  // closes its own IO above, then exits without starting an application server.
  process.exit(process.exitCode || 0);
}

// Dry-run by default. Run from backend; never schedules production cleanup.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { TrackingScreenshot } from '../modules/tracking/tracking.models.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';
import { privateStorage, verifyPrivateUpload, thumbnailDescriptor, removePrivateThumbnail } from '../modules/tracking/tracking.storage.js';
import { inspectCleanupCandidate, executeCleanupCandidate } from '../modules/tracking/tracking.cleanup.js';
import { recordAuditLog } from '../modules/permissions/auditLogService.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Dry run: node scripts/cleanupScreenshotThumbnails.js --workspace <id> --manifest <file>\nExecute only after approval: add --execute --approve-sha256 <reviewed manifest hash>\nRerun the same command to resume. Canonical objects and ambiguous pairs are preserved.');
  process.exit(0);
}
const value = flag => args[args.indexOf(flag) + 1];
const execute = args.includes('--execute');
const workspaceId = args.includes('--workspace') ? value('--workspace') : '';
const manifestPath = args.includes('--manifest') ? path.resolve(value('--manifest')) : '';
if (!/^[a-f\d]{24}$/i.test(workspaceId) || !manifestPath) throw new Error('Required: --workspace <id> --manifest <file>. Default: dry-run.');
const bucket = privateStorage().config.bucket;
const verifyCanonical = record => verifyPrivateUpload(record);
const verifyThumbnail = record => verifyPrivateUpload(thumbnailDescriptor(record));
try {
  // A dry run must not create collections or indexes as a model side effect.
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false });
  await run({ workspaceId }, async () => {
    if (!execute) {
      // A dry run can be resumed: append only verified, new candidates to a
      // reviewed manifest. Never overwrite another workspace's manifest.
      let manifest = { version: 1, workspaceId, bucket, candidates: [] };
      try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (manifest.version !== 1 || manifest.workspaceId !== workspaceId || manifest.bucket !== bucket) throw new Error('Manifest scope mismatch');
      const known = new Set(manifest.candidates.map(candidate => candidate.screenshotId));
      const cursor = TrackingScreenshot.find({ workspaceId, status: 'READY', storageProvider: 'cloudflare-r2', 'thumbnail.storageKey': { $exists: true } }).sort({ _id: 1 }).lean().cursor();
      for await (const record of cursor) {
        if (known.has(String(record._id))) continue;
        try {
          if (record.storageBucket !== bucket) throw new Error('Bucket mismatch');
          const candidate = await inspectCleanupCandidate(record, { verifyCanonical, verifyThumbnail });
          if (!candidate) continue;
          manifest.candidates.push(candidate); known.add(candidate.screenshotId);
          await fs.writeFile(manifestPath + '.tmp', JSON.stringify(manifest, null, 2));
          await fs.rename(manifestPath + '.tmp', manifestPath);
        } catch (error) { console.error(`Preserved ${record._id}: ${error.message}`); }
      }
      // Also create a reviewable empty manifest when there are no candidates.
      if (!manifest.candidates.length) await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const bytes = await fs.readFile(manifestPath);
      console.log(JSON.stringify({ dryRun: true, candidates: manifest.candidates.length, manifestSha256: createHash('sha256').update(bytes).digest('hex') }));
      return;
    }
    const bytes = await fs.readFile(manifestPath);
    const approvedHash = args.includes('--approve-sha256') ? value('--approve-sha256') : '';
    if (approvedHash !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Execution requires --approve-sha256 <reviewed manifest hash>');
    const manifest = JSON.parse(bytes);
    if (manifest.version !== 1 || manifest.workspaceId !== workspaceId || manifest.bucket !== bucket) throw new Error('Manifest scope mismatch');
    for (const candidate of manifest.candidates) {
      if (candidate.workspaceId !== workspaceId) throw new Error('Candidate scope mismatch');
      try {
        const status = await executeCleanupCandidate(candidate, {
          find: id => TrackingScreenshot.findOne({ workspaceId, _id: id }).lean(), verifyCanonical,
          referenced: key => runUnscoped(() => TrackingScreenshot.exists({ $or: [{ storageKey: key }, { _id: { $ne: candidate.screenshotId }, 'thumbnail.storageKey': key }] })),
          removeThumbnail: removePrivateThumbnail,
          unsetThumbnail: async record => {
            const result = await TrackingScreenshot.updateOne({ workspaceId, _id: record._id, checksum: record.checksum, 'thumbnail.storageKey': record.thumbnail.storageKey }, { $unset: { thumbnail: 1 } });
            if (result.modifiedCount !== 1) throw new Error('Metadata changed during cleanup; inspect before retry');
            await recordAuditLog({ action: 'TRACKING_REDUNDANT_THUMBNAIL_DELETED', targetType: 'TrackingScreenshot', targetId: record._id, category: 'attendance_management', summary: 'Verified redundant screenshot thumbnail deleted', meta: { workspaceId, manifestSha256: approvedHash } });
          }
        });
        await fs.appendFile(manifestPath + '.progress.jsonl', JSON.stringify({ screenshotId: candidate.screenshotId, status, at: new Date() }) + '\n');
      } catch (error) {
        process.exitCode = 1;
        console.error(`Preserved/retry ${candidate.screenshotId}: ${error.message}`);
      }
    }
  });
} finally { await mongoose.disconnect(); }

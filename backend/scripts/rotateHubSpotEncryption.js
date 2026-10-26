// Run after deploying a new current key alongside the previous key versions.
// No Service Keys, envelopes or master keys are printed.
import mongoose from 'mongoose';
import config from '../config/index.js';
import { HubSpotConnection } from '../modules/hubspot/models.js';
import { encryptCredential, decryptCredential, encryptionReady } from '../modules/hubspot/crypto.js';
import { run, runUnscoped } from '../modules/workspaces/workspaceContext.js';
import { withHubSpotLock } from '../modules/hubspot/locks.js';

async function main() {
  const version = encryptionReady();
  await mongoose.connect(config.db.uri);
  let rotated = 0;
  try {
    await runUnscoped(async () => {
      for await (const connection of HubSpotConnection.find({ 'credential.keyVersion': { $ne: version } }).select('+credential').lean().cursor()) {
        await run({ workspaceId: connection.workspaceId }, () => withHubSpotLock(`workspace:${connection.workspaceId}`, async () => {
          const current = await HubSpotConnection.findById(connection._id).select('+credential').lean();
          const credential = encryptCredential(decryptCredential(current.credential, current.workspaceId, current.portalId), current.workspaceId, current.portalId);
          const result = await HubSpotConnection.updateOne({ _id: current._id, version: current.version }, { $set: { credential } });
          rotated += result.modifiedCount;
        }));
      }
    });
    console.log(`Rotated ${rotated} HubSpot credential envelopes.`);
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('Credential rotation stopped. Verify secret manager key versions and retry.'); process.exitCode = 1; });

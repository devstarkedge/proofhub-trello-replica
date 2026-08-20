/**
 * One-time backfill: link the single existing FlowTask workspace to its
 * already-existing ChatApp workspace counterpart.
 *
 * Context: before this integration became workspace-aware, FlowTask and
 * ChatApp implicitly assumed exactly one tenant on each side. This script
 * makes that pre-existing pairing explicit by writing the first
 * WorkspaceIntegrationMapping row, so every FUTURE FlowTask workspace can
 * get its own distinct ChatApp workspace (see chatWebhookPayloads.js /
 * chatIntegrationController.js#getChatRedirectUrl) without disturbing the
 * one that's already live.
 *
 * The two apps are separate MongoDB deployments — this script cannot look
 * up ChatApp's workspace id itself, so the operator supplies it (visible in
 * ChatApp's own admin UI / DB). This is deliberately NOT run automatically
 * at boot (unlike migrateWorkspaces.js) for that reason.
 *
 * Idempotent — safe to re-run; uses $setOnInsert so re-running never
 * clobbers a mapping that already exists.
 *
 * Usage:
 *   CHATAPP_WORKSPACE_ID=<24-hex-id> [CHATAPP_WORKSPACE_SLUG=<slug>] \
 *     node backend/scripts/migrateChatWorkspaceMapping.js
 *
 *   node backend/scripts/migrateChatWorkspaceMapping.js --chatapp-workspace-id=<id> [--chatapp-workspace-slug=<slug>]
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Workspace from '../models/Workspace.js';
import WorkspaceIntegrationMapping from '../models/WorkspaceIntegrationMapping.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

function parseCliArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

export async function runChatWorkspaceMappingMigration({
  chatAppWorkspaceId = process.env.CHATAPP_WORKSPACE_ID || parseCliArg('chatapp-workspace-id'),
  chatAppWorkspaceSlug = process.env.CHATAPP_WORKSPACE_SLUG || parseCliArg('chatapp-workspace-slug') || null,
} = {}) {
  return workspaceContext.runUnscoped(async () => {
    if (!chatAppWorkspaceId || !/^[0-9a-fA-F]{24}$/.test(chatAppWorkspaceId)) {
      throw new Error(
        'CHATAPP_WORKSPACE_ID (24-hex ChatApp Workspace _id) is required — set it as an env var or pass --chatapp-workspace-id=<id>.',
      );
    }

    const count = await Workspace.countDocuments();
    if (count !== 1) {
      throw new Error(
        `Expected exactly one FlowTask Workspace to migrate (found ${count}). This script only handles the simple ` +
        'single-existing-workspace case; if you now have multiple workspaces, resolve the correct pairing manually ' +
        'instead of guessing.',
      );
    }

    const workspace = await Workspace.findOne();

    const existing = await WorkspaceIntegrationMapping.findOne({ flowTaskWorkspaceId: workspace._id });
    if (existing) {
      return {
        skipped: true,
        reason: 'Mapping already exists',
        flowTaskWorkspaceId: workspace._id.toString(),
        chatAppWorkspaceId: existing.chatAppWorkspaceId,
      };
    }

    const mapping = await WorkspaceIntegrationMapping.findOneAndUpdate(
      { flowTaskWorkspaceId: workspace._id },
      {
        $setOnInsert: {
          flowTaskWorkspaceId: workspace._id,
          chatAppWorkspaceId,
          chatAppWorkspaceSlug,
          syncOrigin: 'user_initiated',
          linkedBy: workspace.owner,
          linkedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    return {
      created: true,
      flowTaskWorkspaceId: workspace._id.toString(),
      flowTaskWorkspaceName: workspace.name,
      chatAppWorkspaceId: mapping.chatAppWorkspaceId,
      chatAppWorkspaceSlug: mapping.chatAppWorkspaceSlug,
    };
  });
}

export default runChatWorkspaceMappingMigration;

// Allow standalone execution: node backend/scripts/migrateChatWorkspaceMapping.js
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await runChatWorkspaceMappingMigration();
      console.log('Chat workspace mapping migration result:', JSON.stringify(result, null, 2));
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Chat workspace mapping migration failed:', err.message);
      process.exit(1);
    });
}

import mongoose from 'mongoose';
import crypto from 'crypto';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Department from '../../models/Department.js';
import { createWorkspaceCore } from '../../modules/workspaces/workspaceCreation.js';
import { createDefaultSubscription } from '../../modules/superAdmin/subscriptionService.js';
import { slugify } from '../../utils/slug.js';
import * as workspaceContext from '../../modules/workspaces/workspaceContext.js';
import * as workspaceMappingService from './workspaceMappingService.js';
import logger from '../../utils/logger.js';

/**
 * Provision a FlowTask workspace from a ChatApp-originated
 * WORKSPACE_CREATED announcement (see controllers/chatInboundController.js).
 *
 * Structurally separate from workspaceController.js#createWorkspace (the
 * human HTTP path) — this is the load-bearing half of loop prevention (see
 * workspaceCreation.js's header comment). This function never calls a
 * chat-announce hook.
 *
 * Idempotent: a second call for the same chatWorkspaceId (e.g. a retried
 * announce after a lost response) returns the existing mapping instead of
 * creating a duplicate FlowTask workspace.
 *
 * @param {object} params
 * @param {string} params.ownerId - FlowTask User _id (from chatUserProvisioningService)
 * @param {string} params.chatWorkspaceId - ChatApp's real Workspace _id (string)
 * @param {string} [params.chatWorkspaceName]
 * @param {string} [params.chatWorkspaceSlug]
 * @returns {Promise<{flowTaskWorkspaceId: string, created: boolean}>}
 */
export async function provisionFromChatApp({ ownerId, chatWorkspaceId, chatWorkspaceName, chatWorkspaceSlug }) {
  if (!chatWorkspaceId) {
    throw new Error('provisionFromChatApp: chatWorkspaceId is required');
  }

  const existing = await workspaceMappingService.findByChatAppWorkspaceId(chatWorkspaceId);
  if (existing) {
    return { flowTaskWorkspaceId: existing.flowTaskWorkspaceId.toString(), created: false };
  }

  const name = chatWorkspaceName || 'ChatApp Workspace';
  let slug = slugify(chatWorkspaceSlug || chatWorkspaceName || 'chatapp-workspace') || 'chatapp-workspace';

  for (let attempt = 0; attempt < 5; attempt++) {
    const session = await mongoose.startSession();
    let workspace = null;
    try {
      await session.withTransaction(async () => {
        // 'team' is the one FlowTask workspace type that requires a
        // department but not industry/companySize — the minimal data
        // ChatApp actually has about a workspace it created.
        const result = await createWorkspaceCore({
          name,
          slug,
          type: 'team',
          industry: null,
          companySize: null,
          departmentName: 'General',
          ownerId,
          session,
        });
        workspace = result.workspace;
      });

      createDefaultSubscription(workspace._id).catch((err) => {
        logger.error('Failed to create default subscription for ChatApp-provisioned workspace', {
          workspaceId: workspace._id,
          error: err.message,
        });
      });

      const mapping = await workspaceMappingService.createMapping({
        flowTaskWorkspaceId: workspace._id,
        chatAppWorkspaceId: chatWorkspaceId,
        chatAppWorkspaceSlug: chatWorkspaceSlug || null,
        syncOrigin: 'sync_provisioned',
        linkedBy: ownerId,
      });

      // createMapping self-heals a unique-index race by returning the
      // winning row instead of throwing — if that winner isn't the
      // workspace we just committed, we lost the race and must not keep
      // this orphaned one around.
      if (mapping.flowTaskWorkspaceId.toString() !== workspace._id.toString()) {
        await _rollbackOrphanedProvisioning(workspace._id, ownerId);
        return { flowTaskWorkspaceId: mapping.flowTaskWorkspaceId.toString(), created: false };
      }

      logger.info('FlowTask workspace provisioned from ChatApp', {
        flowTaskWorkspaceId: workspace._id.toString(),
        chatWorkspaceId,
        ownerId,
      });

      return {
        flowTaskWorkspaceId: workspace._id.toString(),
        flowTaskWorkspaceSlug: workspace.slug,
        flowTaskWorkspaceName: workspace.name,
        created: true,
      };
    } catch (error) {
      // ErrorResponse('This workspace URL is already taken', 409) is
      // thrown proactively by createWorkspaceCore's slug check, before any
      // write — not a raw Mongo duplicate-key error, but the same
      // "retry with a suffixed slug" remedy applies. A genuine 11000 (e.g.
      // WorkspaceIntegrationMapping's unique index) means something WAS
      // already committed and needs rolling back first.
      const isSlugTaken = error?.statusCode === 409;
      const isDuplicateKey = error?.code === 11000;
      if (!isSlugTaken && !isDuplicateKey) throw error;

      if (workspace) {
        await _rollbackOrphanedProvisioning(workspace._id, ownerId);
      }

      const concurrentMapping = await workspaceMappingService.findByChatAppWorkspaceId(chatWorkspaceId);
      if (concurrentMapping) {
        return { flowTaskWorkspaceId: concurrentMapping.flowTaskWorkspaceId.toString(), created: false };
      }

      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    } finally {
      await session.endSession();
    }
  }

  throw new Error(`Failed to provision FlowTask workspace for chatWorkspaceId=${chatWorkspaceId} after retries.`);
}

/**
 * Compensating cleanup for provisionFromChatApp: deletes a
 * partially-created Workspace + its Department + owner WorkspaceMembership
 * when a unique-index race means it can't be kept. Structurally identical
 * to ChatApp's own _rollbackOrphanedWorkspace. Never throws — logs and
 * moves on, since the caller always retries or returns a different
 * workspace afterward regardless.
 * @private
 */
async function _rollbackOrphanedProvisioning(workspaceId, ownerId) {
  try {
    await workspaceContext.run({ workspaceId }, async () => {
      await Department.deleteMany({});
    });
    await WorkspaceMembership.deleteMany({ workspace: workspaceId, user: ownerId });
    await Workspace.deleteOne({ _id: workspaceId });
  } catch (err) {
    logger.error('Failed to roll back orphaned FlowTask workspace provisioned from ChatApp', {
      workspaceId,
      ownerId,
      error: err.message,
    });
  }
}

export default { provisionFromChatApp };

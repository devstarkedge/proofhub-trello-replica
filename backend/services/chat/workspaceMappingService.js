import WorkspaceIntegrationMapping from '../../models/WorkspaceIntegrationMapping.js';

/**
 * Centralized home for FlowTask↔ChatApp workspace-mapping resolution.
 * Previously `resolveWorkspaceIdFromRequest` lived privately inside
 * chatIntegrationController.js; this module gives both that controller and
 * the new reverse-sync inbound receiver (chatInboundController.js) one
 * shared place for mapping lookups/creates, mirroring ChatApp's own
 * workspaceMappingResolver.js.
 */

/**
 * The real FlowTask workspace id, always present once `protect` has run
 * (routes/chatIntegration.js mounts `router.use(protect)` on everything that
 * calls this) — the header/query fallbacks are kept only for
 * defense-in-depth if this is ever called without `protect`, which doesn't
 * happen today.
 */
export function resolveWorkspaceIdFromRequest(req) {
  if (req.workspaceId) return req.workspaceId.toString();

  const fromHeader = req.headers['x-workspace-id'];
  if (fromHeader) return fromHeader.toString();

  const fromQuery = req.query?.workspaceId;
  if (fromQuery) return fromQuery.toString();

  return null;
}

export function findByFlowTaskWorkspaceId(flowTaskWorkspaceId) {
  return WorkspaceIntegrationMapping.findOne({ flowTaskWorkspaceId, status: 'active' });
}

export function findByChatAppWorkspaceId(chatAppWorkspaceId) {
  return WorkspaceIntegrationMapping.findOne({ chatAppWorkspaceId, status: 'active' });
}

/**
 * Create a mapping row, idempotently. On a unique-index race (a concurrent
 * request already created the same mapping), re-fetch and return the
 * winner instead of throwing — mirrors the pattern already proven in
 * ChatApp's findOrCreateFlowTaskWorkspace.
 */
export async function createMapping({ flowTaskWorkspaceId, chatAppWorkspaceId, chatAppWorkspaceSlug = null, syncOrigin = 'user_initiated', linkedBy = null }) {
  try {
    return await WorkspaceIntegrationMapping.create({
      flowTaskWorkspaceId,
      chatAppWorkspaceId,
      chatAppWorkspaceSlug,
      syncOrigin,
      linkedBy,
      linkedAt: new Date(),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await findByChatAppWorkspaceId(chatAppWorkspaceId) || await findByFlowTaskWorkspaceId(flowTaskWorkspaceId);
    if (!existing) throw error;
    return existing;
  }
}

/**
 * Repair or create the reverse lookup when ChatApp proves the current pair
 * through an HMAC-authenticated request. This covers workspaces first linked
 * through the browser SSO flow, where ChatApp knew both ids but FlowTask did
 * not receive the ChatApp id back.
 */
export async function reconcileMapping({
  flowTaskWorkspaceId,
  chatAppWorkspaceId,
  chatAppWorkspaceSlug = null,
  syncOrigin = 'user_initiated',
}) {
  const [byFlowTask, byChatApp] = await Promise.all([
    findByFlowTaskWorkspaceId(flowTaskWorkspaceId),
    findByChatAppWorkspaceId(chatAppWorkspaceId),
  ]);

  if (byChatApp && String(byChatApp.flowTaskWorkspaceId) !== String(flowTaskWorkspaceId)) {
    const error = new Error('ChatApp workspace is already linked to a different FlowTask workspace');
    error.code = 'WORKSPACE_MAPPING_CONFLICT';
    throw error;
  }

  if (byFlowTask) {
    if (String(byFlowTask.chatAppWorkspaceId) === String(chatAppWorkspaceId)) return byFlowTask;
    return WorkspaceIntegrationMapping.findOneAndUpdate(
      { _id: byFlowTask._id, status: 'active' },
      {
        $set: {
          chatAppWorkspaceId,
          chatAppWorkspaceSlug,
          syncOrigin,
          linkedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );
  }

  if (byChatApp) return byChatApp;
  return createMapping({
    flowTaskWorkspaceId,
    chatAppWorkspaceId,
    chatAppWorkspaceSlug,
    syncOrigin,
  });
}

export default {
  resolveWorkspaceIdFromRequest,
  findByFlowTaskWorkspaceId,
  findByChatAppWorkspaceId,
  createMapping,
  reconcileMapping,
};

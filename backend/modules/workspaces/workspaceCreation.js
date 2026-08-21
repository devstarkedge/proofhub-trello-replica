import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';
import User from '../../models/User.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as workspaceContext from './workspaceContext.js';
import { createDepartmentCore } from './departmentCreation.js';

const ALREADY_OWNS_WORKSPACE_MESSAGE =
  'You already own a workspace. You can join other workspaces, but each account can create only one workspace.';

/**
 * Shared transactional core for workspace creation — extracted from
 * workspaceController.js#createWorkspace (the human HTTP path, which now
 * just calls this) so the exact same logic (Workspace + admin
 * WorkspaceMembership + first Department + owner's lastActiveWorkspace, all
 * inside the caller's transaction) is reused by the reverse-sync
 * ChatApp-triggered provisioning path
 * (services/chat/workspaceProvisioningService.js#provisionFromChatApp)
 * instead of going through the HTTP-request-shaped controller.
 *
 * IMPORTANT — loop prevention: this module must NEVER call a chat-announce/
 * webhook hook itself. That responsibility belongs exclusively to the
 * human-initiated HTTP controller, so that provisionFromChatApp() (which
 * also calls this core) can never trigger a reverse announcement and create
 * a sync ping-pong loop with ChatApp. If a forward "workspace created" chat
 * hook is ever added, it must be called by workspaceController.js, strictly
 * after this function returns — never from inside it.
 *
 * Caller is responsible for: input validation (name/type/industry/
 * companySize/slug format — HTTP-input-shaped, stays in the controller),
 * starting/committing/ending the Mongo session, and everything after commit
 * (cache invalidation, default subscription, response shaping).
 *
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.slug - already normalized/validated by the caller
 * @param {string} params.type
 * @param {string|null} [params.industry]
 * @param {string|null} [params.companySize]
 * @param {string} params.departmentName - already resolved (rule-required or auto) by the caller
 * @param {string} params.ownerId
 * @param {import('mongoose').ClientSession} params.session
 * @returns {Promise<{workspace: object, department: object}>}
 */
export async function createWorkspaceCore({ name, slug, type, industry = null, companySize = null, departmentName, ownerId, session }) {
  let workspace;
  let department;

  // A brand-new workspace has no "active workspace" yet — this is exactly
  // the deliberate, explicit bypass case workspaceContext.runUnscoped()
  // exists for. Re-checks slug uniqueness inside the transaction.
  await workspaceContext.runUnscoped(async () => {
    const slugTaken = await Workspace.findOne({ slug }).session(session);
    if (slugTaken) {
      throw new ErrorResponse('This workspace URL is already taken', 409);
    }

    // In-transaction recheck of "1 user can own only 1 workspace" — every
    // caller (workspaceController.createWorkspace, the ChatApp-inbound
    // provisioning path) already does a fast pre-transaction check of its
    // own for a quick friendly 409, but that check has a TOCTOU race window
    // against a double-submit. Doing it again here, inside the same
    // transaction as the actual Workspace.create below, closes that window
    // for every current and future caller of this shared core uniformly —
    // the same reason the slug check above is re-verified here too.
    const alreadyOwnsWorkspace = await Workspace.findOne({ owner: ownerId }).session(session);
    if (alreadyOwnsWorkspace) {
      throw new ErrorResponse(ALREADY_OWNS_WORKSPACE_MESSAGE, 409);
    }

    const [createdWorkspace] = await Workspace.create([{
      name,
      slug,
      owner: ownerId,
      type,
      industry,
      companySize,
    }], { session });
    workspace = createdWorkspace;

    // Every workspace shares the same global 'admin' system-role template
    // (workspaceId: null, isSystem: true) — see Role.js.
    const adminRole = await Role.findResolvable('admin', null);

    await WorkspaceMembership.create([{
      workspace: workspace._id,
      user: ownerId,
      role: 'admin',
      roleId: adminRole?._id,
      department: [],
      accessType: 'full_department',
      allowedProjects: [],
      status: 'active',
      invitedBy: ownerId,
    }], { session });
  });

  // Department is a workspace-scoped model (workspaceScopePlugin) — its
  // pre('validate') hook stamps workspaceId from the active ALS context, so
  // this write must run inside a context pointed at the workspace just
  // created above, not whatever workspace (if any) the caller was already
  // active in.
  await workspaceContext.run({ workspaceId: workspace._id }, async () => {
    department = await createDepartmentCore({
      name: departmentName,
      description: '',
      managers: [],
      workspaceId: workspace._id,
      session,
    });
  });

  await User.updateOne(
    { _id: ownerId },
    { $set: { lastActiveWorkspace: workspace._id } },
    { session },
  );

  return { workspace, department };
}

export default createWorkspaceCore;

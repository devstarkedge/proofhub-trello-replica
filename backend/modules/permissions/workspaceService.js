import Workspace from '../authorization/models/Workspace.js';
import User from '../../models/User.js';

/**
 * Single-workspace bootstrap for the centralized permission engine.
 *
 * FlowTask is single-tenant today, but every permission table carries a
 * workspace_id per the multi-tenant migration plan — retrofitting tenant
 * scoping onto permission data later is far riskier than building it in now.
 * This reuses the (previously unpopulated) Workspace model from
 * modules/authorization instead of defining a second Mongoose model named
 * 'Workspace', which would collide at registration time.
 */
let cachedWorkspaceId = null;

export async function ensureDefaultWorkspace() {
  if (cachedWorkspaceId) return cachedWorkspaceId;

  let workspace = await Workspace.findOne({ slug: 'default' });
  if (!workspace) {
    const owner = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (!owner) {
      // Fresh install, before seedAdmin() has created the first admin.
      return null;
    }
    workspace = await Workspace.create({
      name: 'Default Workspace',
      slug: 'default',
      owner: owner._id
    });
  }

  cachedWorkspaceId = workspace._id;
  return cachedWorkspaceId;
}

export async function getDefaultWorkspaceId() {
  return cachedWorkspaceId || ensureDefaultWorkspace();
}

import config from '../config/index.js';

export function buildProjectDetailsUrl({ departmentId, projectId, workspaceId, frontendUrl = config.frontendUrl }) {
  const id = String(projectId?._id || projectId || '');
  const department = String(departmentId?._id || departmentId || '');
  const workspace = String(workspaceId?._id || workspaceId || '');
  if (!/^[a-f\d]{24}$/i.test(id)) throw new Error('A valid project ID is required for the project link');
  if (!/^[a-f\d]{24}$/i.test(department)) throw new Error('A valid department ID is required for the project link');
  if (!/^[a-f\d]{24}$/i.test(workspace)) throw new Error('A valid workspace ID is required for the project link');
  const url = new URL(`${String(frontendUrl).replace(/\/+$/, '')}/workflow/${department}/${id}`);
  url.searchParams.set('workspaceId', workspace);
  return url.toString();
}

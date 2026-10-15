export const CATALOG_VERSION = '2026-10-14.1';
export const SCOPES = Object.freeze(['own', 'assigned', 'project', 'department', 'workspace']);
export const SCOPE_RANK = Object.freeze({ own: 1, assigned: 1, project: 2, department: 3, workspace: 4 });

const groups = {
  workspace: 'manage_billing transfer_ownership delete manage_settings',
  access: 'view manage_roles assign_roles manage_overrides',
  audit: 'view export',
  member: 'view_basic view_directory invite invite_guest approve_join edit_profile suspend remove assign_department set_access_scope',
  department: 'view create update delete manage_members manage_managers',
  team: 'create manage',
  project: 'view view_private_directory join_private create update manage_members change_visibility manage_settings delete restore purge',
  task: 'view create update move edit_dates edit_priority assign archive delete copy_move_cross',
  time: 'log', tracking: 'log view_reports view_screenshots manage_policy', comment: 'create moderate', attachment: 'upload manage purge',
  category: 'manage', project_option: 'manage',
  analytics: 'view_self view_team team_time schedule_reports export_external',
  pm_sheet: 'view update_status', reminder: 'manage',
  announcement: 'view create moderate view_engagement',
  finance: 'view revenue_analytics billing_details manage_pages approve_pages',
  sales: 'view create update delete export import manage_options view_logs manage_tabs',
  leave: 'view_workspace view_policy manage_policy adjust_balance manage_calendar cancel_approved view_reports view_audit approve view_team',
  attendance: 'view_workspace view_self view_department manage_policy manage_shifts manage_locations manage_work_modes manage_office_hours approve_wfh approve_regularization correct_attendance view_reports view_audit view_team',
  chat: 'open', integration: 'manage'
};
const ownerOnly = new Set(['workspace.manage_billing', 'workspace.transfer_ownership', 'workspace.delete']);
const sensitive = new Set(['workspace.manage_settings', 'access.view', 'access.manage_roles', 'access.assign_roles', 'access.manage_overrides', 'audit.view', 'audit.export', 'integration.manage', 'department.manage_managers', 'analytics.export_external']);
const guestAllowed = new Set(['project.view', 'task.view', 'task.create', 'task.update', 'task.move', 'comment.create', 'attachment.upload']);
const management = new Set(['tracking.view_reports', 'tracking.view_screenshots', 'leave.approve', 'leave.view_team', 'attendance.view_team', 'attendance.approve_wfh', 'attendance.approve_regularization', 'analytics.view_team', 'analytics.team_time', 'member.view_directory', 'member.assign_department', 'member.set_access_scope', 'department.update', 'department.manage_members']);
const workspaceOnlyModules = new Set(['workspace', 'access', 'audit', 'integration', 'chat', 'project_option']);
const resourceTypes = { tracking: 'member', project: 'project', task: 'task', time: 'task', comment: 'comment', attachment: 'attachment', category: 'department', department: 'department', team: 'team', member: 'member', announcement: 'announcement', finance: 'finance', sales: 'sales', leave: 'member', attendance: 'member', analytics: 'member', pm_sheet: 'project', reminder: 'project' };

export const CATALOG = Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([module, actions]) => actions.split(' ').map(action => {
  const key = `${module}.${action}`;
  const parentPermission = ['task', 'comment', 'attachment', 'time'].includes(module) ? 'task.view' : ['finance', 'sales'].includes(module) && action !== 'view' ? `${module}.view` : null;
  return [key, Object.freeze({ module, label: `${action.replaceAll('_', ' ')} ${module.replaceAll('_', ' ')}`, description: `${action.replaceAll('_', ' ')} in this workspace`, allowedScopes: workspaceOnlyModules.has(module) ? ['workspace'] : [...SCOPES], scopeBasis: management.has(key) ? 'management' : 'membership', resourceType: resourceTypes[module] || null, sensitive: sensitive.has(key), ownerOnly: ownerOnly.has(key), guestAllowed: guestAllowed.has(key), dependsOn: parentPermission && parentPermission !== key ? [parentPermission] : [], plan: null })];
}))));

export function validateGrants(grants) {
  if (!Array.isArray(grants)) throw new Error('grants must be an array');
  const out = new Map();
  for (const grant of grants) {
    const entry = CATALOG[grant.permission];
    if (!entry || entry.ownerOnly || !entry.allowedScopes.includes(grant.scope) || Object.keys(grant).some(key => !['permission', 'scope'].includes(key))) throw new Error(`Invalid grant: ${grant.permission}`);
    out.set(grant.permission, { permission: grant.permission, scope: grant.scope });
  }
  for (const grant of out.values()) for (const dependency of CATALOG[grant.permission].dependsOn) {
    const existing = out.get(dependency);
    if (!existing || SCOPE_RANK[existing.scope] < SCOPE_RANK[grant.scope]) out.set(dependency, { permission: dependency, scope: grant.scope });
  }
  return [...out.values()];
}

import { CATALOG, validateGrants } from './catalog.js';
export const TEMPLATE_VERSION = 2;
const grant = (keys, scope) => keys.split(' ').filter(Boolean).map(permission => ({ permission, scope }));
const baseline = [
  ...grant('tracking.log', 'own'),
  ...grant('project.view task.view task.create task.update task.move comment.create attachment.upload time.log', 'project'),
  ...grant('analytics.view_self member.view_basic department.view announcement.view chat.open', 'workspace'),
  ...grant('project.update project.manage_members project.manage_settings project.delete project.change_visibility team.manage', 'own')
];
const manager = [
  ...baseline,
  ...grant('project.create project.update project.manage_members project.manage_settings project.delete project.restore task.copy_move_cross category.manage reminder.manage analytics.schedule_reports announcement.create announcement.view_engagement team.create member.invite_guest', 'department'),
  ...grant('task.edit_dates task.edit_priority task.assign task.archive task.delete comment.moderate attachment.manage', 'project'),
  ...grant('tracking.view_reports tracking.view_screenshots member.assign_department member.set_access_scope department.update department.manage_members', 'department'),
  ...grant('project_option.manage', 'workspace')
];
const hr = [ ...baseline, ...grant('member.view_directory member.invite member.approve_join member.edit_profile member.suspend member.remove member.assign_department member.set_access_scope department.create department.update department.manage_members department.manage_managers announcement.create announcement.view_engagement', 'workspace'), ...Object.keys(CATALOG).filter(p => p.startsWith('leave.') || p.startsWith('attendance.')).map(permission => ({ permission, scope: 'workspace' })) ];
const guest = Object.entries(CATALOG).filter(([, v]) => v.guestAllowed).map(([permission]) => ({ permission, scope: 'project' }));
const make = (key, grants) => Object.freeze({ key, slug: key, name: key === 'hr' ? 'HR' : key[0].toUpperCase() + key.slice(1), kind: key === 'guest' ? 'guest' : 'member', isSystem: true, templateKey: key, templateVersion: TEMPLATE_VERSION, customized: false, locked: key === 'admin', isActive: true, grants: validateGrants(grants) });
export const TEMPLATES = Object.freeze({
  admin: make('admin', Object.entries(CATALOG).filter(([, v]) => !v.ownerOnly).map(([permission]) => ({ permission, scope: 'workspace' }))),
  manager: make('manager', manager), hr: make('hr', hr), employee: make('employee', baseline), guest: make('guest', guest)
});
export const STRUCTURAL_PERMISSIONS = Object.freeze(['tracking.view_reports', 'tracking.view_screenshots', 'leave.approve', 'leave.view_team', 'attendance.view_team', 'attendance.approve_wfh', 'attendance.approve_regularization', 'analytics.view_team', 'analytics.team_time', 'member.view_directory']);

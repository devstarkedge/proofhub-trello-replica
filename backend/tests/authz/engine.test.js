import { describe, it, expect } from 'vitest';
import { CATALOG, validateGrants } from '../../authz/catalog.js';
import { TEMPLATES } from '../../authz/templates.js';
import { can, explain, canViewProject, scopeFilter } from '../../authz/engine.js';
import { contextFromRecords } from '../../authz/context.js';
import { canGrant, canManageMember, canAssignRole, canEditRole, overrideRejection } from '../../authz/ceiling.js';

const workspace = { _id: 'ws', owner: 'owner', isActive: true, status: 'active' };
const project = { _id: 'p', workspaceId: 'ws', visibility: 'workspace', department: 'd', owner: 'other', members: [] };
function ctx(key = 'employee', extra = {}) {
  return { ...contextFromRecords({ userId: 'u', workspace, membership: { status: 'active', kind: key === 'guest' ? 'guest' : 'member', department: ['d'] }, role: { ...TEMPLATES[key], _id: key, workspaceId: 'ws' } }), ...extra };
}
const task = { _id: 't', workspaceId: 'ws', board: 'p', project, createdBy: 'u', assignees: ['u'] };

describe('catalog and templates', () => {
  it('admin contains every non-owner grant', () => expect(TEMPLATES.admin.grants.map(g => g.permission).sort()).toEqual(Object.keys(CATALOG).filter(p => !CATALOG[p].ownerOnly).sort()));
  it('auto-adds dependencies and rejects unknown scopes', () => {
    expect(validateGrants([{ permission: 'task.delete', scope: 'project' }])).toContainEqual({ permission: 'task.view', scope: 'project' });
    expect(() => validateGrants([{ permission: 'workspace.delete', scope: 'workspace' }])).toThrow();
    expect(() => validateGrants([{ permission: 'unknown', scope: 'workspace' }])).toThrow();
  });
  it('HR has people access and lacks team time and role management', () => {
    for (const p of ['member.invite', 'member.view_directory', 'member.assign_department', 'leave.approve', 'attendance.approve_wfh']) expect(can(ctx('hr'), p)).toBe(true);
    for (const p of ['analytics.team_time', 'access.manage_roles', 'access.assign_roles', 'workspace.manage_settings', 'task.delete']) expect(can(ctx('hr'), p)).toBe(false);
  });
});

describe('decisions', () => {
  it.each(['admin', 'manager', 'hr', 'employee'])('%s cannot view private content without joining', role => {
    const privateProject = { ...project, visibility: 'private' };
    expect(can(ctx(role), 'task.view', { ...task, project: privateProject })).toBe(false);
    expect(can(ctx(role), 'project.view', { ...privateProject, members: ['u'] })).toBe(true);
  });
  it('owner also must join a private project', () => expect(can(ctx('admin', { isOwner: true }), 'project.view', { ...project, visibility: 'private' })).toBe(false));
  it.each(['inactive', 'suspended', 'removed'])('rejects %s membership', status => expect(can(ctx('admin', { status }), 'task.view', task)).toBe(false));
  it('denies unknown permissions and foreign tenants', () => {
    expect(can(ctx('admin'), 'not.exists')).toBe(false);
    expect(can(ctx('admin'), 'task.view', { ...task, workspaceId: 'foreign' })).toBe(false);
  });
  it('denies inactive roles', () => {
    const c = contextFromRecords({ userId: 'u', workspace, membership: { status: 'active' }, role: { ...TEMPLATES.admin, workspaceId: 'ws', isActive: false } });
    expect(can(c, 'task.delete', task)).toBe(false);
  });
  it('deny beats admin, scoped deny leaves other projects accessible', () => {
    const c = ctx('admin', { denies: { 'task.delete': [{ scope: 'project', scopeIds: ['p'], overrideId: 'o' }] } });
    expect(explain(c, 'task.delete', task)).toMatchObject({ allowed: false, reason: 'override_deny', deniedBy: ['o'] });
    expect(can(c, 'task.delete', { ...task, board: 'q', project: { ...project, _id: 'q' } })).toBe(true);
    expect(can(c, 'task.delete')).toBe(true);
  });
  it('owner cannot be denied and alone holds owner permissions', () => {
    const c = ctx('admin', { isOwner: true, denies: { 'task.delete': [{ scope: 'workspace' }] } });
    expect(can(c, 'task.delete', task)).toBe(true);
    expect(can(c, 'workspace.delete')).toBe(true);
    expect(can(ctx('admin'), 'workspace.delete')).toBe(false);
  });
  it('expiry immediately removes a cached grant or deny', () => {
    const c = ctx('employee', { grants: { 'task.delete': [{ scope: 'project', expiresAt: new Date(1) }], 'task.view': [{ scope: 'project' }] } });
    expect(can(c, 'task.delete', task)).toBe(false);
    expect(can(ctx('admin', { denies: { 'task.view': [{ scope: 'workspace', expiresAt: new Date(1) }] } }), 'task.view', task)).toBe(true);
  });
  it('scope IDs, selected-project and assigned restrictions narrow access', () => {
    expect(can(ctx('employee', { restriction: { type: 'selected_projects', projectIds: ['q'] } }), 'task.view', task)).toBe(false);
    const c = ctx('employee', { restriction: { type: 'assigned_only' }, assignedProjectIds: ['p'] });
    expect(can(c, 'task.view', task)).toBe(true);
    expect(can(c, 'task.view', { ...task, assignees: [] })).toBe(false);
    expect(can(ctx('employee', { grants: { 'task.view': [{ scope: 'project', scopeIds: ['q'] }] } }), 'task.view', task)).toBe(false);
  });
  it('own and assigned are different relations', () => {
    expect(can(ctx('employee', { grants: { 'task.view': [{ scope: 'own' }] } }), 'task.view', { ...task, createdBy: 'other' })).toBe(false);
    expect(can(ctx('employee', { grants: { 'task.view': [{ scope: 'assigned' }] } }), 'task.view', { ...task, createdBy: 'other' })).toBe(true);
  });
  it('dependencies are checked at the resource including denies', () => {
    const c = ctx('admin', { denies: { 'task.view': [{ scope: 'project', scopeIds: ['p'] }] } });
    expect(explain(c, 'task.delete', task).reason).toBe('missing_dependency');
  });
  it('a manager is not the project owner for visibility changes', () => expect(can(ctx('employee'), 'project.change_visibility', { ...project, managers: ['u'] })).toBe(false));
  it('structural department grants work independently of role', () => {
    const c = contextFromRecords({ userId: 'u', workspace, membership: { status: 'active' }, role: { ...TEMPLATES.employee, workspaceId: 'ws' }, departments: [{ _id: 'd', managers: ['u'] }] });
    expect(can(c, 'analytics.team_time', { _id: 'x', workspaceId: 'ws', departments: ['d'] })).toBe(true);
    expect(can(c, 'analytics.team_time', { _id: 'x', workspaceId: 'ws', departments: ['foreign'] })).toBe(false);
  });
});

describe('guests', () => {
  const shared = access => ({ ...project, visibility: 'private', guests: [{ user: 'u', access }] });
  it.each(['viewer', 'commenter', 'editor'])('%s is restricted to explicit private shares', access => {
    expect(can(ctx('guest'), 'project.view', project)).toBe(false);
    expect(can(ctx('guest'), 'project.view', shared(access))).toBe(true);
    expect(can(ctx('guest'), 'comment.create', { ...task, project: shared(access) })).toBe(access !== 'viewer');
    expect(can(ctx('guest'), 'attachment.upload', { ...task, project: shared(access) })).toBe(access === 'editor');
  });
  it('expires membership and individual project shares', () => {
    expect(can(ctx('guest', { guestExpiresAt: new Date(1) }), 'project.view', shared('editor'))).toBe(false);
    expect(canViewProject(ctx('guest'), { ...shared('editor'), guests: [{ user: 'u', access: 'editor', expiresAt: new Date(1) }] })).toBe(false);
  });
  it.each(['chat.open', 'member.view_basic', 'department.view', 'announcement.view', 'analytics.view_self'])('hard caps %s despite override', p => expect(can(ctx('guest', { grants: { [p]: [{ scope: 'workspace' }] } }), p)).toBe(false));
  it('rejects workspace task grants', () => expect(can(ctx('guest', { grants: { 'task.view': [{ scope: 'workspace' }] } }), 'task.view', { ...task, project: shared('editor') })).toBe(false));
});

describe('ceilings', () => {
  it('blocks owner, self, own role edits and owner-only grants', () => {
    expect(canManageMember(ctx('admin'), ctx('employee'))).toBe(false);
    expect(canManageMember(ctx('admin'), ctx('employee', { userId: 'target', isOwner: true }))).toBe(false);
    expect(canEditRole(ctx('manager'), { _id: 'manager', locked: false }, [])).toBe(false);
    expect(canGrant(ctx('admin', { isOwner: true }), 'workspace.delete', 'workspace')).toBe(false);
  });
  it('HR cannot assign admin or roles above its ceiling', () => {
    expect(canAssignRole(ctx('hr'), null, TEMPLATES.admin)).toBe(false);
    expect(canGrant(ctx('hr'), 'analytics.team_time', 'workspace')).toBe(false);
  });
  it('only owner may override admin, requires reason and sensitive expiry', () => {
    const target = ctx('admin', { userId: 'target' });
    const input = { permission: 'finance.view', effect: 'deny', scope: 'workspace', reason: 'Access removed for review' };
    expect(overrideRejection(ctx('admin'), target, input)).toBe('owner_required');
    expect(overrideRejection(ctx('admin', { isOwner: true }), target, input)).toBe(null);
    expect(overrideRejection(ctx('admin', { isOwner: true }), target, { ...input, permission: 'access.view', effect: 'grant' })).toBe('sensitive_expiry_required');
  });
});

// Evaluate the supported query operators against fixtures, independently
// from can(). DB integration coverage is added with the migration fixtures.
function matches(document, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$and') return value.every(q => matches(document, q));
    if (key === '$or') return value.some(q => matches(document, q));
    if (key === '$nor') return !value.some(q => matches(document, q));
    const actual = document[key];
    if (value?.$in) return value.$in.some(v => Array.isArray(actual) ? actual.includes(v) : actual === v);
    return Array.isArray(actual) ? actual.includes(value) : actual === value;
  });
}
describe('scope filter equivalence on generated fixtures', () => {
  it('matches task decisions for grants, denies and restrictions', () => {
    const projects = Array.from({ length: 12 }, (_, n) => ({ ...project, _id: `p${n}`, visibility: n % 3 === 0 ? 'private' : 'workspace', members: n % 2 ? ['u'] : [] }));
    const tasks = projects.flatMap((p, n) => Array.from({ length: 3 }, (_, m) => ({ ...task, _id: `${n}:${m}`, board: p._id, project: p, createdBy: m === 1 ? 'u' : 'other', assignees: m === 0 ? ['u'] : [] })));
    for (const scope of ['own', 'assigned', 'project', 'department', 'workspace']) for (const restricted of [false, true]) {
      const c = ctx('employee', { grants: { 'task.view': [{ scope }] }, denies: { 'task.view': [{ scope: 'project', scopeIds: ['p1'] }] }, restriction: { type: restricted ? 'assigned_only' : 'none' }, assignedProjectIds: projects.map(p => p._id) });
      const filter = scopeFilter(c, 'task.view', 'task', projects);
      expect(tasks.filter(t => matches(t, filter)).map(t => t._id)).toEqual(tasks.filter(t => can(c, 'task.view', t)).map(t => t._id));
    }
  });
});

import { describe, it, expect } from 'vitest';
import { preMigrationReport, reportMarkdown } from '../../authz/preMigrationReport.js';
const clean = () => ({ users: [{ _id: 'u', email: 'u@example.com', role: 'employee', roleId: 'r' }], workspaces: [{ _id: 'w', owner: 'owner' }], roles: [{ _id: 'r', slug: 'employee' }], memberships: [{ _id: 'm', workspace: 'w', user: 'u', role: 'employee', roleId: 'r', status: 'active' }], boards: [{ _id: 'p', workspaceId: 'w', visibility: 'public', department: 'd' }], cards: [{ _id: 't', workspaceId: 'w', board: 'p' }] });
describe('read-only pre-migration report', () => {
  it('has every required section and does not mutate input', () => {
    const data = clean(), before = JSON.stringify(data), report = preMigrationReport(data);
    expect(Object.keys(report.sections)).toHaveLength(11);
    expect(report.possibleIncident).toBe(false);
    expect(JSON.stringify(data)).toBe(before);
    expect(report.sections['6_board_visibility'][0].suggestedVisibility).toBe('department');
  });
  it('flags an admin originally invited as employee but excludes owner', () => {
    const data = clean(); data.memberships[0].role = 'admin'; data.invitations = [{ _id: 'i', workspace: 'w', email: 'u@example.com', role: 'employee', acceptedBy: 'u' }];
    expect(preMigrationReport(data).possibleIncident).toBe(true);
    data.workspaces[0].owner = 'u';
    expect(preMigrationReport(data).sections['1_membership_mirrors'].possibleAdminPromotions).toEqual([]);
  });
  it('follows a comment through its card and detects a foreign board', () => {
    const data = clean(); data.comments = [{ _id: 'c', workspaceId: 'foreign', card: 't', contextType: 'card' }];
    const report = preMigrationReport(data);
    expect(report.possibleIncident).toBe(true);
    expect(report.sections['10_child_workspace_mismatches'].mismatches[0]).toMatchObject({ type: 'comment', parent: 'p', parentWorkspace: 'w' });
  });
  it('reports persisted cross-tenant notifications and subscribers', () => {
    const data = clean(); data.announcements = [{ _id: 'a', workspaceId: 'foreign', subscribers: { users: ['u'] } }]; data.notifications = [{ _id: 'n', workspaceId: 'w', user: 'u', entityType: 'Announcement', entityId: 'a' }];
    const report = preMigrationReport(data);
    expect(report.sections['11_cross_workspace_delivery']).toHaveLength(2);
    expect(reportMarkdown(report)).toContain('STOP: possible security incident');
  });
  it('does not misclassify removed recipients as foreign members', () => {
    const data = clean(); data.memberships[0].status = 'removed'; data.notifications = [{ _id: 'n', workspaceId: 'w', user: 'u' }];
    expect(preMigrationReport(data).possibleIncident).toBe(false);
  });
  it('identifies external recipients, departed creators, ambiguous legacy rows and roster differences', () => {
    const data = clean(); data.schedules = [{ _id: 's', workspaceId: 'w', createdBy: 'absent', active: true, recipients: ['U@EXAMPLE.COM','outside@example.com'] }]; data.memberships.push({ workspace: 'w2', user: 'u', status: 'active' }); data.userPermissions = [{ _id: 'f', user: 'u', hasAccess: true }]; data.departments = [{ _id: 'd', workspaceId: 'w', members: ['u'], managers: ['u'] }];
    const s = preMigrationReport(data).sections;
    expect(s['8_scheduled_external_recipients'][0]).toMatchObject({ externalRecipients: ['outside@example.com'], creatorMembership: 'missing' });
    expect(s['5_legacy_unrepresented'][0].ambiguousWorkspace).toBe(true);
    expect(s['7_department_consistency'][0].rosterOnly).toEqual(['u']);
  });
});

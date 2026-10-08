// Pure analysis: input records are projected by the read-only CLI. No model
// saves, migration imports, mail dispatch or socket effects occur here.
const id = v => String(v?._id || v || '');
const ids = values => [...new Set((values || []).map(id))].sort();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const index = rows => new Map(rows.map(r => [id(r._id), r]));
const key = (workspace,user) => `${id(workspace)}:${id(user)}`;
const email = value => String(value || '').trim().toLowerCase();

export function preMigrationReport(data, generatedAt = new Date()) {
  const { users = [], workspaces = [], memberships = [], roles = [], invitations = [], joinRequests = [], overrides = [], userPermissions = [], salesPermissions = [], boards = [], departments = [], schedules = [], cards = [], lists = [], subtasks = [], nanos = [], comments = [], announcements = [], notifications = [] } = data;
  const userById = index(users), roleById = index(roles), boardById = index(boards), cardById = index(cards), announcementById = index(announcements), workspaceById = index(workspaces);
  const memberByKey = new Map(memberships.map(m => [key(m.workspace,m.user),m]));
  const active = memberships.filter(m => m.status === 'active');
  const membershipMirrorDifferences = [], possibleAdminPromotions = [], slugRoleMismatches = [];
  for (const m of memberships) {
    const u = userById.get(id(m.user));
    const different = [];
    if (u) for (const field of ['role','roleId','department','team','accessType','allowedProjects']) {
      const normalize = value => ['department','allowedProjects'].includes(field) ? ids(value) : ['roleId','team'].includes(field) ? id(value) : value || null;
      if (!same(normalize(m[field]),normalize(u[field]))) different.push({ field, membership: normalize(m[field]), userMirror: normalize(u[field]) });
    }
    if (different.length) membershipMirrorDifferences.push({ workspace: id(m.workspace), user: id(m.user), status: m.status, different });
    const role = roleById.get(id(m.roleId));
    if (!role || role.slug !== m.role || role.workspaceId && id(role.workspaceId) !== id(m.workspace)) slugRoleMismatches.push({ workspace: id(m.workspace), user: id(m.user), slug: m.role, roleId: id(m.roleId), resolvedSlug: role?.slug || null, foreignRole: Boolean(role?.workspaceId && id(role.workspaceId) !== id(m.workspace)) });
    if (m.role === 'admin' && m.status === 'active' && id(workspaceById.get(id(m.workspace))?.owner) !== id(m.user)) {
      const provenance = [...invitations.filter(i => id(i.workspace) === id(m.workspace) && (id(i.acceptedBy) === id(m.user) || u && email(i.email) === email(u.email))).map(i => ({ type: 'invitation', id: id(i._id), role: i.role })), ...joinRequests.filter(j => id(j.workspace) === id(m.workspace) && id(j.user) === id(m.user)).map(j => ({ type: 'join_request', id: id(j._id), role: j.requestedRole }))].filter(p => p.role && p.role !== 'admin');
      if (provenance.length) possibleAdminPromotions.push({ workspace: id(m.workspace), user: id(m.user), provenance });
    }
  }
  const overrideKeys = new Set(overrides.map(o => `${key(o.workspace,o.user)}:${o.resource}`));
  const legacyUnrepresented = [];
  for (const [resource, records] of [['finance',userPermissions],['sales',salesPermissions]]) for (const row of records) {
    const candidates = active.filter(m => id(m.user) === id(row.user)).map(m => id(m.workspace));
    const workspace = id(row.workspaceId || row.workspace);
    if (!workspace || !overrideKeys.has(`${key(workspace,row.user)}:${resource}`)) legacyUnrepresented.push({ id: id(row._id), resource, user: id(row.user), workspace: workspace || null, activeWorkspaces: candidates, ambiguousWorkspace: !workspace && candidates.length !== 1, pageKey: row.pageKey, hasAccess: row.hasAccess, permissions: row.permissions, moduleVisible: row.moduleVisible });
  }
  const departmentDifferences = departments.map(d => {
    const fromMembership = active.filter(m => id(m.workspace) === id(d.workspaceId) && ids(m.departments || m.department).includes(id(d._id))).map(m => id(m.user));
    const roster = ids(d.members), authority = ids(fromMembership);
    return { id: id(d._id), workspace: id(d.workspaceId), managers: ids(d.managers), rosterOnly: roster.filter(u => !authority.includes(u)), membershipOnly: authority.filter(u => !roster.includes(u)) };
  });
  const scheduledExternalRecipients = schedules.map(s => {
    const internal = new Set(active.filter(m => id(m.workspace) === id(s.workspaceId) && m.kind !== 'guest').map(m => email(userById.get(id(m.user))?.email)).filter(Boolean));
    return { id: id(s._id), workspace: id(s.workspaceId), createdBy: id(s.createdBy), active: s.active, externalRecipients: (s.recipients || []).map(email).filter(e => !internal.has(e)), creatorMembership: memberByKey.get(key(s.workspaceId,s.createdBy))?.status || 'missing' };
  }).filter(s => s.externalRecipients.length || s.creatorMembership !== 'active');
  const childWorkspaceMismatches = [], unresolvedParents = [];
  for (const [type, rows] of [['card',cards],['list',lists],['subtask',subtasks],['nano',nanos],['comment',comments]]) for (const row of rows) {
    if (type === 'comment' && row.contextType === 'announcement') {
      const announcement = announcementById.get(id(row.contextRef));
      if (announcement && id(row.workspaceId) !== id(announcement.workspaceId)) childWorkspaceMismatches.push({ type, id: id(row._id), workspace: id(row.workspaceId), parentType: 'announcement', parent: id(announcement._id), parentWorkspace: id(announcement.workspaceId) });
      continue;
    }
    const boardId = row.board || cardById.get(id(row.card || row.task))?.board;
    const board = boardById.get(id(boardId));
    if (!board) { unresolvedParents.push({ type, id: id(row._id), workspace: id(row.workspaceId), parent: id(boardId) }); continue; }
    if (id(row.workspaceId) !== id(board.workspaceId)) childWorkspaceMismatches.push({ type, id: id(row._id), workspace: id(row.workspaceId), parentType: 'board', parent: id(board._id), parentWorkspace: id(board.workspaceId) });
  }
  const crossWorkspaceDelivery = [];
  for (const a of announcements) for (const recipient of a.subscribers?.users || []) if (!memberByKey.has(key(a.workspaceId,recipient))) crossWorkspaceDelivery.push({ type: 'announcement_subscriber', id: id(a._id), workspace: id(a.workspaceId), user: id(recipient), evidence: 'Explicit subscriber has no membership history in the announcement workspace' });
  for (const n of notifications) {
    if (n.workspaceId && !memberByKey.has(key(n.workspaceId,n.user))) crossWorkspaceDelivery.push({ type: 'notification_recipient', id: id(n._id), workspace: id(n.workspaceId), user: id(n.user), evidence: 'Persisted recipient has no membership history in this workspace' });
    let parent;
    if (n.entityType === 'Announcement') parent = announcementById.get(id(n.entityId));
    else if (n.entityType === 'Board') parent = boardById.get(id(n.entityId));
    else if (n.entityType === 'Card') parent = cardById.get(id(n.entityId));
    parent ||= boardById.get(id(n.relatedBoard || n.projectId));
    if (parent && id(parent.workspaceId) !== id(n.workspaceId)) crossWorkspaceDelivery.push({ type: 'notification_entity', id: id(n._id), workspace: id(n.workspaceId), entityId: id(parent._id), entityWorkspace: id(parent.workspaceId), evidence: 'Persisted notification references an entity in another workspace' });
  }
  const sections = {
    '1_membership_mirrors': { membershipMirrorDifferences, possibleAdminPromotions, restrictedAdmins: active.filter(m => (m.role === 'admin' || id(workspaceById.get(id(m.workspace))?.owner) === id(m.user)) && (m.accessType && m.accessType !== 'full_department' || m.allowedProjects?.length || m.restriction && m.restriction.type !== 'none')).map(m => ({ workspace: id(m.workspace), user: id(m.user), accessType: m.accessType, restriction: m.restriction, allowedProjects: ids(m.allowedProjects) })) },
    '2_slug_role_mismatches': slugRoleMismatches,
    '3_custom_roles': roles.filter(r => !r.isSystem).map(r => ({ id: id(r._id), workspace: id(r.workspaceId), name: r.name, slug: r.slug, flags: r.permissions, activeMembers: active.filter(m => id(m.roleId) === id(r._id)).length, elevatedFlags: ['canManageSystem','canManageAccessControl','canManageRoles','canManageUsers'].filter(f => r.permissions?.[f]) })),
    '4_access_overrides': overrides.map(o => ({ id: id(o._id), workspace: id(o.workspace), user: id(o.user), resource: o.resource, effect: o.effect, actions: o.actions, scope: o.scope, scopedResourceIds: ids(o.scopedResourceIds), expiresAt: o.expiresAt, isActive: o.isActive })),
    '5_legacy_unrepresented': legacyUnrepresented,
    '6_board_visibility': boards.map(b => ({ id: id(b._id), workspace: id(b.workspaceId), visibility: b.visibility, department: id(b.department) || null, suggestedVisibility: b.visibility === 'public' ? b.department ? 'department' : 'workspace' : b.visibility })),
    '7_department_consistency': departmentDifferences,
    '8_scheduled_external_recipients': scheduledExternalRecipients,
    '9_global_admin_nonadmin_memberships': active.filter(m => userById.get(id(m.user))?.role === 'admin' && m.role !== 'admin').map(m => ({ workspace: id(m.workspace), user: id(m.user), role: m.role })),
    '10_child_workspace_mismatches': { mismatches: childWorkspaceMismatches, unresolvedParents },
    '11_cross_workspace_delivery': crossWorkspaceDelivery
  };
  return { generatedAt: generatedAt.toISOString(), readOnly: true, possibleIncident: possibleAdminPromotions.length > 0 || childWorkspaceMismatches.length > 0 || crossWorkspaceDelivery.length > 0, counts: Object.fromEntries(Object.entries(data).map(([name,rows]) => [name, rows.length])), sections, limitations: ['Mirror divergence can reflect legitimate workspace-specific roles; it is not proof of compromise.', 'Invite/join provenance identifies promotions to review; legitimate later promotions can also appear.', 'Persisted records cannot prove or exclude historical Socket.IO deliveries. Removed members are matched against retained membership history.', 'Missing legacy workspace references and unresolved parents require manual review; no records are repaired or schedules paused.'] };
}

export function reportMarkdown(report) {
  const s = report.sections;
  return `# FlowTask access-control pre-migration report\n\nGenerated: ${report.generatedAt}\n\nRead-only: yes. Database writes: none.\n\n${report.possibleIncident ? '**STOP: possible security incident. Review the evidence before proceeding.**' : 'No incident indicators detected by the checks below; this does not establish the absence of historical incidents.'}\n\n| Check | Findings |\n| --- | ---: |\n| 1. Membership mirror differences / possible admin promotions | ${s['1_membership_mirrors'].membershipMirrorDifferences.length} / ${s['1_membership_mirrors'].possibleAdminPromotions.length} |\n| 2. Slug and roleId mismatches | ${s['2_slug_role_mismatches'].length} |\n| 3. Custom roles | ${s['3_custom_roles'].length} |\n| 4. AccessOverride records (stored scope included) | ${s['4_access_overrides'].length} |\n| 5. Unrepresented legacy permissions | ${s['5_legacy_unrepresented'].length} |\n| 6. Boards with proposed visibility mapping | ${s['6_board_visibility'].length} |\n| 7. Departments with roster mismatches | ${s['7_department_consistency'].filter(d => d.rosterOnly.length || d.membershipOnly.length).length} |\n| 8. Schedules needing recipient/membership review | ${s['8_scheduled_external_recipients'].length} |\n| 9. Global admins who are workspace non-admins | ${s['9_global_admin_nonadmin_memberships'].length} |\n| 10. Child/parent workspace mismatches / unresolved parents | ${s['10_child_workspace_mismatches'].mismatches.length} / ${s['10_child_workspace_mismatches'].unresolvedParents.length} |\n| 11. Possible cross-workspace deliveries | ${s['11_cross_workspace_delivery'].length} |\n\nThe companion JSON contains record IDs, workspace IDs and recipient evidence. Review it privately.\n\n${report.limitations.map(l => '- ' + l).join('\n')}\n\n## Required next approvals\n\nReview this report and confirm the database backup and staging target before write migrations. Approve project visibility mapping separately before migration 005. Guest activation and legacy field deletion remain separately gated.\n`;
}

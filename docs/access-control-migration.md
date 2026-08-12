# Access & Permissions Centralization — Migration & Rollback Doc

Companion to [docs/authorization-audit-phase0.md](authorization-audit-phase0.md) (the inventory that motivated this work). This doc covers what shipped, how to verify it, and how to roll back if something breaks.

> **Revision 2**: the module described below started as reusable panels embedded inside Finance/Sales/Teams (Revision 1). It is now a standalone page (`/access-control`) that owns user/role/permission management outright; Finance, Sales, HR, and Teams no longer host any permission-editing UI at all — they link out to this page or don't mention permissions in their UI beyond what `useAccessControl()` tells them to render. See "Revision 2 changes" below for exactly what moved.
>
> **Revision 3**: added the one centralized confirmation modal every permission change now goes through, a real audit log, and enforced "no one can modify their own permissions/role/access" on both frontend and backend. See "Revision 3 changes" below.
>
> **Revision 4**: redesigned the Activity Log from a raw-JSON, load-everything list into a human-readable, cursor-paginated, filterable audit log built to hold millions of rows. See "Revision 4 changes" below.

## What changed

**New backend engine** (`backend/modules/permissions/`):
- `permissionEngine.js` — the single `resolveResourceAccess(user, resource)` / `hasResourceAction(user, resource, action)` resolver. Precedence: explicit deny > Admin > explicit grant > role default > deny-by-default. Always reads fresh from the DB — never from a stale cache.
- `accessControlService.js` — the single write path (`setResourceOverride` / `clearResourceOverride`) and the effective-permissions aggregator (`resolveEffectivePermissions`) used by both the API and the migration/verification scripts.
- `workspaceService.js` — seeds one `Workspace` doc (reusing the pre-existing, previously-unpopulated `modules/authorization/models/Workspace.js`) and stamps it onto every new row, per the multi-tenant-readiness requirement.

**New data**:
- `backend/config/permissionRegistry.js` — the resource.action catalog (`sales`, `finance`, `access_control` today; add a module by adding an entry here, not a new table).
- `backend/models/AccessOverride.js` — the one per-user, per-resource override table (`{user, resource, effect, actions, scope, scopedResourceIds, expiresAt, ...}`). Replaces the write path of `SalesPermission` and `UserPermission`.
- `Role.permissions.canManageAccessControl` — new 15th checklist boolean. Lets an Admin delegate `access_control.manage` to a custom role.

**New API** (`/api/access-control/*`):
- `GET /registry` — permission catalog, for rendering pickers.
- `GET /my-permissions` — current user's fully-resolved permissions (sidebar, route guards).
- `GET /users/:userId/effective`, `PUT/DELETE /users/:userId/overrides/:resource` — the one read/write path admins (or delegated managers) use for Sales, Finance, or any future module.

**Refactored to delegate to the engine** (behavior-preserving, verified — see below):
- `checkSalesPermission` / `checkFinanceAccess` middleware — same `req.salesPermissions`/`req.financePermissions` shape, now engine-backed.
- `salesController.getUserPermissions/updateUserPermissions`, `salesPermissionController.getSalesPermission/setSalesPermission` — previously two independently-duplicated write paths to the same `SalesPermission` collection; both now call `setResourceOverride` once.
- `userController.getUserPagePermissions/patchUserPagePermissions` (Finance).
- `roleController.PERMISSION_DEFINITIONS` — expanded from 3 groups/8 keys to the full 5 groups/15 keys the frontend already used, so the backend's "Create Role" checklist source stops silently disagreeing with the frontend's.
- `routes/roles.js` create/update/delete — guard upgraded from `authorize('admin')` to `requireAccessControlManage` (Admin, or anyone delegated `access_control.manage`). Strict superset — nothing that could do this before lost access.

**New frontend** (`frontend/src/`):
- `hooks/useAccessControl.js` + `store/accessControlStore.js` + `services/accessControlApi.js` — the one hook every component should use instead of re-deriving `user.role === 'admin'` or fetching a module's permissions itself.
- `pages/AccessControlPage.jsx` (route `/access-control`, guarded by `components/AccessControlRouteGuard.jsx`) — the standalone centralized module. Three tabs: **Users** (search, pick one, edit their whole access profile), **Roles & Permissions** (create/edit/delete roles, delegate `access_control.manage` to a specific user), **Modules** (bulk "who has Sales/Finance access" view, one resource at a time).
- `components/AccessControl/UserAccessEditor.jsx` — the per-user editor: role, department, access scope, and every resource's overrides for one user, in one place. Used by the Users tab **and** by HRPanel's "Assign" modal — one implementation, two entry points.
- `components/AccessControl/AccessScopePicker.jsx` — Full Dept/Selected/My Tasks + project picker, extracted from what used to be ~250 lines hand-rolled inside HRPanel. Self-contained (fetches its own project options).
- `components/AccessControl/ResourceActionToggleGrid.jsx` — the button-grid + "turning off view cascades off everything else" rule, shared by `ResourceAccessPanel` (all users, one resource) and `UserAccessEditor` (one user, all resources) instead of being implemented twice.
- `components/AccessControl/ResourceAccessPanel.jsx` — unchanged in purpose from Revision 1 (bulk per-resource matrix), now built on `ResourceActionToggleGrid`.
- `Sidebar.jsx` — Sales/Finance nav visibility, plus a new "Access & Permissions" nav item, all read from `useAccessControl()` instead of ad hoc fetches.

**Security fixes**:
1. `PUT /api/users/:id` let any manager set their own or anyone's `role` to `admin` (found in Phase 0). Fixed: requires Admin, blocks self-change, matching `changeUserRole`.
2. `PUT /api/users/:id/role`, `PUT /api/users/:id/assign`, and `GET /api/users` were broadened this round (`allowRolesOrAccessControlManage` in `backend/middleware/requireAccessControl.js`) so a delegated non-admin can manage users through the centralized module. That broadening itself opened a new hole — a delegated Manager could promote *any* user, including themselves via a second account, to Admin. Closed in the same change: `changeUserRole` now rejects any role change involving `'admin'` (either direction) unless the caller is a genuine Admin (`req.user.role === 'admin'`), not just someone with a delegated grant. The frontend's role dropdown (`useRoleStore.getRolesForDropdown()`) already hid the Admin option from non-admins for the same reason — `UserAccessEditor` was switched to use it instead of the raw role list.

## Revision 2 changes — from "panels" to "the module"

Revision 1 (see git history) built the engine correctly but left the UI as reusable panels *embedded inside* the pages that used to own permission editing — Admin Settings still had a "Modules Access" tab, Finance still had an embedded access-control section, Teams still had a "Roles & Permissions" tab. That didn't satisfy "modules should only consume the centralized service" — it just made the scattered panels share one backend.

This round actually removes them:
- **Admin Settings** (`pages/AdminSettings.jsx`): "Modules Access" tab deleted. Replaced with a single link card to `/access-control`. `ModuleAccessPanel.jsx` deleted (dead — nothing else imported it).
- **Finance** (`pages/Finance/FinanceDashboard.jsx`): the embedded `<FinanceAccessControl />` section deleted, replaced with a "Manage Finance Access" quick-action button linking to `/access-control`. `FinanceAccessControl.jsx` deleted (dead).
- **Teams** (`pages/TeamManagement.jsx`): the "Roles & Permissions" tab (RoleManagementPanel, Create/Edit Role modals, the access-control delegation panel) removed entirely — the page is Departments + Employee Assignment only now, with a "Manage Roles & Permissions" link to `/access-control`. The one thing kept: `CreateRoleModal` still opens from inside `AddMemberModal`'s "+ create a new role" shortcut while adding a team member — that's a narrow workflow convenience, not a permission-management surface, and it calls the same `roleStore.createRole` the centralized module uses, so there's still only one implementation.
- **HR Panel** (`pages/HRPanel.jsx`): the "Assign Role & Access" modal's ~400-line hand-rolled role/department/scope/project-picker form was deleted outright and replaced with `<UserAccessEditor userId={...} />` — the exact same component the centralized module's Users tab uses. HR Panel keeps its own verify/decline/delete workflow (account lifecycle, not permissions) and just opens the shared editor for the "Assign" button.

Net result: search the frontend for anywhere that calls `PUT /api/sales/permissions`, `PATCH /api/users/:id/permissions`, or renders a role checklist, and there is exactly one place — inside `components/AccessControl/` and `pages/AccessControlPage.jsx`. Everywhere else either links there or calls `useAccessControl()` read-only.

## Revision 3 changes — confirmation modal, audit log, self-modification lockout

### One confirmation modal for every permission change

- `store/confirmModalStore.js` — an imperative, promise-based store: `request(details)` returns a `Promise<boolean>`, resolved when the user clicks Confirm or Cancel (or closes the dialog).
- `hooks/useConfirmPermissionChange.js` — the one hook every permission-editing surface calls: `const ok = await confirmChange({ targetUserName, targetUserRole, actionVerb, changes })`.
- `components/AccessControl/PermissionConfirmModal.jsx` — the one modal component, mounted once in `App.jsx` (next to `ToastContainer`). Renders the target user + role, a previous → new value for each change, and an auto-generated sentence ("You are granting 'Finance Page Access — Finance Page access' to Mohit Gahlyan."), or a custom `message` override for role-delete/role-update, which need more specific wording.
- `components/AccessControl/ResourceActionToggleGrid.jsx` gained `verbForToggle(actionKey, nextValue, viewActionKey)` — maps a toggle to one of the five required verbs (grant/revoke/enable/disable) so every toggle-based caller derives the same verb the same way.
- **Wired into every write path that changes a permission**: `ResourceAccessPanel` (bulk per-resource view), `UserAccessEditor` (per-user resource toggles *and* the batched role/department/scope save), and `EditRoleModal` (role-permission-checklist save *and* role delete — this **replaced** EditRoleModal's own inline two-step "are you sure" delete confirmation, which was exactly the kind of bespoke per-module dialog the brief said not to have).
- Deliberately **not** wired: `CreateRoleModal` (authoring a new role isn't grant/revoke/update/enable/disable of an existing permission) and HR Panel's verify/decline (account lifecycle, not permissions).

### Real audit log

- `backend/modules/permissions/auditLogService.js` — `recordAuditLog()` (write, never throws — a logging failure must not block the permission change it's recording) and `listAuditLog()` (read, newest first, with actor/target names resolved). Reuses the `AuditLog` model from `backend/modules/authorization/` — previously dead, unpopulated scaffolding found in Phase 0 — instead of adding a second audit table.
- Every write records one entry: `setResourceOverride`/`clearResourceOverride` (`PERMISSION_UPDATED`/`PERMISSION_REVOKED`), `changeUserRole` (`ROLE_CHANGED`), `assignUser` (`ACCESS_SCOPE_UPDATED`), `updateRole`/`deleteRole` (`ROLE_PERMISSIONS_UPDATED`/`ROLE_DELETED`).
- `GET /api/access-control/audit-log` (guarded by `requireAccessControlManage`) + a new **Activity Log** tab in `AccessControlPage` — a plain, read-only "who did what to whom, when" list.
- **Verified against the live database**, not just read: a throwaway script granted a real permission to the test account, confirmed exactly one new `AuditLog` row appeared with the correct actor/action/before/after, then restored the account's original state. Confirmed 0 parity mismatches afterward.

### Self-modification is now actually enforced, not just implied

Before this round, only `changeUserRole` blocked self-changes — `setResourceOverride`/`clearResourceOverride` (Sales, Finance, and delegated Access Control overrides) and `assignUser` (department/access scope) had no such check, so an Admin (or a delegated manager) could toggle their *own* Sales/Finance access or reassign their *own* department. Closed at the layer that matters most:

- **Backend** (the actual security boundary): `assertNotSelf()` inside `accessControlService.setResourceOverride`/`clearResourceOverride` — this protects every entry point that funnels through it, including the legacy `PUT /api/sales/permissions/:userId`, `PUT /api/sales-permissions/:id`, and `PATCH /api/users/:id/permissions` routes, not just the new centralized one. A matching explicit check was added to `userController.assignUser`. `changeUserRole`'s existing self-block was left as-is. Thrown as a proper `403` (`error.statusCode`), not a generic `400`.
- **Frontend** (UX convenience, not the boundary): the row/panel for the currently-logged-in user is disabled or hidden — in `ResourceAccessPanel` (toggle grid replaced with a "You cannot modify your own permissions" notice), `UserAccessEditor` (role select, department editor, `AccessScopePicker`, resource toggles, and the Save button all disabled, with a banner), `AccessControlPage`'s Users tab ("Manage Access" button replaced with "That's you"), and `HRPanel`'s user table ("Assign" replaced with "That's you"; "Delete" also hidden for one's own row as an extra safety measure, though that's account-lifecycle, not permissions, so it wasn't strictly required).
- **Verified**: the same throwaway script confirmed calling `setResourceOverride` with `actor === target` throws `"You cannot modify your own permissions."` with `statusCode: 403`, before any write happens.

## What did NOT change

- The 8 Sales actions, the finance toggle, the Full Dept/Selected/My Tasks scope, and the 14 (now 15) role-checklist keys — all the same names, same UI labels users already recognize.
- `SalesPermission` and `UserPermission` collections and models — kept as-is, un-migrated data source for rollback. Nothing writes to them anymore, but nothing deletes them either.
- `backend/modules/authorization/` (the dormant Workspace/Role-v2/PermissionGroup/Policy/AuditLog scaffold found in Phase 0) — left untouched except for reusing its `Workspace` model. Its own `Role` model still isn't imported anywhere, so the name-collision risk flagged in Phase 0 is unchanged (still latent, still harmless while unused). Recommend deleting that module in a follow-up once you're confident nothing will ever wire it up — it's dead code that could confuse the next person who touches this area.
- HR Panel's `accessType`/`allowedProjects` scope assignment — still lives directly on `User`, not yet moved into `AccessOverride`. This was the suggested phase 3 of the incremental order (Sales → Finance → HR scope → Teams roles); phases 1, 2, and 4 shipped, phase 3 did not, for time. It's already reusable in shape (the `scope`/`scopedResourceIds` fields on `AccessOverride` mirror it exactly) — moving it is additive, not a rewrite.

## How this was verified (do this again after any further change)

```bash
cd backend
node scripts/migratePermissionEngine.js     # idempotent — safe to re-run
node scripts/verifyPermissionParity.js      # compares OLD model-resolution vs NEW engine-resolution for every user
```

Run against the live dev database at every stage of this work, most recently after the Revision 2 UI move and the `changeUserRole` admin-escalation fix: **0 mismatches across all 30 users**, both times. `npm run build` (frontend) also passed clean after every round of file moves/deletes — that catches any dangling import from a component that got deleted (e.g. `ModuleAccessPanel.jsx`, `FinanceAccessControl.jsx`) or a broken prop chain. Re-run `verifyPermissionParity.js` any time you're unsure whether a change to the engine altered anyone's effective access — it exits non-zero and prints a table if it finds a mismatch.

## Rollback

Nothing here is destructive — no legacy table was dropped or altered, and the migration only ever upserts.

- **Roll back a specific consumer** (e.g., Sales): revert `salesPermissionMiddleware.js`, `salesController.js`, `salesPermissionController.js` to their pre-migration versions (git). They'll go back to reading/writing `SalesPermission` directly, which still has its original data — nothing was deleted from it.
- **Roll back everything**: `git revert` the commit(s). `AccessOverride` and the new `Workspace` doc are additive and can simply be left in the database unused — nothing reads them once the old code paths are back.
- **If a specific user's access looks wrong after this shipped**: check `AccessOverride.findOne({user, resource})` first — an explicit `deny` there overrides everything, including Admin, by design (that's the intentional "suspend one user" escape hatch from the brief). `DELETE /api/access-control/users/:userId/overrides/:resource` clears it back to role default.

## Revision 4 changes — the Activity Log, rebuilt for scale

The Revision 3 Activity Log tab was functional but not enterprise-grade: it rendered raw `JSON.stringify(before/after)`, fetched every matching row in one request, and — this was the important discovery — it was **showing entries from a completely different system**. `AuditLog` (`backend/modules/authorization/models/AuditLog.js`) turned out not to be the dormant model Phase 0 found; `backend/services/milestone/milestoneService.js` already writes to the exact same collection (`MILESTONE_CREATED`, `MILESTONE_APPROVAL_RECORDED`, etc., via its own `AuditLog.insertMany()` calls, with no shared field to distinguish writers). The old query had no filter for this at all, so a permissions-focused "Activity Log" was quietly showing finance milestone history too.

**Scoping decision**: rather than merge the two into one global feed (a much larger, cross-cutting change to a module this work doesn't otherwise touch), every write from the Access & Permissions engine now stamps `category: 'access_control'`, and the Activity Log query filters on it. The milestone service's writes are untouched and simply excluded. The schema and pagination/filtering *infrastructure* were still built generically (see below) — `category` + `targetType` is exactly the seam another module would use to adopt the same `recordAuditLog()` helper later, if that consolidation is ever wanted; today only Access & Permissions uses it, and only Access & Permissions events appear in this tab.

**Human-readable entries, computed once at write time — never reconstructed from raw JSON at render time**:
- `AuditLog` gained `summary` (one sentence), `changeDetails` (curated `{label, previous, next}` array — exactly what the requirement's example shows: *"Finance Page Access → Enabled | Export → Enabled"*), `resourceKey`/`resourceLabel`, and denormalized `actorName/Email/Role` + `targetName/Email/Role`. Denormalizing at write time means the log reads correctly even after someone's name changes later, and avoids an N+1 `User` lookup per row when listing at scale.
- `accessControlService.describeResourceChange()` builds the summary/diff for every Sales/Finance/delegation override change, deriving the correct verb (granted/revoked/updated) from whether the module's gating "view" action flipped. `changeUserRole`, `assignUser`, `createRole`, `updateRole`, and `deleteRole` each build their own summary inline (a generic formatter forced across dissimilar event shapes was tried and read worse than five short, purpose-written templates).
- Verified against the live database: after a real grant, the stored `summary` read *"Stark Edge granted Finance Module Access to Alpha"* — matching the requirement's example format exactly — and the detail fetch returned the curated `changeDetails` for exactly the fields that changed.
- **No-op writes are skipped** — if a save produces zero actual field changes (e.g., resubmitting identical values), nothing is written to the audit log at all, to avoid log spam at scale.

**Cursor (keyset) pagination, not offset** — `queryAuditLog()` sorts and filters on `_id` alone (ObjectIds are monotonically increasing at creation time, so this is a correct, single-field, already-indexed substitute for a `createdAt+_id` compound cursor). Page 10,000 costs exactly what page 1 costs. `hasMore` is determined by fetching one extra row, never a separate `count()` — a `count()` over a multi-million-row collection is itself an expensive query and was deliberately avoided.

**List vs. detail split, matching "load full details only when expanded" literally**: the list endpoint's Mongo projection explicitly excludes `changeDetails` and `changes` (`-changeDetails -changes -ipAddress -userAgent -workspace -__v`); a new `GET /api/access-control/audit-log/:id` returns them, called only on first expand and cached client-side in a `Map` ref (`detailCache`) so collapsing and re-expanding the same row never refetches.

**Search**: a compound Mongo **text index** over `actorName`, `targetName`, `resourceLabel`, `summary` (`{$text: {$search}}`) — chosen over a regex scan because it stays index-backed at any collection size, unlike `$regex` which degrades to a full scan. Verified present and query-able against the live database (`autoIndex` builds it automatically in dev; confirm it exists in production via `AuditLog.collection.indexes()` before relying on it there, or run `syncIndexes()` once during deploy).

**Frontend** (`components/AccessControl/AuditLogViewer.jsx`, replacing the old inline tab body): filter bar (search, sort toggle, date range, performed-by, affected-user, module, action-type — all against the same real users list `/api/users` already exposes, no new endpoint needed), `IntersectionObserver`-driven infinite scroll (100 initial / 50 per page, guarded against duplicate in-flight requests via a ref, never re-fetching a page already held in state), skeleton rows during both initial load and pagination, a "No more activity logs" terminal state, a zero-state for filters that match nothing, and day-grouping (Today/Yesterday/This Week/Earlier) computed client-side from the already-sorted, already-paginated list — grouping was kept out of the backend response specifically so it never has to reconcile with cursor page boundaries.

## Known gaps / suggested next steps

1. **HR Panel scope migration** (phase 3, not done) — `accessType`/`allowedProjects` still live directly on `User` rather than in `AccessOverride.scope`/`scopedResourceIds`, both still written via `PUT /api/users/:id/assign` (now callable by delegated non-admins too, not just admin/manager/hr). `UserAccessEditor`/`AccessScopePicker` already present this the same way everywhere, so the underlying storage move is additive whenever it happens, not a UI rewrite.
2. **Temporary/external members** (brief §3.7) — the primitives exist (`AccessOverride.expiresAt` is already excluded automatically by the resolver on every read; no cron required for correctness), but there's no invite-flow UI yet. Building it is now mostly frontend: an invite form that sets role + `scope: 'selected'` + `scopedResourceIds` + `expiresAt` via the existing override API.
3. **Deny-effect UI** — `effect: 'deny'` (the "suspend one user even if they're an Admin" case) is fully functional at the API/engine level but `ResourceAccessPanel`/`UserAccessEditor` only expose `grant` toggles today (see the note rendered in `UserAccessEditor` for Admin targets). Worth a small "suspend access" affordance if that scenario comes up in practice.
4. **`backend/modules/authorization/`** — recommend removing it once you're confident nothing will resurrect it; see "What did NOT change" above for the collision risk it still carries.
5. **Real-time**: per-user updates (Sales/Finance/role/access-control changes) push instantly via Socket.IO, as before. The pre-existing gap where **broadcast**-to-admins/managers events land in zero listeners (because the JWT carries no role claim to room-match against) is unrelated to this work and wasn't in scope — noted in Phase 0 §5, still open.
6. **Delegation is all-or-nothing per the module**, not per-resource yet — someone granted `access_control.manage` can manage every resource (Sales, Finance, other users' roles) and delegate the permission onward to others, but cannot be scoped to "Sales only." The brief accepted this as a first pass; the registry/override shape (`resource`-keyed) is what makes a future per-resource delegation scope addable without a rewrite.
7. **The confirmation modal doesn't cover `effect: 'deny'`** yet, for the same reason #3 above — there's no UI path to it, so nothing calls `confirmChange` for a deny. Adding the deny UI and wiring it through the same modal (`actionVerb: 'revoke'`) is one change, not two, once #3 is built.
8. **Self-modification lockout is scoped to a user's own grant/role/scope, not role *definitions*** — a delegated non-admin editing a custom role they happen to belong to is still allowed, even though it indirectly changes their own effective permissions (and everyone else's with that role). Blocking it would risk locking the only delegated manager out of fixing their own role with no admin available; flagging as a deliberate scoping choice, not an oversight, in case policy wants it tighter later.
9. **Entries written before Revision 4 have no `category`/`summary`/`changeDetails`/denormalized names** — they predate those fields existing, so they no longer appear in the Activity Log view (which filters on `category: 'access_control'`) and would render blank if they somehow did. These were a handful of entries from this feature's own development/testing, not production audit history, so no backfill script was written; if real pre-Revision-4 entries ever need to surface, a one-time migration deriving `category`/`summary` from the old `changes.before/after` blobs (still present, untouched) would be straightforward.
10. **The milestone service's audit writes remain on their own path** (`services/milestone/milestoneService.js`, direct `AuditLog.insertMany()`, no `category`) — this work deliberately didn't touch it. The schema/pagination/filtering built here is generic enough for it to adopt `recordAuditLog()`/`queryAuditLog()` later if a unified cross-module audit view is ever wanted, but that's a separate, larger change to a module this pass didn't otherwise touch.
11. **Production text-index verification**: the search index is created automatically by Mongoose's `autoIndex` in development (confirmed present and query-able against the live dev database this round). Production deployments often run with `autoIndex: false` for performance — confirm the index exists there (`AuditLog.collection.indexes()`) or run `syncIndexes()` once during deploy, or search will throw rather than silently degrade.

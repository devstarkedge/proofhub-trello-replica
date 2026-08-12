# Phase 0 — Authorization System Inventory (FlowTask)

**Status:** Read-only research. No code changed. Produced in response to the "Centralize the Permission & Access Control System" task brief, Section 2.
**Method:** Direct codebase inspection (`backend/`, `frontend/src/`), verified against actual imports/route mounts, not inferred from the product brief.

> **Rule applied throughout:** where this document contradicts an assumption in the task brief's Section 1, the assumption is corrected here explicitly rather than silently reconciled. See §6.

---

## 0. Headline discovery — a sixth, unused authorization engine already exists

Before the four systems the brief named, the codebase already contains a **fifth/sixth**, mostly-dead RBAC/ABAC engine at `backend/modules/authorization/`: `Workspace` → `WorkspaceMember` → `Role` (with inheritance) → `PermissionGroup` (resource/action/scope) → `Policy` (JSON-logic), a Redis-backed capability cache, an `AuditLog` model, and a `PolicyEngine.evaluate()`. It is mounted at `/api/authorization` in `server.js` and has one frontend caller — but:

- Nothing anywhere ever creates a `Workspace` or `WorkspaceMember` document.
- Its frontend caller (`roleStore.js: loadCapabilities`) is permanently gated behind `localStorage.getItem('workspaceId')`, which nothing in the app ever sets.
- Its own `Role` model calls `mongoose.model('Role', ...)` with a schema that **collides with** `backend/models/Role.js` (same model name, different schema) — currently silent only because nothing imports the module's `Role.js` directly; one future import away from `OverwriteModelError`.

**Implication for later phases:** this module is architecturally close to the "Target Architecture" in the task brief (workspace_id everywhere, role→permission registry, resource registry, override concept via Policy). Phase 1+ needs an explicit decision — adapt/rename this scaffold into the new engine, or delete it and build fresh — rather than accidentally leaving a second, name-colliding engine lying around. Flagging now because it changes the shape of every later phase.

---

## 1. Data model — every place permission/role/department/scope data lives

### 1.1 `backend/models/User.js` (the account record)
```js
role: { type: String, default: 'employee', lowercase: true, trim: true }   // free string, NOT a Mongoose enum
roleId: { type: ObjectId, ref: 'Role' }                                     // parallel pointer, can desync from `role` (see §6)
department: [{ type: ObjectId, ref: 'Department' }]                        // array — multi-department
team: { type: ObjectId, ref: 'Team' }
accessType: { type: String, enum: ['full_department','selected_projects','assigned_tasks'], default: 'full_department' }
allowedProjects: [{ type: ObjectId, ref: 'Board' }]
```
`accessType` **is** the "Access Scope" field (Full Dept / Selected / My Tasks) — it lives directly on `User`, there is no separate scope-assignment collection. Labels (from `HRPanel.jsx`): `full_department`→"Full Dept", `selected_projects`→"Selected", `assigned_tasks`→"My Tasks".

"My Tasks" scope is **not stored** — it's computed per-request in `services/permissionService.js: getAssignmentBasedBoardIds` via `Card/Subtask/SubtaskNano.distinct('board', {assignees:userId})`.

### 1.2 `backend/models/Role.js` (role catalog + 14-item checklist)
```js
name, slug (unique), description,
permissions: {
  // Creation
  canCreateDepartment, canCreateTask, canCreateProject, canCreateAnnouncement, canCreateReminder,
  // Member
  canAssignMembers,
  // Delete
  canDeleteTasks, canDeleteProjects,
  // Task Editing  (NOT named in the task brief's 4-category list — see §6)
  canEditPriority, canEditDates, canManageAttachments,
  // Management
  canManageRoles, canManageUsers, canManageSystem
},
isSystem: Boolean,   // "cannot be modified" flag
createdBy: ref User, isActive: Boolean
```
14 fields total, but **5 groups**, not 4 (Creation/Member/Delete/Editing/Management). `roleController.js: PERMISSION_DEFINITIONS` (the admin "Create Role" UI's source of truth) only exposes **3 of the 5 groups** — Editing and Management are in the schema and in `Role.getDefaultPermissions()` but have no checkbox in the admin UI.

Of the 6 fields not in the UI-exposed 3 groups, only `canManageSystem` is ever read anywhere (as a custom-role admin-escalation check). `canManageRoles`, `canManageUsers`, `canEditPriority`, `canEditDates`, `canManageAttachments` are set-but-never-read.

### 1.3 `backend/models/Department.js`
```js
name (unique), description, managers: [ref User], members: [ref User], projects: [ref Board], isActive
```
No role/permission fields — scoping happens via `User.department[]` + `Department.managers/members[]`, maintained manually (not via a transaction) in `userController.js: assignUser`.

### 1.4 `backend/models/Team.js`
```js
name, description, department: ref Department (required), owner: ref User (required), members: [ref User], isActive
```
Pure grouping construct; no permission fields.

### 1.5 `backend/models/UserPermission.js` — Finance access
```js
user: ref User (required), pageKey: String (default 'finance'),
hasAccess: Boolean,          // "Finance Page access" toggle
revenueAnalytics: Boolean, billingDetails: Boolean,
grantedBy: ref User
// collection: 'user_permissions', unique index on {user, pageKey}
```
`pageKey` was designed as a generic multi-module hook but **is hardcoded to `'finance'` everywhere** — no other value is ever set. `Role.getPagePermissions` short-circuits admins to full access without a DB read.

### 1.6 `backend/models/SalesPermission.js` — Sales 8-action matrix
```js
user: ref User (required, UNIQUE — one doc per user, no pageKey/module dimension),
moduleVisible, canCreate, canUpdate, canDelete, canExport, canImport, canManageDropdowns, canViewActivityLog,
moduleAccessNotifiedAt, grantedBy: ref User (required), notes
```
Field↔label mapping confirmed from `ModuleAccessPanel.jsx`: `moduleVisible`="Module Access", `canCreate`="Create", `canUpdate`="Update", `canDelete`="Delete", `canExport`="Export", `canImport`="Import", `canManageDropdowns`="Manage Options", `canViewActivityLog`="View Logs" — exact match to the brief's 8 actions.

**Note the shape mismatch with §1.5**: Finance uses a generic `{user, pageKey}` collection; Sales uses its own dedicated single-purpose collection. A third module today would have to pick one of two incompatible patterns — there is no single existing "module permission" abstraction to extend.

### 1.7 `backend/models/FinancePage.js` — Finance sub-page approval workflow (access-adjacent, not a permission checklist)
Workflow-based: Manager creates a page (`status:'pending'`) → Admin approves (`isPublic:true`) → visible to everyone. Distinct mechanism from `UserPermission`.

### 1.8 `backend/models/Announcement.js`
`subscribers.roles: enum ['admin','manager','hr','employee']` — the one place outside `Role`/`User` where the four role names are a real Mongoose enum.

### 1.9 `backend/modules/authorization/*` models
`Workspace`, `WorkspaceMember`, `Role` (v2, name-colliding — see §0), `PermissionGroup`, `Policy`, `AuditLog` — fully designed, zero live data, see §0.

### Not found anywhere
No `Invite`/`ExternalMember`/`isExternal`/`expiresAt`-on-access fields exist in any model. The only "invite" concept is `Team.inviteUser`/`joinTeam` (legacy), where the "token" is literally the Team's Mongo `_id` — no expiry field exists to expire.

---

## 2. API endpoints — every read/write of the above

### Reads
| Endpoint | Guard |
|---|---|
| `GET /api/roles` | `protect` |
| `GET /api/roles/my-permissions` | `protect` |
| `GET /api/roles/permissions/definitions` | `protect, authorize('admin')` |
| `GET /api/users/:id/permissions` (Finance) | `protect` (no role restriction — self or admin logic inline) |
| `GET /api/sales/permissions/:userId` | `protect` + router-level `checkSalesPermission` — **no `authorize()` at route level**; inline `role!=='admin' && self!=userId → 403` |
| `GET /api/sales-permissions/:id` | `protect, authorize('admin')` |
| `GET /api/authorization/my-capabilities` | `protect` (always returns `{}` in practice — §0) |

### Writes
| Endpoint | Route guard | Notable controller-body gap |
|---|---|---|
| `PUT /api/users/:id/role` (`changeUserRole`) | `authorize('admin')` | Validates role, blocks self-change, invalidates cache — the "correct" path. |
| `PUT /api/users/:id` (`updateUser`) | `ownerOrAdminManager` | **See §4 — a manager can self-promote to admin through this endpoint.** |
| `PUT /api/users/:id/verify` | `authorize('admin')` | Can set `role`/`department`; **never invalidates auth cache**. |
| `PUT /api/users/:id/assign` (dept/scope) | `managerHrOrAdmin` | No department-ownership check — any manager can reassign any user to any department. |
| `PATCH /api/users/:id/permissions` (Finance) | `authorize('admin')` | Blocks self-role-change from this modal specifically; invalidates cache; emits socket event. |
| `PUT /api/sales-permissions/:id` | `authorize('admin')` | — |
| `PUT /api/sales/permissions/:userId` | `authorize('admin')` | **Duplicate write path to the same collection as the row above** — two controllers, near-identical payload-sanitization code, independently maintained. |
| `POST/PUT/DELETE /api/roles*` | `authorize('admin')` | `isSystem` blocks update/delete; **none of create/update/delete call `invalidateAuthCache`** — a permission change on a custom role can be stale in a cached user object for up to 60s. |
| `PUT/DELETE /api/departments/:id`, member/bulk routes | `authorize('admin','manager')` | No department-ownership scoping — any manager can mutate any department. |
| `PUT/DELETE /api/teams/:id`, `addMember` | `authorize('admin','manager')` **+ inline** `owner===self \|\| role==='admin'` | Consistent, double-gated. |
| `POST /api/teams/:teamId/invite`, `DELETE /api/teams/:teamId/members/:userId` (legacy) | `protect` only | Inline: **owner-only, no admin bypass** — a different, inconsistent rule from the block above, in the same file. |
| `POST /api/teams/join/:token` (legacy) | `protect` only | **No authorization check at all** — any authenticated user can join any team by supplying its Mongo `_id`. |

---

## 3. Frontend — every component/page rendering permission/role UI

| Surface | Component | Reads via | Writes via |
|---|---|---|---|
| Admin Settings → Modules Access (Sales) | `components/Admin/ModuleAccessPanel.jsx` | `salesApi.getUserPermissions` → `GET /api/sales/permissions/:userId` | `salesApi.updateUserPermissions` → `PUT /api/sales/permissions/:userId` |
| Finance → User Access Control | `components/Finance/FinanceAccessControl.jsx` | `userPermissionsApi.getUserPagePermissions` → `GET /api/users/:id/permissions` | `patchUserPagePermissions` → `PATCH /api/users/:id/permissions` |
| HR Panel → Assign Role & Access | `pages/HRPanel.jsx` (modal inline) | `GET /api/roles`, `GET /api/boards?departmentIds=` | `PUT /api/users/:id/role`, `PUT /api/users/:id/assign` |
| Teams → Roles & Permissions | `pages/TeamManagement.jsx`, `components/TeamManagement/RoleManagementPanel.jsx`, `modals/CreateRoleModal.jsx`, `EditRoleModal.jsx` | `roleStore.loadRoles` → `GET /api/roles` | `createRole/updateRole/deleteRole` → `POST/PUT/DELETE /api/roles` |
| Sidebar nav visibility | `components/Sidebar.jsx` | Directly calls `getSalesPermissions` + `getUserPagePermissions` (its own local `useState`, not any shared store) | — (read-only) |
| Route guarding | `components/PrivateRoute.jsx`, `components/FinanceRouteGuard.jsx`, `pages/SalesPage.jsx` self-check, `pages/TeamManagement.jsx` self-check | Four independent mechanisms, see §4 | — |

**Confirmed: at least five independently-implemented "can this user do X" systems**, not counting ~15+ ad hoc inline `user.role === 'admin'`/`'manager'` checks scattered across `Header.jsx`, `ProjectCard.jsx`, `EditProjectModal.jsx`, `HomePage.jsx`, `ListView.jsx`, `WorkFlow.jsx`, `useBilledTimeAccess.js`, `CustomTabBar.jsx`, etc. (each re-deriving the identical `admin||manager` rule independently). Full file:line list is in the raw research; happy to fold it into this doc if useful for later phases.

A **sixth candidate system, `context/MeContext.jsx`**, is fully built (`isAdmin`/`isManager`/`canManageReminders`) but is provided in the tree and never consumed anywhere — dead code duplicating System 1's logic.

---

## 4. Frontend-only checks — CRITICAL security gaps

These are checks that exist on the client with **no equivalent server-side check**, or where the server-side check is *weaker* than the client implies:

1. **🔴 Manager self-promotion to Admin.** `PUT /api/users/:id` (`updateUser`, guarded only by `ownerOrAdminManager`, which passes for *any* manager, not just the resource's own manager) contains:
   ```js
   if (role && (req.user.role === 'admin' || req.user.role === 'manager')) { user.role = role; ... }
   ```
   with no target-role restriction and no self-change block (contrast with the "proper" `changeUserRole` endpoint, which is admin-only and blocks self-change). **A manager can call this endpoint on their own user id with `{ role: 'admin' }` and become an admin.** This is not a frontend-only gap in the classic sense (there's no client code doing this on purpose) — it's a real, directly-exploitable API vulnerability. Flagging as the single most urgent finding in this audit.

2. **🔴 Unauthenticated-by-role team join.** `POST /api/teams/join/:token` has `protect` only — no ownership/invite validation, and the "token" is the team's plain Mongo `_id`. Any authenticated user who can guess/observe a team id can join it.

3. **🟡 `/sales` route has no router-level guard at all.** Unlike every other protected route (`/finance/*`, `/teams`, `/hr-panel`, `/admin/settings`), `/sales` is reachable by any authenticated user in the router; `SalesPage.jsx` performs its own client-side fetch-then-redirect after mount. The actual data endpoints (`/api/sales/*`) are separately guarded by `checkSalesPermission` server-side, so this is a UX/defense-in-depth gap rather than a data-exposure one — but the pattern differs from the rest of the app and is worth normalizing under the new engine.

4. **🟡 `Role.permissions` (the 14-item checklist) is not enforced anywhere.** The only middleware that reads it (`permissionMiddleware.js: checkPermission/checkAnyPermission/checkAllPermissions`) is never imported by any route file. All actual route protection uses hardcoded role-name checks (`authorize('admin')`, etc.), not the checklist. **An admin can toggle any checkbox in "Create/Edit Role" and it has zero effect on any real endpoint.** This is arguably the most product-visible gap: the entire Teams → Roles & Permissions UI is currently cosmetic for custom roles beyond the role-name gate itself.

5. **🟡 `capabilityMiddleware.js` (`requireCapability`) is built but never applied to any route** — `boardController.js`/`departmentController.js` call the underlying `permissionService` capability functions directly and inline instead, bypassing the middleware meant to wrap them.

6. **🟢 (verified safe) Sidebar/route-guard "hiding" for Sales/Finance is backed by real server checks.** `checkSalesPermission`/`checkFinanceAccess` middleware re-validate on every `/api/sales/*` and `/api/finance/*` request server-side, independent of what the sidebar shows — hiding the nav item is UX convenience here, not the security boundary, which is the correct pattern the brief asks to generalize.

7. **🟡 `authorize()`'s custom-role fallback is looser than it looks.** In `authMiddleware.js`, any user whose custom role simply exists and is `isActive: true` passes `authorize(...)` **regardless of which roles were requested** — the code comment even says "More granular permission checks should be done using checkPermission middleware" (which, per #4, is never wired in). Practically: today only 4 roles exist (`admin/manager/hr/employee`) so this fallback branch is rarely hit, but the first real custom role created will inherit this behavior.

---

## 5. Role-change propagation — instant, cached, or requires re-login?

- **JWT payload contains only `{ id }`** (`authController.js: generateToken`) — no role/permission claims are ever embedded, so there is no "stale JWT" risk in the way the brief worried about; role/permission data is always re-derived from Mongo on `protect`.
- **In-process LRU cache** (`authCache`, `config/index.js`): 60s TTL, per-process, keyed by userId, storing the full lean `User` doc used by `protect`/`authorize()`'s primary branch. Explicit invalidation exists in `assignUser`, `changeUserRole`, `patchUserPagePermissions`, department add/remove/bulk routes — but **not** in `updateUser`, `verifyUser`, or any of `createRole/updateRole/deleteRole`. Worst case staleness today: **60 seconds**, not "requires re-login."
- **Per-user real-time push works correctly**: `emitToUser(userId, 'user-role-changed'|'finance:permissions:updated'|'sales:permissions:updated', ...)` → every socket joins its own `user-${id}` room unconditionally → `AuthContext.jsx` listens for `socket-user-role-changed` and patches `user.role` + reloads `roleStore.myPermissions` live, no reload needed. Sales/Finance panels dispatch matching DOM `CustomEvent`s consumed by `Sidebar.jsx`/`FinanceRouteGuard.jsx` for the same live-update effect.
- **Admin/manager broadcast rooms are dead.** `socketManager.js` decodes the JWT directly for socket auth (`jwt.verify` with no DB lookup), so `decodedUser.role` is always `undefined` (JWT has no role claim — see above) → no socket ever joins `ROOM.admin`/`ROOM.managers` → any `io.to(ROOM.admin)` broadcast (e.g. finance-page pending/approved notifications) reaches zero listeners. Distinct bug from the caching question, but relevant to "real-time propagation" — broadcast-style updates don't work; targeted per-user updates do.
- **ABAC `capabilities` (roleStore) has no live-refresh path at all** — unlike RBAC `myPermissions`, nothing re-triggers `loadCapabilities()` on any socket event. Moot today since it always resolves empty (§0), but worth noting for the target design.

**Bottom line: no role/permission change in this app today requires a re-login.** Worst case is a 60-second in-process cache window on a subset of mutation endpoints; the common paths (`changeUserRole`, `assignUser`, Finance/Sales toggles) are both cache-invalidated and socket-pushed immediately.

---

## 6. Discrepancies vs. the task brief's Section 1 assumptions

Per the ground rule, these are called out rather than silently corrected:

1. **Sidebar visibility is *not* purely hardcoded to role**, contrary to the brief's claim ("Currently appears hardcoded to role, not overridable per user"). Sales and Finance nav items are already per-user overridable today (`salesVisible`/`financeVisible`, each independently fetched). Only the *other* items (Teams, HR Panel, Admin Settings, Client Reminders) are pure role-string branches with no per-user override path. So the sidebar is a hybrid, not uniformly hardcoded.
2. **The role checklist has 5 categories, not 4.** The brief lists "Creation Permissions, Member Permissions, Delete Permissions, Management Permissions." The actual schema/UI has a fifth — **Task Editing Permissions** (`canEditPriority`, `canEditDates`, `canManageAttachments`) — and the admin-facing "Create Role" modal only surfaces 3 of the 5 groups (Creation/Member/Delete), silently omitting Editing and Management from the checkbox UI even though those fields exist and are settable via direct API calls.
3. **A functioning generic module-permission pattern does not actually exist to extend.** The brief implies Sales and Finance are two instances of "the same pattern" that just need centralizing. In reality they use two structurally different collections (`SalesPermission`: one doc per user, no module dimension; `UserPermission`: `{user, pageKey}` compound-keyed, module dimension present but never used beyond `'finance'`). Neither is a template that already generalizes — both need reshaping.
4. **A prior, unfinished attempt at exactly this centralization already exists** (`backend/modules/authorization/`, §0) — the brief's Section 1 doesn't mention this at all, presumably because it's invisible from the product/UI side (it has no UI and produces empty results for every real user). This is the single biggest thing that should shape Phase 1 planning: reusing/renaming vs. removing this scaffold is a decision point, not a detail.
5. **Two parallel identity pointers for role exist** (`User.role` string + `User.roleId` ref) that can desync — not mentioned in the brief, relevant to designing the new `role_permission` mapping described in Section 3.1 of the brief.

---

## 7. Summary table — the "four systems" the brief named, confirmed

| Surface (per brief) | Confirmed backend store | Confirmed frontend owner | Confirmed independent from the others? |
|---|---|---|---|
| Module permission matrix (Sales) | `SalesPermission` (dedicated collection) | `ModuleAccessPanel.jsx` + `salesStore.js` | Yes — own model, own middleware, own Zustand store |
| Finance access toggle | `UserPermission` (generic-but-unused-generically) | `FinanceAccessControl.jsx` + 2 more local copies (`Sidebar.jsx`, `FinanceRouteGuard.jsx`) | Yes — own model, own middleware; also internally triplicated on the frontend (3 separate fetch/cache sites for the same flag) |
| Role / Department / Scope | `User.role`+`roleId`, `User.accessType`+`allowedProjects`, `Department.members/managers` | `HRPanel.jsx` | Yes — writes directly to `User`, no shared override table |
| Roles & Permissions (custom roles, 14-checklist) | `Role.permissions` | `RoleManagementPanel.jsx`, `CreateRoleModal.jsx`, `EditRoleModal.jsx` | Yes — and, per §4.4, its checklist isn't enforced by any live route anyway |
| *(not named in brief, found in audit)* Enterprise ABAC engine | `Workspace`/`WorkspaceMember`/`Role`(v2)/`PermissionGroup`/`Policy` | `roleStore.js: loadCapabilities` (permanently short-circuited) | Yes — fully separate, entirely dormant |

Confirmed: **no shared schema, no shared check function, no shared UI component** across any of these — matches the brief's stated root problem exactly, with the addition of the dormant 5th/6th system in §0.

---

## Next step

Per the task brief's own instructions, this inventory should be reviewed before any Phase 1 code changes begin (schema/migration design, `hasPermission` resolver, unified UI). Two decisions worth making explicitly before Phase 1 starts:

1. What happens to `backend/modules/authorization/` — repurpose its `Workspace`/`PermissionGroup`/`Policy` shape as the new engine's foundation, or remove it and build the brief's Section 3.1 schema fresh? (Its model-name collision with `backend/models/Role.js` should be resolved either way, before it causes a crash.)
2. Confirm the fix in §4.1 (manager self-promotion via `PUT /api/users/:id`) should be treated as an immediate, standalone security patch rather than something that waits for the full Phase 1-4 migration — it's exploitable today, independent of any centralization work.

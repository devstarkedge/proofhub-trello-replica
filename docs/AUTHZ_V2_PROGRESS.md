# Access control v2 implementation

The supplied `FLOWTASK_ACCESS_CONTROL_V2_PROMPT.md` is the implementation specification. The original discovery document was already staged before this work and will not be included in implementation commits.

## Phases

- [ ] 0: Security hotfixes and HTTP regressions
- [ ] 1: Catalog, engine, context, ceiling, writer, audit, read API, report, reversible migrations, shadow mode
- [ ] 2: Declare and enforce backend routes, scoped queries and update fields
- [ ] 3: Realtime, workers, files, integrations and sessions
- [ ] 4: Permission-driven frontend and Access Control Center
- [ ] 5: Guest implementation behind a disabled flag
- [ ] 6: Performance verification (domain join is optional and not approved)
- [ ] 7: Cleanup and documentation (destructive migration requires approval)

## Current stop condition — 2026-10-08

Implementation is **not complete**. Implementation and migration work stopped after the required read-only database report found possible C4 incident evidence. The supplied specification, section 13.2, explicitly says: **"If items 1, 10 or 11 show anything suspicious, stop and tell me."** No database records, indexes, schedules, environment values or deployment were changed during this task.

Report: `reports/authz-premigration-2026-10-08T13-00-33-925Z.md` and the companion JSON. These local audit artifacts are intentionally excluded from implementation commits because they contain internal record IDs and access information.

The report examined 22 workspaces, 85 membership rows, 58 identity accounts, 91 boards and 3,355 notifications. Item 11 flags **214 distinct notification records**:

- 186 notifications have a recipient with no retained membership history in the notification's workspace.
- 28 notifications lack a workspace ID but reference a workspace-owned entity. These are missing-tenant records, not confirmed foreign-workspace deliveries.

These findings do **not** prove compromise or that a recipient read a payload. Retained membership history and persisted notifications are evidence for review; historical membership deletion and old unscoped data can affect interpretation. Historical socket, email and push delivery cannot be established from these collections alone.

Other findings: 20 membership/User mirror divergences; 7 memberships with missing `roleId`; 11 department roster mismatches; 1 global admin with a non-admin workspace membership; 1 restricted admin; 11 comments with unresolved parent boards. No invite/join-based admin-promotion indicators, child/board tenant mismatches, or external scheduled-report recipients were detected by these checks.

## Changes prepared on the branch

| Module | Changes | Main files |
| --- | --- | --- |
| Authentication | Removed permissive multi-role fallback; duplicate `protect` calls reuse the request context; anonymous email checks are uniform and rate limited; public health exposes status only. | `backend/middleware/authMiddleware.js`, `backend/controllers/authController.js`, `backend/routes/auth.js`, `backend/server.js` |
| Membership and people | Mirror-sync now invalidates only; registration and department creation no longer write global authorization mirrors; user search/audiences and statistics resolve membership; member removal preserves the global identity; tenant profile responses overlay membership. | `backend/modules/workspaces/membershipSyncService.js`, `backend/modules/workspaces/departmentCreation.js`, `backend/services/workspaceAudience.js`, `backend/controllers/userController.js`, `backend/controllers/adminController.js` |
| Content updates | Strict per-entity update fields; ownership and tenant IDs rejected; list/project relationship checked; tenant query-update and foreign-create guards. Existing subtask tag/order/attachment fields retained. | `backend/utils/strictUpdate.js`, task/list/subtask controllers, `backend/modules/workspaces/workspaceScopePlugin.js` |
| Account settings | Removed `.env` credential writer and default seeded password; email changes require an account-bound, expiring, hashed confirmation token and notify the old address; added confirmation page. | `backend/services/emailChangeService.js`, `backend/controllers/adminController.js`, `backend/utils/seed.js`, `frontend/src/pages/ConfirmEmailChange.jsx` |
| Attendance | Four management sub-routers now apply permission gates to their declared routes, allowing later self/team routes to match. | `backend/modules/attendance/attendance*Override.routes.js`, `attendanceShift.routes.js`, `attendanceLocation.routes.js` |
| Realtime and audiences | Workspace-namespaced rooms; sales emitters updated; client mutation relays removed; membership checked on room joins; announcement audiences use membership; additional announcement events go to the current audience; notification creation validates recipient membership. | `backend/realtime/*`, `backend/services/announcementEvents.js`, `backend/controllers/announcementController.js`, `backend/controllers/salesController.js`, `backend/utils/notificationService.js` |
| Scheduled analytics | Delivery reloads creator identity/membership/workspace and validates current recipient permissions; no schedules paused. | `backend/services/analytics/analyticsReportService.js` |
| V2 foundation | Catalog, templates, context, decision/explanation/query engine, ceiling functions, tenant loaders, permission/audit models, declared read API and read-only report. Existing user/workspace access adapters use an initial central membership writer. | `backend/authz/*`, `backend/models/PermissionOverride.js`, `backend/models/AccessAuditLog.js`, `backend/scripts/authzReport.js` |

## Validation

- Baseline: 4 existing backend HTTP tests passed before changes.
- Current backend suite: **77 tests passed across 6 files**. Covers decision rules, guest caps, deny/expiry/tenant behavior, ceiling checks, task query filters, read-only report classification, actual controller HTTP rejection paths, membership mirror no-op, scoped statistics, uniform/rate-limited email checks, literal search, attendance gate matching and tenant write guards.
- Existing project-deletion HTTP tests still pass. Existing tests were not weakened.
- Backend syntax: **458 JavaScript files checked; zero failures**.
- Final frontend production build **passed**, including the confirmation page (4,353 modules). It retains existing warnings about mixed static/dynamic imports and the approximately 4.2 MB main bundle; these are not build failures.
- `git diff --check` passed (Windows line-ending warnings only).
- Read-only report ran successfully through the native Mongo driver, avoiding model initialization, auto-indexing, server boot, seed functions and migration runners. Incident indicators cause a nonzero CLI result; that is an intentional stop, not a failed database read.
- No live HTTP/browser tests, real SMTP delivery, multi-process Redis validation, staging migrations or production deployment were performed. The application server was not started because startup can seed records and launch workers.

## Issue status and new findings

Initial code fixes were prepared for C1–C7, H8, M10, M11 and L3–L5/L7. **This is not a claim that those issues or Phase 0 are fully closed.** HTTP coverage still needs to be completed for every specified fix, and Phase 1/2/3 controls remain necessary for full authorization coverage.

- `NEW-1` (fixed/tested): tenant-bound create/insertMany/upsert paths could accept an explicit foreign `workspaceId`; the plugin now rejects that input.
- `NEW-2` (fixed; not separately HTTP-tested): removing one department previously unset the entire membership department array; it now pulls only the requested department.
- `NEW-3` (fixed; additional integration tests pending): user/profile responses could return global role and department mirrors instead of the current membership; responses now overlay membership, and other-member identity reads use an explicit projection.
- `NEW-4` (fixed; socket integration tests pending): admin/manager/department auto-joins read nonexistent JWT role/department claims; they now use the server-loaded membership. Legacy sales emitters required room-name updates to preserve delivery after namespacing.
- `NEW-5` (fixed; delivery integration tests pending): extra announcement events could disclose audience-specific payloads to other members of the same workspace; they now resolve the audience and creator before emitting.

## Remaining work (no completion claim)

- **Phase 0:** finish all required HTTP regressions and review identity verification, notification delivery and scheduled report behavior end to end.
- **Phase 1:** finish the transaction-backed central writer, append-only audit integration, role/override CRUD, ceiling enforcement in adapters, department writer, Redis version invalidation/cache, full context aggregation and shadow-mode comparison/summary. The present membership writer remains transitional and the new audit model is not yet the writer's audit backend.
- Prepare idempotent reversible migration implementations 001–004 and 006–008 with `down` tests and staging dry runs. **No v2 migration has been added to or run through the existing boot/CLI migration registry.**
- **Phase 2:** declare every existing route, replace legacy gates and role checks, scope all queries and field updates, emit `_perms`, and pass the role × endpoint matrix. Only the new `/api/authz` read router currently runs the declaration assertion. Legacy routes have not been fully converted.
- **Phase 3:** complete socket room authorization/revocation, workers, exports/files, session token-version enforcement and the separately approved ChatApp contract. Room namespacing is implemented; complete resource authorization and live multi-process revocation are not.
- **Phase 4:** build the permission-driven frontend and full Access Control Center. The email confirmation page is the only new frontend flow in this checkpoint; existing role-name checks remain.
- **Phases 5–7:** guest provisioning/share UX, performance validation and eventual approved legacy cleanup remain. Guest data/engine caps exist, activation does not. Optional domain joining is not implemented or approved.
- Do not enable `AUTHZ_V2=enforce`, assume per-module enforcement is available, or deploy this incomplete checkpoint. Project visibility stays on the legacy default pending migration 005 approval; the new engine intentionally does not interpret legacy `public` as an approved v2 visibility.

## Review needed and next step

1. Review item 11 in the companion JSON and tell me whether to proceed with incident assessment/remediation and implementation. Preserve the existing evidence; no notification deletion or data repair is proposed without that review.
2. Before any real write migration, confirm a backup and identify a staging database. Visibility mapping 005, guest activation, ChatApp contract changes and destructive cleanup 009 require their separate approvals.

After incident review, finish Phase 0 validation and the Phase 1 writer/cache/migration/shadow work on the branch, review staging results, then enforce modules in the specified order. No inference from elapsed time or an unanswered review request will be treated as approval.

## Verified starting point

- Branch: `feat/authz-v2`; baseline backend tests: 4 passed.
- Only pre-existing staged change: `docs/RBAC_CONTEXT.md`. No attendance changes were present.
- Discovery issue references are rechecked against current files before edits.
- No production settings, databases, integrations or deployment have been changed.

## Approval gates

The specification requires backup confirmation and reviewed staging output before write migrations against a real database, separate approval for visibility mapping (005) and legacy deletion (009), and approval for ChatApp contract changes, guest activation, cookie/CORS changes and domain join. These remain pending until reviewable artifacts are ready.

## 2026-10-09 authorized UI follow-up

The user separately authorized centralizing the existing permission UI and replacing action tiles with checkboxes. That follow-up is implemented in the current workspace; see `ACCESS_CONTROL_UI_UPDATE.md` for its scope and behavior.

- HR assignment and the central Users tab now use the same responsive member-access dialog/editor. User, module, and role permission pickers share visible native checkbox controls. Project scope remains a mutually exclusive radio selection.
- Fixed project-only saves, unintended team clearing, offline false-success responses, failed-read editing, stale permission-store responses, confirmation/cascade visibility, and read-only/self-edit states.
- The legacy override service now reads the same active workspace membership for both reads and writes. Resolver source metadata marks built-in role-provided module access as read-only. Administrator checkboxes show actual effective access, including denies.
- Validation: **82 backend tests passed across 7 files**, **12 mocked browser checks passed**, changed frontend files and the isolated preview passed ESLint, backend service syntax passed, and the final frontend production build passed (**4,358 modules**). Desktop/mobile light/dark screenshots were visually reviewed. `git diff --check` passed; Windows line-ending warnings remain informational.
- An initial production build exhausted memory during parallel minification. Limiting minification to one worker allowed the final build to pass. Existing mixed-import and approximately 4.2 MB main-bundle warnings remain.
- No real database writes, migrations, production application-server startup, or deployment occurred. The pre-existing staged `docs/RBAC_CONTEXT.md` and private report artifacts were preserved.

This is an improvement to the existing workspace-scoped permission UI and its supporting service, not completion or activation of the full Phase 4 v2 Access Control Center. The remaining v2 writer, ceiling enforcement, route/socket conversion, incident review, migration approvals, and rollout gates listed above are unchanged.

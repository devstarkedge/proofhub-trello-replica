# FlowTask audit remediation

The implementation covers all 41 findings in the audit. Changes are local; production rollout remains a separate operation. No production database, cloud asset, email account, deployment, or branch protection setting has been changed.

## PM Sheet dependency decision

Removed 28 PM-only files: the server controller/route and both clients' pages, context, layout, service, and PM components. Removed their route mounts, navigation, marketing/configuration references and permission catalog/template entries. Finance did not import PM Sheet. PM Sheet only read shared project/time/milestone/identity models; those models remain available to Finance.

A fresh source scan finds only three `pm-sheet` reserved-slug entries. Separate recommendation: retain these routing safeguards so old PM URLs cannot become a newly created workspace. They are not module dependencies. Historical PM grants can be removed in a reviewed data cleanup; the catalog ignores unknown grants. Removing PM Sheet requires no Finance data migration.

## Finding-by-finding implementation

| Audit IDs | Implemented change |
|---|---|
| FT-001 | Explicit workspace dropdown seeding and guarded bulk-write filters/inserts/upserts. |
| FT-002–005,007–009 | Shared project/action authorization for hierarchy, comments, files, versions, recurrence, activity and alternate listings. Own/assigned grant and deny scopes apply to direct reads, list/search/calendar results and pagination counts. Destination authorization for copy/move/promotion. |
| FT-006 | New project files use authenticated Cloudinary delivery. Stable application references issue 15-minute file grants; each read reloads account/session/membership/project permissions and streams without exposing a storage redirect. File responses forbid caching. Legacy metadata, embedded files and editor/version links have a resumable maintenance migration. |
| FT-010 | Removed the unused PM Sheet module and its bypass paths. |
| FT-011 | Finance summary requires revenue analytics; detailed reports require billing access. Client navigation/report requests respect the corresponding permissions. |
| FT-012–014 | Retired Team-ID joining, transactional workspace team membership, active tenant member/reference and hierarchy checks, intersected project scope. |
| FT-015,018,019 | Session versions, uniform password rules, session invalidation and required-password-change enforcement in HTTP, sockets and both clients. |
| FT-016,027 | Shared account/workspace offline queue without credentials, single replay lease, retained retries/conflicts, server deduplication and a review/download/discard interface. |
| FT-017 | Fresh module permission, expiry, account/session and workspace checks for established socket recipients; permission changes disconnect affected subscriptions. |
| FT-020 | Alternate Sales permission reads resolve the selected workspace membership. |
| FT-021 | Transactional shared hierarchy deletion with durable, retryable file cleanup; cleanup rechecks retention predicates. Approved financial history blocks permanent project deletion. Copy, promotion and cross-project movement commit the hierarchy and file references together. |
| FT-022 | Transactional recurrence occurrence receipts, stable queue keys, atomic schedule advancement and initial instance creation. Deleted generated instances cannot reappear on replay. |
| FT-023 | Join decision claim, capacity, membership and department roster commit together. Rejection uses a pending-state conditional update. |
| FT-024 | Optimistic document/query revisions and explicit compare-and-swap for complete time-array replacement. |
| FT-025 | Transactional Sales bulk edits enforce single-row restrictions, required fields, validation and locks. |
| FT-026 | Transactional version counters, unique history versions/predecessors and atomic rollback of history plus entity content. |
| FT-028,029 | Preserved transient session failures with retry UI, short access tokens and single-flight rotating refresh sessions with absolute expiry. Delayed responses cannot restore an old account. |
| FT-030 | Actor/workspace/generation checks protect prefetch and in-flight workflow responses in both clients. |
| FT-031 | Vendored fixed SheetJS 0.20.3, bounded expanded archives/rows/cells, terminable parsing workers, timeout and cancellation. |
| FT-032–034 | Literal bounded search, disk-backed bounded uploads, rate/concurrency limits, bounded Drive downloads and pagination. |
| FT-035 | Database aggregation returns compact board/user/day time and milestone totals, lifetime revenue and milestone counts. Reports bound project/group counts and query duration. |
| FT-036 | Batched socket identity/membership/permission checks with bounded parallel project authorization and ordered publication. |
| FT-037 | Shared session transport, offline policy/queue, parser, server authorization, recurrence, copy/move and deletion services centralize critical behavior. Renderer-specific native integrations remain separate. |
| FT-038 | Desktop feature routes load on demand; parsing runs in separate workers. |
| FT-039 | Desktop startup reuses healthy/warming backends, starts a local backend when needed, checks configured readiness, cleans up owned processes on failure/cancellation and honors production preview configuration. |
| FT-040 | Disposable fixtures, versioned test sessions, current logical approval rules, explicit outbox completion and list/detail response contracts. Test setup blocks outbound mail and non-disposable network services. |
| FT-041 | Pin Node 24.22.1 LTS, use lockfile installs, add build CI gates and a health check. Tests and their execution fixtures are kept local by user preference; GitHub does not run test suites. Production refuses startup with pending migrations and disables automatic index changes. |

## Rollout and compatibility

1. Back up MongoDB and Cloudinary metadata; verify the restore procedure. Rehearse on a staging copy. Stop writes during file/data/index migration.
2. Install Node 24.22.1 and run `npm ci --no-audit` in backend, frontend and desktopApp. Run the repository build workflow. Run the backend, desktop and Electron tests locally using the retained test files. The local validation runtime is isolated from the installed Node.
3. From backend, run `node scripts/migratePrivateAttachments.js` for a dry run. The read-only preflight reports `recoverable`, `blocked`, `reconciliation` and `issues` (up to 100 diagnostic samples). Missing attachment ownership is recovered only from verified existing parents; missing cloud metadata requires an owned, versioned Cloudinary URL. Conflicting or orphaned references require a reviewed mapping. The migration never guesses a workspace from the uploader or a storage folder. Both dry run and `--apply` finish preflight before starting any migration write; resolve every blocker before applying. Keep `scripts/attachmentMigrationReferences.js` with the main migration when deploying. Run the main script with `--apply`, then rerun the dry run to confirm completion. Cloud conversion invalidates old public CDN URLs asynchronously: verify anonymous access to old originals/derivatives is denied and current file/cover/editor/copy downloads work before reopening traffic.

   Legacy Announcement attachment metadata is counted as `nonProject` only when the referenced announcement and workspace exist, their ownership agrees, and no project relationships are present. These files retain their announcement delivery policy and do not block the project-file integrity gate. A bare `contextType: announcement` value does not bypass checks.

   To preserve legacy orphan attachments, explicitly choose `node scripts/migratePrivateAttachments.js --quarantine-orphans` for a read-only preview. This option still requires verified workspace ownership, missing owning records, no matching app references and unambiguous storage metadata. It refuses live owners with broken ancestors, conflicting ownership, files shared with announcements and uncertain cloud mappings. Review `quarantineCandidates`, `quarantineSamples` and `blocked`. Only after `blocked` is zero, backup and maintenance are in place, and preservation is selected, run `node scripts/migratePrivateAttachments.js --quarantine-orphans --apply`. The command also converts ordinary eligible project files.

   Quarantine first preserves the complete original document in `attachmentquarantines`, then converts available owned cloud files to authenticated delivery without deleting their bytes. Its move out of the active attachment collection commits in a transaction. Failed cloud conversion retains a pending snapshot and the original active record for retry; the integrity migration rejects incomplete quarantines. A file is classified as already missing only after provider 404 responses for both source and authenticated delivery. A record with no storage locator is preserved as `metadata_only`. Quarantine has no TTL or automatic purge, and cloud deletion workers protect its retained assets across workspaces. Review/restore requires a deliberate maintenance operation; this is not a trash folder with an expiry. Ship the new `AttachmentQuarantine` model, quarantine/storage helpers and updated deletion worker with the migrations. No quarantine apply has been run by the assistant.
4. Run `npm run migrate:status`, review pending migrations, then `npm run migrate` during maintenance. The integrity migration stops on duplicate history numbers, duplicate active schedules, or remaining public file metadata; it does not discard history or guess which schedule to retire. Reconcile those records from the backup and rerun. New indexes/counters/receipts are additive; production does not apply them automatically.
5. Build/deploy both clients and backend together, check `/api/health`, and test ordinary users, managers, admins, cross-workspace denial and Finance revenue reconciliation. Require the CI job in branch protection using the repository hosting settings.

- Old access JWTs require sign-in. New access tokens last 15 minutes; hashed refresh sessions rotate and retain their absolute 30-day lifetime.
- Team-ID links return 410. New people use workspace invitations; authorized owners add existing active workspace members.
- Existing scheduled queue jobs retain their original occurrence identity. Superseded recovery jobs are skipped. Legacy completion jobs without a source task identity fail for operator review; reconcile them against generated subtasks before replaying. Cancellation removes both old and new scheduled/completion job formats.
- Full time-array replacement requires `expectedRevision`; normal clients use per-entry operations. Concurrent edits return 409.
- Unsafe legacy offline records cannot be attributed and are cleared on queue upgrade. New rejected edits remain available for review and download.
- Shared cloud files survive deletion of one copied task until the last attachment reference is removed. Public avatars/decorative project covers use their existing separate asset policy; confidential task/project file attachments use the protected file path.
- Media grants expire after 15 minutes. Reopening the task or refreshing its metadata issues current grants; storage access is checked again against current membership and project permissions.
- Roll back code only to a compatible security-aware build. Preserve refresh versions, private delivery, receipts and integrity indexes; do not restore public delivery or bypasses. Reconcile committed data separately from code rollback.

## Validation record

Test source, test configuration and renderer fixtures are local-only by user preference. They are ignored and removed from Git tracking while their local files are preserved. Fresh clones do not include these suites; the GitHub workflow checks installations and builds only. Keep a separate copy of the local tests when moving to another computer.

Final local verification completed on 2026-10-28 using Node 24.22.1:

| Check | Result |
|---|---|
| Complete backend regression suite | 352 passed, zero failed, one opt-in Electron case skipped in this run. Includes 56 audit security/integrity cases, 17 shared-client reliability/isolation cases and four queued-recurrence compatibility cases. |
| Real Electron integration, run separately | Passed. Verified live inbox/badge, dropdown dismissal, exact task dialog, board updates, preserved draft, theme changes, Escape handling, minimized delivery, native notification click handling and reconnect recovery. No renderer errors or runner errors. |
| Desktop regression suite | 43 passed, zero failed. |
| Web and desktop production builds | Both passed. Main chunks: web 657.90 kB; desktop 575.49 kB, reduced from the audited 4.55 MB desktop chunk. This measures bundle output, not startup performance. |
| Changed JavaScript/module syntax | 163 files checked, zero failures. JSX is covered by the builds and relevant tests. |
| Source hygiene and PM dependency scan | `git diff --check` passed. Only the three reserved `pm-sheet` slug entries remain in application source. |

The file migration regression uses a disposable replica-set database and mocked cloud storage. It verifies dry-run behavior, conversion recovery, embedded files, editor/history rewriting, idempotency and task/workspace boundaries. It does not verify a live Cloudinary conversion or CDN invalidation.

Follow-up for legacy attachment metadata: six parent-resolution tests and two database migration tests passed. They cover missing workspace/project/storage recovery, conflicting tenant/root-task references, orphan refusal, unchanged dry runs and zero migration writes when preflight is blocked. A first disposable database run hit a Windows `ENOBUFS` socket-resource error; the fresh database retry passed both integration cases. No application database or Cloudinary migration was run by the assistant.

Announcement classification follow-up: seven reference-resolution tests and three disposable-database tests passed (10 focused checks). Read-only inspection of configured application attachment metadata, parent existence and reverse references identified records requiring a data-retention decision; the local review report is separate from source control and is not a backup. No application database or Cloudinary writes were performed. An initial read-only usage query failed; the bounded query retry completed.

Explicit quarantine follow-up: 22 focused checks passed across reference validation, storage handling and disposable-database migration cases. Coverage includes read-only previews, complete original-document preservation, no expiry, cloud-retention protection, provider failure/retry, missing-storage proof, live-reference refusal, transactional rollback and unchanged ordinary file-copy/deletion behavior. The CLI disables both automatic index creation and automatic collection creation for read-only previews. Test files remain local-only.

Configured-database read-only quarantine preview on 2026-10-28: 164 records checked, 56 recoverable, 107 quarantine candidates, one verified non-project Announcement attachment and zero blockers. `apply` was false; migrated and quarantined counts were both zero. No provider conversion was attempted. The original records and cloud files are unchanged. The preview is evidence of metadata/reference readiness, not confirmation that Cloudinary conversion or production index creation has succeeded.

CLI visibility follow-up: startup/connection messages, preflight and apply counters, current attachment/stage and a 10-second waiting heartbeat now go to stderr; final JSON remains on stdout. MongoDB connection selection is bounded at 15 seconds and sockets/provider requests at 45 seconds. These limits apply to individual operations, not total migration duration. Already-running Node processes keep their loaded code; start no parallel migration to obtain the new logs. Twenty-five focused checks passed, including progress/heartbeat lifecycle, preview callbacks and existing preservation/retry cases. The assistant used read-only counts/process status to observe the operator's apply; it did not start or terminate that apply.

Cloudinary error-shape follow-up: the installed SDK's Admin API rejects ordinary HTTP errors inside `error`, alongside request options; upload transport failures can also be wrapped. Migration cloud requests now normalize both wrapped and direct errors before interpreting 404s. The CLI reports the operation, status/code and sanitized message without dumping request options or credentials. A read-only provider check for attachment `694268548628feb0ccb461b9` returned 404 for both its saved original and authenticated storage locations on 2026-10-28. This confirms that those locations are missing at inspection time; it does not establish when or why the bytes disappeared. On operator resume, quarantine can preserve that record as `missing_in_storage` only after repeating both checks. Twenty-one focused checks passed: 13 SDK/error/storage/progress checks (including real installed SDK code with intercepted HTTP responses) and eight disposable-database migration/quarantine checks; 55 unrelated integration cases were skipped. Syntax and diff checks passed. Tests remain local-only. No provider conversion or application database write was performed by the assistant.

Detailed local evidence is retained in `C:\Users\pc\.codex\visualizations\2026\10\27\01a17c48-e09b-7861-912b-bacf24040f27\audit-validation`: `remediation-backend-final.json`, `remediation-desktop-tests-node24-lts.log`, `remediation-electron-e2e-final.log`, both `remediation-*-build-node24-lts.log` files and `remediation-syntax-final.json`.

Production migrations, CDN invalidation, production Finance reconciliation, the hosted Linux CI job and full manual browser acceptance have not been executed. Follow the staged rollout above before deployment.

No current package advisory inventory was sent to an external audit service: automatic approval review rejected that disclosure during the audit. The parser fix was verified against the publisher's release and local fixtures. This does not establish that every dependency is advisory-free.

Publisher references: [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media), [Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1).

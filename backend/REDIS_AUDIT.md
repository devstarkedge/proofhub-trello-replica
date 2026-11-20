# Redis audit and validation — 2026-10-22

Redis is enabled only for exact `NODE_ENV=production`. Other environments
create no Redis clients, probes, reconnect timers or Redis error logs, even
when Redis URLs and socket-adapter flags are inherited.

## Audit and changes

| Area | Result |
| --- | --- |
| Configuration | `config/redis.js` validates the production URL and deadlines. Missing production `REDIS_URL` fails before startup. Legacy host/port settings cannot enable Redis. Errors exclude URLs and credentials. |
| Queues | Ten formerly eager BullMQ queues now use lazy queue facades. Production enqueue failures are explicit; chat delivery never switches to inline sending after an ambiguous production enqueue. Existing repeat-job identities are preserved. |
| Workers | All ten processors start once per process. Worker commands share the normal client; blocking reads retain dedicated sockets. Workspace context follows each job. |
| Development jobs | The same processors run in process with delayed jobs, cancellation, deduplication, retry/backoff, concurrency/limiter controls and repeat schedules. All maintenance/recovery registrations run. The obsolete separate attendance timer was removed. |
| Socket.IO | Development uses the built-in adapter. Production shares the publisher connection and owns one subscriber. Adapter command rejections are observed, including unsubscribe failures during outage shutdown. Reconnection emits the existing recovery event. |
| Rate limits | Production uses atomic Redis counters with workspace/team/public namespaces and TTLs, with explicit 503 responses on failure. Development keeps process-local counters. |
| Caching | The existing optional identity/membership LRU caches are production-only, workspace/user scoped and TTL bounded. Cache misses/errors read MongoDB; invalidation covers all of a user's workspace entries. No Redis application-data cache existed to migrate. |
| Sessions | Authentication is stateless JWT. There is no Redis-backed session store or express-session integration. |
| Lifecycle | Shared initialization, connection/command deadlines, capped reconnect backoff with jitter, throttled safe error logs, and bounded shutdown cover normal, blocking and subscriber clients. Chat queues participate in shutdown. |

## Expected connections per process

| Process/configuration | Redis connections |
| --- | ---: |
| Any nonproduction backend | 0 |
| Production backend, default adapter | 12 |
| Production backend, `SOCKET_REDIS_ADAPTER=false` | 11 |
| Production import-only helper that never initializes Redis | 0 |

The default 12 are **one normal command client + ten blocking worker sockets +
one socket subscriber**. Rate limits, queue producers, worker commands and
socket publishing reuse the normal client. No per-request clients are created.
Disabling the adapter explicitly limits socket delivery to one process.

## Validation results

- **122/122 tests passed** across the 30 new focused checks and 92 existing
  authorization, workspace isolation, project deletion, board authorization and
  attendance regression checks. HTTP suites required access to their local
  test servers outside the restricted network sandbox.
- After the final repeat-ID compatibility change, all five local queue tests
  passed again and the isolated production verification passed.
- `scripts/verifyLocalRuntime.mjs` started the real backend against a disposable
  MongoDB replica set, with a deliberately invalid Redis hostname. It verified
  ten workers, JWT login, authenticated reads, local sockets, a delayed activity
  written to MongoDB, immediate visibility of a suspended membership, a 429
  rate-limit response, successful graceful shutdown and no Redis/reconnect logs.
- `scripts/verifyRedis.mjs` used an isolated Docker Redis instance. `CLIENT LIST`
  confirmed 12 connections after repeated worker/adapter initialization. It
  verified cross-process socket broadcasts, shared workspace-isolated limits,
  TTL expiry, production job execution/context, and deduplication against an
  existing native BullMQ repeat schedule.
- Pausing Redis produced explicit rate-limit 503 responses and enqueue failures.
  Restarting Redis restored job execution. Shutdown while Redis was paused
  completed within the test deadline; after resuming Redis, only the verification
  CLI connection remained. Test containers were removed.
- JavaScript syntax checks and `git diff --check` passed.

## Operational limits and unverified scope

Local queues are memory-only and intended for one development process. A crash
can lose immediate jobs; startup recovers schedules persisted in MongoDB. Each
queue rejects new jobs after 10,000 retained/pending records instead of silently
dropping them. Production Redis needs appropriate persistence, backups, capacity
and `maxmemory-policy noeviction`.

The production auth LRU remains process-local. Invalidation on another process
can take up to its TTL to become visible. Readiness/mutation admission checks
use the Redis connection state; each queue/rate-limit operation also handles
its own failure. A disconnect can occur after a database write has committed.
Existing fire-and-forget delivery callers log failures, and timed-out enqueues
can have reached Redis already. There is no new transactional outbox or
exactly-once delivery guarantee; retries should reuse deterministic job IDs.

No live deployment, hosted Redis/TLS/ACL/failover configuration, external email,
Slack, ChatApp delivery, browser UI workflow, or every business-specific job
handler was verified end to end. The real local delayed-job check used the
activity processor; scheduling/retries/repeat behavior also has focused tests.
Actual application `.env` files and existing Markdown files were preserved.

See the repository README and `backend/.env.example` for setup and commands to
reproduce the isolated checks.

## Attendance, Sales and Finance display reads — 2026-11-20

This section describes the current display-cache implementation; the dated
October snapshot above does not describe these newer application-data caches.
The existing Redis `cacheEnabled` configuration and shared command connection
are reused. No additional connection, service, migration or paid dependency is
required. MongoDB remains authoritative and read caches fall back on outage.

### Ownership and freshness

- `services/versionedReadCache.js` extracts the existing Tracking implementation
  into a shared factory. Tracking retains its public functions and namespace.
  Attendance, Sales and Finance have independent revision/epoch namespaces.
- Redis values are bounded to 512 KiB, payload lookups coalesce locally, and
  command deadlines retain the existing 250 ms source-fallback behavior.
  Redis revisions are checked on every read; no wildcard scans or cache flushes
  are added. Each factory retains at most 64 pending coalescing entries.
- Attendance reports/history use 15-second read caches; management JSON reads,
  Sales reads and Finance source contexts use at most 30 seconds.
- The shared browser/renderer owner uses the existing scoped-read cache: actor,
  token revocation version, workspace, API base, endpoint and normalized filters
  identify a read. Each module retains at most 24 entries of at most 512 KiB
  each. Session resets, source events and mutation submission/completion clear
  affected module reads. Permission/auth reads, active attendance state,
  checkout previews, operation receipts and exports retain their existing paths.
- Closing one consumer does not cancel another consumer's shared request.
  Closing the final consumer aborts an obsolete GET. Failed reads are not kept,
  and an invalidated in-flight response cannot become the confirmed result.
  Explicit refresh bypasses both client and Redis results via `Cache-Control`.

### Authorization and invalidation

All existing route/record permission checks remain authoritative. Sales JSON
caches run after module and operation guards. Finance rebuilds its permitted
audience before every source-context hit. Attendance resolves membership,
department/report scope and Tracking's access fingerprint before cached team
data, including expiring Tracking overrides. Display caches never decide a
check-in/out, approval, financial write or other state transition.

Source-model hooks invalidate only dependent module revisions. Membership,
override, role, department, user identity and workspace changes also invalidate
dependent reads. Transactional writes collect invalidations and apply one
revision change per domain/workspace only after a successful commit. Abort
discards pending invalidations; an unknown commit result retains them until
commit retry succeeds. Scoped bulk writes and insertMany are covered, including
possible partial unordered bulk writes. Delivery leases, retry metadata,
evidence-only fences and attendance activity samples do not invalidate report
caches. Direct raw collection writes bypass Mongoose hooks and require explicit
invalidation by their caller; TTLs still bound display staleness.

### Module changes

- Attendance resolves its permission resource once instead of ten independent
  action lookups. The authorized roster and period summary can be reused across
  table pages; month/day drawers and personal history reuse scoped reads.
  Cached reports preserve their original `asOf`, and cached break windows are
  restored to dates before use in MongoDB calculations. Exports remain fresh.
- Sales defers eight hidden dropdown reads until filters/forms need them,
  removes the name-deep-link double fetch, shares modal/reference reads, and
  rejects obsolete row responses. Shallow store selectors avoid unrelated
  state updates rerendering the page/table/form. Bootstrap has five explicit
  read calls instead of thirteen; this is a code-path count, not a browser HAR.
- Finance shares compact source context across summary, users, projects,
  contribution and weekly calculations while keeping their output/filter
  semantics. Maps/Sets are restored separately for each consumer. Report pages
  receive debounced invalidations through the existing layout-owned socket
  room; old filter/month responses are canceled or ignored.
- Both renderers use the same shared client implementation. Read responses
  expose `X-Read-Cache` and `Server-Timing` through the existing CORS setup.

### Observed collection calls

An isolated MongoDB replica set with fixture data and an in-memory Redis test
double produced these Mongoose collection-method counts:

| Scenario | Cold | Warm |
| --- | ---: | ---: |
| Finance source context reused by a second report | 37 | 6 |
| Team Attendance period reused on the next table page | 42 | 11 |
| Sales dropdown JSON handler | 3 | 0 |

Finance aggregation calls were 9 cold and 0 warm. These are collection-level
traces, not wire-command/getMore counts or full HTTP middleware totals. Required
fresh authorization/audience reads remain. The fixture verifies committed
financial/attendance writes invalidate warm values and a different workspace
cannot receive the cached dropdown data. Hosted Redis latency/hit rate, actual
browser/Electron page timings, renderer memory and production query plans have
not been measured.

### Verification of the November changes

- Web and Electron renderer production builds passed sequentially with the
  repository's Vite configuration. The earlier parallel build attempt exhausted
  local machine memory; it was not counted as a passing check.
- All 29 changed/new renderer file pairs match between web and desktop. The
  affected client files introduce no ESLint diagnostics compared with HEAD.
- The final focused backend run recorded **141 passed, 1 failed, 2 skipped**
  across cache behavior/performance, permission reads, team reports, workspace
  guards, existing security remediation and checkout logging suites.
- The failed own-task calendar assertion was reproduced with original
  workspace/tracking cache hooks and the new invalidation plugin disabled.
  The two excluded tests were also reproduced against original behavior:
  future calendar-day validation, and a legacy checkout's async event assertion.
  These three existing failures were not fixed by changing business/access or
  event policies in this performance change.
- **22 shared client/session checks passed**, including concurrent modal reuse,
  final-consumer cancellation, independent DTOs, mutation races, explicit refresh,
  normalized filters, workspace changes and cache failure recovery.
- Transaction commit/abort/unknown-result tests verify deferred invalidation;
  collection traces use a disposable MongoDB replica set and a Redis test double.
  No production database, Redis load test, migration or deployment was run.
- Tests and execution fixtures remain local under the repository's existing
  ignore policy. Detailed final backend results are in
  `backend/work/business-read-validation.json`; baseline comparison results are
  in `backend/work/calendar-baseline.json` and
  `backend/work/checkout-baseline.json`.

Commands used include `node --test shared/clientReadSafety.test.mjs
shared/businessReadClient.test.mjs`, focused `vitest run` selections in
`backend`, `vite build --logLevel error` in both renderers, syntax checks and
`git diff HEAD --check`. No end-to-end browser/Electron UI or production
performance certification is implied by these checks.

### Module-specific policy refinement

`shared/moduleReadPolicies.mjs` defines separate domain policies; the shared
transport only performs keying, deduplication, cancellation and cache storage.

| Module | Reusable display data | Authoritative reads / invalidation |
| --- | --- | --- |
| Sales | Rows, activity, preferences and saved tabs: 15s; dropdowns/columns: 30s | Permission/lock/export reads bypass results. Sales edits invalidate Sales. Suggestion POSTs are read-only under the Sales service's mutation predicate. |
| Finance | Report source context: 30s; custom page display configuration: 15s | Financial entries/project billing/milestones invalidate reports. Active WorkSession/TrackingPolicy changes alone do not invalidate financial context; checkout's posted Card time entries do. |
| Attendance | Reports/history: 15s; personal WFH/regularization lists: 10s client reuse; guarded management handlers: 30s server reuse | Active session, checkout preview, operation receipts, session details and approval queues always reach their existing server paths. Tracking/leave/calendar changes invalidate Attendance; milestones do not. |

Project/task assignment and workspace/role/member changes retain cross-module
invalidation where they actually affect visibility. Domain cache instances,
revision namespaces and data remain separate; sharing the implementation does
not merge business rules or payloads. Module-boundary unit tests cover live
Attendance reads, Finance reuse during active tracking, and Sales/Attendance
event isolation. This refinement has no measured production latency result.

Refinement verification: 35 focused backend/cache/permission tests, 25 shared
client/session tests and 3 disposable-database integration tests passed. The
integration rerun observed collection-method counts of Finance 25/8,
Attendance 44/12 and Sales 1/0 (cold/warm). Counts include fixture/model
initialization activity and vary between runs; they are not a controlled
before/after comparison with the earlier table. Finance again performed zero
source aggregations on the warm report read. Redis was simulated, and live
browser/Electron latency was not measured.
Both web and desktop renderer production builds passed after this refinement;
the builds ran sequentially. Syntax and diff whitespace checks also passed.

### Resource-specific invalidation and bounded freshness — November 20

This section supersedes the TTLs in the module-specific policy table above.
The existing versioned cache now has separate resource namespaces within each
module. It continues to use the shared Redis connection; resource caches share
one pair of connection lifecycle listeners.

| Resource | Redis TTL | Invalidation dependencies |
| --- | --- | --- |
| Sales dropdowns / columns | 120s | SalesDropdownOption / SalesColumn; access and workspace changes |
| Sales rows / activity / names | 30s | SalesRow / SalesActivityLog; identity and access changes |
| Sales preferences / suggestions | 30s | SalesUserPreference; client row mutations also clear preferences |
| Sales saved tabs | 30s | SalesTab writes, including persisted unread counters; permission changes |
| Finance report source context | 60s | Posted task time, project billing, milestones, audience/permission changes |
| Attendance finalized history | 120s | Attendance day/session/corrections, leave/calendar, identity/access changes |
| Attendance historical day/month reports | Up to 120s | Only fully finalized, inactive snapshots; tracked-work changes still invalidate reports |
| Attendance live/mixed summaries and roster | 15s | Attendance, tracking, leave/calendar and relevant assignment changes |
| Attendance guarded management reads | 30s | Configuration/assignment writes and access changes |

Finance page display configuration remains separate from calculation context;
per-page server authorization is still performed on its original path. An edit
to FinancePage no longer evicts report aggregates. WorkSession/TrackingPolicy
and task assignment changes invalidate Attendance work reports, without
evicting persisted day history or management reference values. Sales row edits
leave dropdown/column reads warm. Sales watch-delivery metadata is not a source
for the tab DTO; persisted SalesTab changes still invalidate saved tabs.

Finality is based on persisted `isFinalized`, not just an old date. Active,
missing-checkout and unfinalized days retain the short TTL. Team day detail
with pending corrections stays short; historical month/day eligibility also
requires a period before the workspace's current day. Empty/mixed month data
is conservatively kept short. Corrections still invalidate completed history.

Client reuse remains 10–30s depending on resource. `X-Read-Fresh-For` conveys
the backend's remaining lifetime; the client subtracts request elapsed time
and clamps its deadline once on arrival. Redis and client TTLs therefore do
not add together. Coalesced requests each receive the same remaining deadline.
The redundant hook-local Sales suggestion cache was removed; its public hook
API and static fallback remain, backed by the shared scoped client cache.

Revision initialization now uses a random SET NX token when the revision key
is missing, preventing old zero-version values from reappearing after metadata
eviction. Transaction changes merge their resource dependencies and invalidate
only after successful commit. Stats are grouped by resource and include cold,
expired, explicit-refresh, unavailable, read-error, oversized and superseded
reasons alongside hit/miss/coalescing totals. Existing role/workspace guards,
checkout/session decisions, approval queues, durable writes and worker cadence
remain on their authoritative paths.

Final focused checks: 49 backend/cache/permission checks passed (two benchmark
cases intentionally excluded), 31 shared client/session checks passed, and 11
disposable-database/workspace guard checks passed. The isolated database run
observed Finance source aggregates 9 cold / 0 warm, Sales reference queries
0 after a row edit, and fresh history after a correction. Collection-method
totals were Finance 23/5, Attendance 31/14 and Sales 1/0 cold/warm; these include
fixture initialization and fresh authorization, and are not controlled
production before/after measurements. Redis was an in-memory test double.
Hosted Redis behavior and live browser/Electron timings remain unmeasured.
The changed Sales hook/API files introduced no ESLint diagnostics relative
to HEAD. No original repository files were deleted in this refinement.
Both web and Electron renderer production builds passed sequentially after
the final resource split. All 29 affected renderer file pairs match; backend
and shared JavaScript syntax checks and diff whitespace checks passed. These
builds do not establish live browser or native Electron runtime behavior.

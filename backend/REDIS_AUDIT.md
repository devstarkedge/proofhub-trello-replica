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

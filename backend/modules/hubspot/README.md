# FlowTask to HubSpot Contacts

This integration uses the pinned HubSpot **2026-09** CRM Contacts and account-info
APIs. It sends `email`, `firstname`, `lastname`, `phone`, project `technology`, project client details, and an optional workspace contact owner from
eligible, non-deleted `Hired Client` Boards. HubSpot never writes client data
back to FlowTask. There are no inbound webhooks or manual sync/retry endpoints.

## Deployment

1. Use a MongoDB replica set (or Atlas); configuration approval, credential
   activation, and privileged audit writes use MongoDB transactions. MongoDB
   unique indexes are mandatory and checked before configuration and sync.
2. Production uses FlowTask's existing BullMQ runtime and requires `REDIS_URL`.
   Prefer TLS (`rediss://`). The web process starts four HubSpot workers and
   a five-second durable-intent dispatcher. All instances share MongoDB locks
   and account cooldowns. Development uses the existing local queue; unfinished
   work still survives restarts in MongoDB and is rediscovered at startup.
3. Supply `HUBSPOT_ENCRYPTION_KEY_VERSION` (for example `v1`) and
   `HUBSPOT_ENCRYPTION_KEYS` as a JSON object of key versions to base64-encoded,
   random 32-byte keys. Generate a key with Node's `crypto.randomBytes(32)`.
   Inject these environment values from your deployment secret manager. Do not
   store them in MongoDB, source control, browser storage, or application logs.
   This implementation uses direct AES-256-GCM with separately managed keys;
   it does not claim to implement a cloud KMS envelope-encryption service.
4. Run `npm run migrate` from the repository root before starting the release.
   The `hubspot_workspace_sync` migration creates additive indexes and initializes
   source intent in bounded cursor reads. It is idempotent and contacts no remote
   accounts. The Render configuration includes the migration as a pre-deploy step.
5. Serve FlowTask over HTTPS. Allow outbound TLS only to `api.hubapi.com`.
   HubSpot calls use a fixed server-controlled host, ten-second timeout, bounded
   bodies, and no redirects. Preserve the existing Bearer-authenticated session
   and allowed-origin CORS policy. The integration does not use cookie auth.

Existing workspaces remain disconnected, with sync disabled, until an active
workspace Owner/Admin configures and intentionally enables their own connection.
No production database or live HubSpot account is changed by the test suite.

## Setup and authentication

Open Workspace Settings → Configs. Create a HubSpot Service Key with only
`crm.objects.contacts.read` and `crm.objects.contacts.write`. FlowTask uses the
Service Key as a Bearer token. No Client ID/Secret or HubSpot login is required.
Verify the current FlowTask password before the credential editor opens. Approvals
expire after three minutes, bind to user/workspace/session/action/configuration
version, and are consumed atomically once. Password verification is rate limited.
FlowTask currently requires password-based accounts. A missing password fails
closed; any future SSO/passwordless path must implement equivalent step-up before
using these APIs rather than exempting that identity from verification.

Validation reads Contacts and account information without creating a test contact.
The account's Portal ID must be verifiable to save a connection. If HubSpot's
non-destructive token inspection is supported, both required scopes are checked;
otherwise write capability is explicitly shown as **unverified**. A denied account
identity lookup blocks configuration rather than trusting a user-entered ID.

The editor prefills the saved connection name and Contact Owner from the verified
configuration. The saved Service Key appears as a masked placeholder: leaving it
blank retains the existing encrypted credential, while entering a new key replaces
it. Both validation and saving can use the retained key on the backend; its original
value is never returned to the browser. Initial setup still requires a key.

Saved credentials are always masked. AES-GCM authenticates ciphertext against
workspace ID, Portal ID, and encryption key version. Replacement validates first,
then atomically stores the new envelope, consumes approval, increments configuration
version, and appends an audit event. API responses and operational logs exclude
credentials and raw provider errors. These API requests opt out of FlowTask's
persisted offline mutation queue; passwords and keys stay in short-lived form state.

Replacing a key for the same verified Portal ID retains mappings. To connect a
different account, first disable sync, verify again, and explicitly confirm the
reconnection. Mappings are namespaced by Portal ID and are never transferred.
Worker and configuration changes share a workspace lease. If a request is already
in flight, configuration changes return a safe busy response; retry the change
after the current operation completes. A successful disable guarantees no later
write can start under the disabled version. An already accepted HubSpot request
cannot be recalled. Lease ownership and source/config state are checked before
each outgoing request. No database transaction stays open during HTTP calls.

## Identity and source lifecycle

FlowTask's current client fields are embedded per Board, not references to a
separate Client collection. Exact canonical details initially share a stable
workspace-local client key. Once established, the key survives name/email/phone
changes. New projects with an existing client's exact current mapped details can
reuse that client key. Two records with the same email but different details are
blocked instead of inferring that they represent the same person. If multiple
eligible projects share a client key, align their client details before syncing
changes. The model has no separate identity with which to distinguish two people
whose embedded details are completely identical.

Board save, individual query updates, and insertMany atomically persist source
data and an embedded sync intent. Changing canonical values or eligibility gives
the source a fresh version and retry budget. Unrelated changes, normalization-only
changes, and sync metadata do not. Bulk client-field changes are rejected; bulk
soft-delete is supported. Future raw collection/bulkWrite client mutations must
preserve this outbox invariant, because they bypass Mongoose middleware.

The dispatcher scans only enabled connections and due pending/retrying versions,
then enqueues IDs/version references without credentials or client payloads.
Enable/re-enable performs paginated backfill of 100 eligible Boards per pass.
Successful unchanged versions and exhausted unchanged versions remain stopped.
The worker independently loads its workspace, active connection, Board, and current
canonical source. It refuses malformed, foreign, stale, disabled, or ineligible
work before writes. Changing away from Hired Client cancels work without touching
existing HubSpot contacts.

Name splitting normalizes whitespace, using the last word for lastname and all
preceding words for firstname; a single name has an empty lastname. This is a
deterministic convention, not a cultural naming inference. Email is trimmed,
lowercased, and validated with FlowTask's shared validator. Phone remains a string
with its leading `+`; the existing input/storage sanitization stays in place.
Empty non-identity fields are sent explicitly to clear old HubSpot values.

Matching order is saved contact ID, exact normalized email, then create. Saved IDs
are fetched and verified; missing/archived mappings block automatic replacement.
Email changes check remote ownership before updating the original ID. Only changed
properties are patched. A global, unique per-Portal identity-claim table prevents
two FlowTask clients/workspaces from owning the same email or remote contact ID.
Claims are conservative and retained, including old email aliases. They are
internal coordination metadata, never exposed through cross-workspace APIs.

Each workspace and portal has a database lease. Portal requests are paced to at
most four per second, shared across FlowTask workers, and honor Retry-After. HubSpot
changes made by independent external systems cannot participate in FlowTask's
locks; remote conflict responses always enter reconciliation/safety handling.

Before create, an uncertainty marker is durably written. After a timeout/crash,
the worker reconciles the attempted email before doing anything else. If no unique
contact can be recovered, it blocks rather than guessing or blindly creating
again. Definitive rejected requests (such as 429 or 403) clear the uncertainty
marker. There is intentionally no automatic unsafe replay or manual retry API.

## Retries, status, and operations

The initial attempt plus exactly three retries is persisted per source version.
Retries occur at least 120 seconds after failure (nominally minute 2, 4, and 6),
plus dispatcher and queue latency. A longer provider Retry-After takes precedence
and pauses all work for that Portal. Attempts are reserved before HTTP so a crash
cannot reset the budget. Disabled work consumes no attempt. Worker restarts,
queue replay, unrelated edits, same-account key replacement, and re-enabling do
not reset exhausted source versions. Relevant client changes or newly eligible
versions begin a fresh cycle. Switching to a different verified Portal creates
a separate account namespace and initial sync cycle.

Record statuses are `pending`, `retrying`, `synced`, `failed`, `blocked`, and
`not_eligible`, stored under the Board's internal `hubspotSync` field. Mappings
retain contact IDs, successful hashes/timestamps, and creation uncertainty.
Connection metadata includes validation, config version, last success, and safe
last-error summaries. The admin-only `/api/workspace-configs/hubspot/audit` endpoint
returns the latest 50 privileged/sync events without keys or contact payloads.
Use scoped operational queries for investigation. Do not modify source versions
or failed retry counts to replay exhausted records.

For an uncertain create, an operator should inspect the connected test/production
portal under the organization's normal access process and resolve the identity
cause. Retained email/contact ownership claims must not be deleted casually: they
protect against overwriting another client's contact, including shared portals.

## Workspace modules

Configs reuses existing Leave and Attendance flags and setup services. Attendance
depends on Leave's Work Calendar. Attendance cannot be disabled with active
attendance sessions or enabled Time Tracking. Disable Time Tracking in General
settings and close sessions first. Leave/Attendance data is retained when disabled.
Sales and Finance have per-workspace availability flags, defaulting to enabled to
preserve existing behavior. Module availability gates backend route groups and
frontend navigation/routes in addition to existing per-user permissions. Projects
remains the core module. Time Tracking retains its dedicated policy/activation UI.

## Encryption key rotation

Add a new random key version to the secret-manager JSON while retaining all old
versions. Deploy with the new `HUBSPOT_ENCRYPTION_KEY_VERSION`. Run
`npm run hubspot:rotate-encryption` from `backend`. The script re-encrypts each
envelope under a workspace lease and prints only a count. Re-run safely if busy.
Verify all stored envelopes use the current version before retiring old keys.
Preserve old keys needed for encrypted database backups according to your backup
retention policy. This does not rotate the HubSpot Service Key itself; replace that
through the verified Configs flow.

## Validation

Run `npm run test:hubspot` from `backend`; it uses the existing Vitest framework,
a disposable local MongoDB replica set, mocked HubSpot transport, and the installed
Electron Chromium runtime for the real Configs UI. The browser fixture exercises
configuration, password verification, encryption notice, connection validation,
enable/disable/re-enable, automatic worker create/update, contact ID reuse, fixed
mapping display, and unauthorized route/tab access. Project source changes in this
fixture are issued through isolated test endpoints, not the project's creation UI.
Other integration cases cover tenant tampering, scopes, stale jobs, concurrency,
account replacement, initial backfill, exact retry exhaustion, timeouts, duplicate
ownership, and source-version resets. Run the frontend production build separately.

Live HubSpot validation requires an authorized non-production account and Service
Key; it is deliberately separate from automated tests. No real credentials are
included. Browser tests do not establish live HubSpot connectivity or production
deployment health.

API references: [Service Keys](https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations),
[Contacts API](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide).


## Additional contact fields (2026-10-28)

Run the new hubspot_contact_fields migration before deploying the updated worker.
It baselines source signatures without resetting failed retry budgets or changing
previously synced contacts. The new fields apply on the next eligible sync.

In HubSpot create an editable Contact property named technology, with type
Enumeration and field type Multiple checkboxes. FlowTask resolves its existing
workspace technology option IDs into values, using an exact internal-value match
first and otherwise a unique, case-insensitive label match. Unknown/hidden or
ambiguous options block the write. Values are sorted, deduplicated, semicolon
separated, and sent as an empty string when the combined selection is empty.
Eligible projects sharing a client contribute a union of technologies. Conflicting
client details block writes instead of choosing a winner.

Marketing Contact remains a local FlowTask field. It is not sent to HubSpot,
read from HubSpot, included in change detection or used for shared-client conflicts.
Changing only that checkbox neither queues sync nor resets failed retry budgets.
There is no marketing workflow, custom request property or confirmation polling.

Contact Owner is an optional positive-integer STRING on the existing workspace
configuration; do not convert Owner IDs to JavaScript numbers. Setup/replacement
requires the existing password step-up. The Owners API verifies ID and archived
state when crm.objects.owners.read is available; a 403 records unverified status
and Configs explains how to enable that permission in HubSpot. Verified owners show
their HubSpot first/last name with a green check. A confirmed MISSING_SCOPES response
shows `Missing scope - crm.objects.owners.read` in red; other lookup failures do not
claim a missing scope or display a verified check. Owner names and lookup status
are refreshed on Configs with a five-minute metadata cache, including existing
connections. This cache does not change the configuration version, update timestamp,
credentials or sync state. Concurrent replacements reject stale metadata updates.
Validate connection
checks the current owner field as well as Contacts access, without modifying the
saved configuration. After granting the scope, validate and save the configuration
to persist the new verified status. Reuse the saved key unless HubSpot issues a
replacement. A definite missing/archived owner blocks saving
or syncing. Owners are checked again during sync. This additional scope is only
needed for owner verification. Missing owner configuration omits hubspot_owner_id
entirely and preserves remote ownership. Changing the configuration does not
resync unchanged old contacts; the latest owner applies on their next eligible
source edit. A different portal never inherits an omitted old owner setting.

Configs lists current project sync failures with `Project - [name]` and the safe
error message for each project. It reads names from the active workspace only,
excludes deleted/ineligible projects and failures from other HubSpot portals, and
paginates 25 projects at a time. Corrected projects leave the list when their
source intent changes. A successful sync of another project does not hide remaining
project failures. Client details and credentials are not included in this response.

After upgrading, run `npm run migrate` from the repository root. The
`hubspot_remove_marketing_sync` migration removes the retired field from persisted
change signatures and releases obsolete marketing-only blocks. It preserves
exhausted failures, attempt counts, contact mappings and local client data.

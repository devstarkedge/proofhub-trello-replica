# FlowTask Windows desktop updates

The first updater-enabled version is **1.0.2**. Application identity, NSIS scope,
install location selection and the existing user-data directory are unchanged.
The public feed is `devstarkedge/proofhub-trello-replica` on GitHub. Installed
applications use the generated public `app-update.yml`, without an access token.

## Existing installations

The public v1.0.1 release has an installer, blockmap and latest.yml. Its installer
was matched by SHA-256 and its embedded app.asar was inspected: there is no
updater dependency or updater startup logic. Its installer SHA-256 is:
`cac952aba1a21efcfc24dc410092ff5700b279552fb7b9fc58f79d5716dd4a41`.
Those users must install the first updater-enabled installer once, over their
existing installation. Do not uninstall or clear application data. Downloads,
themes, sessions and encrypted tracking queues retain their existing locations.
Subsequent stable releases can be detected and downloaded automatically.

## Build without publishing

Set the existing `VITE_BACKEND_PRODUCTION` in desktopApp/.env. From desktopApp:

```powershell
npm ci
npm run build:win
```

This produces `release/FlowTask-Setup-VERSION.exe`, its `.blockmap`, and
`release/latest.yml`. `build:win`, `build:mac` and `pack` remain local-only.
Do not set VITE_GH_TOKEN or any other VITE-prefixed secret.

## Publish a future stable version

First verify the local Windows build and the updater tests. Bump the version in
desktopApp/package.json and package-lock.json together. Commit and push the
desktop release changes before publishing; the release tag points to that commit.

```powershell
# In desktopApp; skip this bump for the already prepared 1.0.2 migration release.
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release FlowTask desktop VERSION"
git push
$env:GH_TOKEN = "<token with Contents write access to the release repository>"
npm run release:win
Remove-Item Env:GH_TOKEN
```

For the initial migration, commit all updater source changes and both manifests
before running the publishing command. GH_TOKEN is only consumed by the
developer-side publisher; it is not read by the renderer or packaged into the app.

The publisher first builds locally, validates latest.yml and the installer's
SHA-512, and claims the unique `vVERSION` Git ref. It creates one draft release,
uploads the installer and blockmap followed by latest.yml, verifies every asset's
SHA-256 and size using GitHub metadata, and publishes that same release as stable.
It refuses to overwrite a published version or create another release if duplicate
drafts already exist. It resumes a single interrupted draft only when existing
assets have exactly matching digests. Build once and retain the release artifacts
if resuming an upload; rebuilding a signed installer can change its bytes. Retry
with `npm run release:win -- --resume` to reuse those verified existing artifacts.
The saved `.publish-VERSION.json` provenance must match the committed source and
all retained artifact digests. Editing source during a release build also stops
publication before any upload.

If publishing stops after claiming a Git tag but before creating its draft,
create one draft in GitHub for that existing tag, then retry. If duplicate drafts
already exist, consolidate/review them in GitHub first. The script deliberately
does not delete releases or replace conflicting assets. An interrupted local
publisher may leave `release/.publish-VERSION.lock`; remove only that lock after
confirming its recorded process is no longer running.

## Runtime behavior and safe installation

- Windows packaged builds check after a 10-second startup delay and every four
  hours. Development and smoke-test processes never check the production feed.
- The profile menu exposes Check for Updates. The update-ready card offers
  Restart to Update, Later (install when idle), and Cancel for a pending request.
- Stable/newer/compatible version selection, cached-download verification,
  checksums, differential download and Windows signature validation (when a
  signing publisher is configured) stay delegated to pinned electron-updater.
- Download completion never closes the application. Restart to Update checks
  native tracking, live server attendance/work state, screenshot processing,
  all encrypted queue directories, in-flight renderer writes, uncertain session
  operations, pending preferences and locally persisted sales drafts.
- A short main-process write gate plus a renderer freeze prevents new UI writes
  during final restart checks. IPC is restricted to the main renderer/frame and
  validated origin. No token, workspace identity or screenshot content is sent
  over updater status IPC.
- Restart to Update saves an activity-only final checkpoint, then installs and
  reopens while preserving the same server-owned attendance/work session. Durable
  screenshots stay in their encrypted user/workspace queues and retry after
  reopen. Pending activity checkpoints that cannot be saved keep the app open.
- Later requests idle-only installation: active attendance or work (including
  paused work), pending uploads, and unsaved changes defer installation. It retries
  every 15 seconds without freezing the renderer. Cancel clears this request;
  download completion alone never schedules a restart. The waiting card explains
  the requested behavior and any current blocker.
- Immediately before installation, repeat the native/server, renderer and request
  checks under a native hold. Already-started heartbeats, captures and uploads
  settle before verification, so periodic synchronization cannot starve restart.
  New UI writes are briefly gated; Socket.IO polling stays connected. A newly
  active session defers idle-only installation. Dirty card editors and uncertain
  session operations defer both modes. Installer/preparation errors release the hold, restore
  tracking, retain the update and require an explicit retry. Scheduled restart
  requests are in-memory only and are cleared when the process exits.
- Safe restart uses the existing durable tracking shutdown/device-release path,
  then installs and reopens. It never checks out the user or closes a work session
  on the server. Normal unsafe exit retains the downloaded update and uses the
  pre-existing normal-exit checkpoint flow without installing it.
- Pending captures from another workspace/profile block idle-only installation.
  Explicit restart preserves them in place. Nothing is silently deleted.
- Monitoring timeouts retry automatically with bounded backoff (1 to 15 seconds),
  alongside normal heartbeats and online/resume events. Successful authorization
  clears the error in pushed native status; the renderer refreshes stale server
  diagnostics immediately, clearing Needs attention once recovery is verified.
  Revocation, consent and permission requirements remain authoritative.
- From 1.0.6, heartbeat requests run independently from local sampling/capture.
  A slow network request cannot monopolize the capture lock. Modern backends
  resolve the authenticated user's current work in the heartbeat itself; older
  backends retain the status-read compatibility path. Heartbeats have a bounded
  30-second timeout and still cannot authorize collection past their capture lease.
- The heartbeat supplies a response timestamp after its database work. Desktop
  anchor mapping uses that timestamp, preserves the screenshot deadline on anchor
  renewal, and never starts a new window before already-recorded evidence ends.
  Permanent interval conflicts are retained locally and skip automatic retry
  slots so valid new captures can continue. Manual recovery remains available.
- Deploy the backend changes with the desktop update: authenticated heartbeat,
  interval and screenshot-delivery traffic uses a bounded per-user/workspace
  fallback limiter during Redis outages. Device ownership, consent and leases
  remain checked by the normal handlers; other business writes still fail closed.
- Failed downloads retry twice with backoff; the periodic/manual checks can retry
  later. Generic updater diagnostics rotate in userData/updater.log; headers,
  tokens and signed download URLs are not logged.

## Signing and validation boundaries

The existing project disables Windows executable signing (`signExecutable:false`).
SHA-512 integrity and HTTPS work for this unsigned migration, but they do not
replace verified publisher identity. For an enterprise signed release, configure
a trusted Windows signing certificate/identity using electron-builder's signing
environment and enable signing; keep the publisher identity consistent on later
releases. This implementation does not disable certificate validation or the
updater's signature verifier. No signing secrets are committed.

Windows NSIS is the supported automatic-install target. macOS retains the
existing manual DMG workflow; automatic macOS updates additionally require a
signed/notarized app and a ZIP update artifact.

Automated lifecycle, IPC, release-publishing and native tracking tests do not
establish a live installed-app upgrade. Before calling a production rollout
verified, use a disposable Windows VM: manually install 1.0.2, authenticate and
check theme/data persistence, publish a newer stable updater-enabled version,
observe background progress, confirm Later waits for active attendance/uploads,
confirm explicit restart checkpoints activity and resumes the same server work
session, and confirm the new version and preserved data after reopening. Also
interrupt/recover connectivity and check badge removal without page refresh.
Never perform this test on an actively monitored
workstation. Publishing and this installed-to-installed upgrade need separate
execution; no production release is uploaded merely by implementing this code.

The running updater belongs to the currently installed executable. Downloading
1.0.5 does not hot-replace updater logic in an older running main process. If an
older version refuses restart, finish attendance/work and use a normal safe exit,
or install the new setup over the existing installation after work finishes.
Preserve the existing user-data directory; do not uninstall first.

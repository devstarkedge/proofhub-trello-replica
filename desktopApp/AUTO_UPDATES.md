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
- The profile menu exposes Check for Updates. Progress and an update-ready card
  use the existing theme; Later dismisses the card without discarding the update.
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
- Active attendance or work, including paused work, blocks installation. Clicking
  Restart to Update requests a restart once safe; it retries every 15 seconds
  until attendance/work and pending uploads/changes finish. Readiness checks run
  before the renderer freeze and network gate, so waiting never prevents checkout,
  work actions or upload recovery. The card and profile menu show the waiting
  state. Cancel restart/Later cancels this request and retains the downloaded
  update. Download completion alone never schedules a restart.
- Immediately before installation, repeat the native/server, renderer and request
  checks under the existing hold. A newly active session or pending write defers
  installation again. Installer/preparation errors release the hold, restore
  tracking, retain the update and require an explicit retry. Scheduled restart
  requests are in-memory only and are cleared when the process exits.
- Safe restart uses the existing durable tracking shutdown/device-release path,
  then installs and reopens. It never checks out the user or closes a work session
  on the server. Normal unsafe exit retains the downloaded update and uses the
  pre-existing normal-exit checkpoint flow without installing it.
- Pending captures from another workspace/profile also block installation until
  that profile's normal upload recovery drains them. Nothing is silently deleted.
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
observe background progress, confirm active attendance and pending uploads defer
restart, finish them normally, install safely, and confirm the new version and
preserved data after reopening. Never perform this test on an actively monitored
workstation. Publishing and this installed-to-installed upgrade need separate
execution; no production release is uploaded merely by implementing this code.

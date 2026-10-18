---
title: "Updates"
group: start
order: 10
summary: "How the IDE detects, downloads and installs a new version. Publishing a release has no manual step: the version is bumped with npm run up and the IDE detects it on its own."
---
# Updates

How the IDE detects, downloads and installs a new version. Publishing a release
has no manual step: the version is bumped with `npm run up` and the IDE detects
it on its own.

## Flow

The journey of a release:

```
npm run up ──► tag vX.Y.Z ──► release.yml ──► GitHub Release (notes = changelog)
                                   │
                                   └──► Supabase `releases` (row)
                                             │
                              Realtime (WebSocket, no polling)
                                             ▼
                                          IDE ──► notification + download
```

1. **`npm run up`** (on a clean `master`) computes the next odometer version,
   updates `package.json` + `package-lock.json`, commits, creates the `vX.Y.Z`
   tag and pushes it.
2. The tag triggers `.github/workflows/release.yml`: it packages Linux (AppImage,
   deb, tar.gz) and Windows (nsis), creates the GitHub Release and records the row
   in Supabase.
3. The IDE receives the row via **Supabase Realtime** and notifies. If the app was
   closed, it does **one** read at startup (not polling).
4. `electron-updater` downloads the artifact and `quitAndInstall()` restarts the
   app with the new version.

## Pieces

- **Backend**: `public.releases` table (`docs/backend/0019_releases.sql`), public
  read, inside `supabase_realtime`.
- **Workflow**: reads `docs/changelog/changelog-<version>.md` for the release
  notes and inserts it into Supabase (upsert by tag).
- **Main**: `src/main/app-updates.ts` (read + Realtime) and
  `src/main/auto-updater.ts` (electron-updater).
- **Renderer**: `src/renderer/src/services/updates` (state) and
  `features/updates/UpdatesBridge.tsx` (notifications).
- **UI**: Settings → About (`Check for updates`) and the welcome announcement
  (with a dot in **Announcements**).

## Setup (one time only)

1. Apply `docs/backend/0019_releases.sql` in Supabase.
2. Load the repo secret:

   ```bash
   gh secret set SUPABASE_SERVICE_ROLE_KEY   # Project Settings → API → service_role
   ```

   `SUPABASE_URL` is optional (the workflow uses the default project).

Without the secret, the release is still published and the Supabase step is
skipped with a warning.

## Limits

- **Linux**: only the **AppImage** self-updates. On deb/tar.gz installs or from
  source, the notice offers the link to the release.
- **Signing**: Windows builds without a certificate show the system warning;
  auto-update still works.
- The first release with the updater is the one that already ships `latest*.yml`;
  from there on the following versions update themselves.

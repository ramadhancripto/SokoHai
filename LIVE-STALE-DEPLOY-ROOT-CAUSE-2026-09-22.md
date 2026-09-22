# LIVE STALE DEPLOY ROOT CAUSE — 2026-09-22

## Evidence from the reported live UI

The reported screen contained all five strings from the pre-repair form:

- `Anza mazungumzo kwanza.`
- `Uwasilishaji (hiari)`
- `Mahali pa kupeleka (hiari)`
- `Siku unayopendelea kupokea (hiari)`
- `Mahitaji na maelezo ya oda yako (hiari)`

Those strings were absent from the repaired root application, so repeating the same form edits would not affect the UI being executed.

## Proven root cause

The repository contained a complete stale copy of the entire application inside the directory intended for font files:

- `fonts/index.html`
- `fonts/js/...`
- `fonts/css/...`
- `fonts/html/...`
- another Firebase configuration and service worker

The stale files contained the exact live strings and old submit gate. Firebase Hosting publishes `.` as its public directory, so that duplicate was deployable at `/fonts/`. Opening or retaining the `/fonts/` URL executed the old application and old negotiation code. The old `/fonts/` service-worker scope could also retain that route.

This explains why the visible UI contradicted the repaired root source and tests.

## Repair

1. Removed the complete duplicate application from `fonts/`.
2. Preserved only the six required Inter `.ttf` files and `fonts/inter.css`.
3. Added a small `fonts/index.html` canonical redirect to `/` so old `/fonts/` bookmarks cannot execute a second app.
4. Added a cleanup-only `fonts/sokohai-sw.js` that deletes old scope caches, redirects controlled windows to `/`, and unregisters itself.
5. Versioned the root service worker as `sokohai-negotiation-host-v3-20260922` and made activation delete prior caches.
6. Added Firebase cache headers:
   - HTML and service workers: `no-store`.
   - `js/app/**`: `no-cache, must-revalidate`.
7. Removed the remaining obsolete `Fungua/Anza mazungumzo kwanza` submit wording from root runtime code.
8. Added deployment-tree contracts proving there is no second `fonts/js`, `fonts/css`, or `fonts/html` application.

## Deployment requirement

The corrected package must be deployed from the repository root, not from `fonts/`:

```bash
firebase deploy --only hosting
```

After deployment, visit the root domain `/`. Existing `/fonts/` sessions will be redirected and their old service-worker scope cleaned.

## Verification

- Only one application `index.html` remains; `fonts/index.html` is redirect-only.
- Only one negotiation-form implementation remains in the deploy tree.
- Exact old live Product-delivery and manual-Chat-gate strings are absent from runtime source.
- Deployment/cache contracts: 32/32 pass.

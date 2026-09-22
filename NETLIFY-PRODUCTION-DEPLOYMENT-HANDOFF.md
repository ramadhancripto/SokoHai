# SokoHai Netlify Production Deployment Handoff

**Target:** https://sokohaicom.netlify.app  
**Date:** 2026-09-22  
**Local repair status:** VERIFIED  
**Production status:** NOT YET DEPLOYED

## Why production is still failing

The production URL is Netlify-hosted and still serves the former application build, including the retired duplicate application under `/fonts/`. The supplied SokoHai user account already has valid conversations and negotiations, so the visible “Anza mazungumzo kwanza” obstruction is stale client behavior, not missing account data.

The sandbox has no `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, connected Git remote, or other Netlify owner authority. Production therefore cannot be changed from this environment without owner deployment access.

## Artifact to deploy

Deploy the repository root from the final ZIP:

`SokoHai-chat-repaired-2026-09-22.zip`

The authoritative SHA-256 is supplied in the adjacent file `SokoHai-chat-repaired-2026-09-22.zip.sha256`.

Netlify must use the included root `netlify.toml`. Its publish directory is `.`. Do not choose `fonts/` as the publish directory.

## Owner deployment choices

### Netlify UI

1. Open the existing Netlify site for `sokohaicom.netlify.app`.
2. Deploy the extracted **contents of `SokoHai/` as the site root** (the directory that directly contains `index.html` and `netlify.toml`).
3. Confirm the production deploy has completed.
4. Do not create a second Netlify site or change the production domain.

### Connected Git

Commit the repaired repository tree and push it to the branch connected to the existing Netlify site. Confirm Netlify detected the root `netlify.toml` and published `.`.

## Mandatory acceptance check

Run from the extracted repository root:

```bash
npm run verify:live -- https://sokohaicom.netlify.app
```

Do not declare production repaired unless this exits with code 0.

The final local check passes (`npm test`, exit 0). The current production check exits 1 at:

`AssertionError: root index haina #chatNegotiationHost`

This expected failure proves the repaired build has not yet reached production.

## Post-deploy user check

After the automated live verifier passes, sign in and confirm:

1. Open Product `Viatu` and tap `Patana bei` without first sending an ordinary message.
2. Confirm the negotiation form opens inside Chat.
3. Confirm Product shows price, proposed price, quantity, and message only—no pickup, transporter, or delivery method.
4. Submit once and verify visible preparing/submitting/success feedback with no duplicate offer.
5. Test `Kubali`, `Kataa`, and `Counter` from the receiving account.
6. Switch Product → Service → Transport → Product and verify no stale fields leak between contexts.

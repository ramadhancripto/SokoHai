# SokoHai: decisions that need the owner

**Date:** 20 November 2026
**Branch:** `remediation/final-20261120`

This list holds only items that cannot or must not be completed from the repository: they need your accounts, money, legal judgement or a business choice. Each item gives a recommended option.

---

## D-1. Deploy Cloud Functions + Firestore rules (resolves R-21 live, activates R-18 server checks)

**Why this needs you**

- On 20 Nov 2026 every function URL in `europe-west1-sokonet-3b847` answered **HTTP 404**, including `sitemapXml` and `pesapalIpn`, which are public HTTP endpoints with no auth. This was checked from your browser.
- The cause is deployment, not code. All 180 exports load locally and every name the client calls exists (`tools/test_callable_names.mjs`).
- Deploying needs:
  - your Google account;
  - the Blaze billing plan;
  - `functions/.env.sokonet-3b847` with your secrets.

  Claude must not deploy.

**Recommended:** staging first, then production. The steps are in `docs/SOKOHAI-DEPLOY-FIREBASE-HATUA.md`. The commands, run from the `sokohai-pilot` folder on your computer, are:

```bat
:: 1. staging (after creating the staging project, Hatua 1-3 of the guide)
tools\deploy\DEPLOY-FIREBASE.bat          -> type: staging  -> type the staging project id
:: equivalent raw command (what the .bat runs after its safety checks):
firebase deploy --only firestore:rules,firestore:indexes,functions --project <staging-id>

:: 2. production, only after staging passes
tools\deploy\DEPLOY-FIREBASE.bat          -> type: production -> NDIYO PRODUCTION -> sokonet-3b847
firebase deploy --only firestore:rules,firestore:indexes,functions --project sokonet-3b847
```

**Required configuration for each project.** File: `functions/.env.<projectId>`.

- `SUPER_ADMIN_EMAILS`
- PesaPal:
  - `PESAPAL_CONSUMER_KEY`
  - `PESAPAL_CONSUMER_SECRET`
  - `PESAPAL_BASE_URL` (sandbox for staging)
  - `PESAPAL_IPN_ID`
  - `PESAPAL_REDIRECT_URL`
- `PUBLIC_BASE_URL`, which must equal the canonical origin (see D-2).

**After deploying:**

- check that `https://europe-west1-sokonet-3b847.cloudfunctions.net/sitemapXml` returns XML instead of 404;
- run `node tools/verify_live_negotiation_deploy.mjs <site>`.

---

## D-2. Canonical domain: `https://sokohai.com` (R-19)

**Why this needs you**

- On 20 Nov 2026 `https://sokohai.com` did **not load** in your browser.
- `https://sokohaicom.netlify.app` served the site, but an old build: it has no environment gate (`data-skh-env` missing).
- Pointing canonical/OG/sitemap at a domain that does not load would de-index the site.
- DNS, the Netlify custom domain and certificates are in your Netlify and registrar accounts.

**Already done in the repository:**

- One canonical origin everywhere (`functions/site-domain.js`, `js/00-config.js`, head, robots.txt, security.txt), enforced by `tools/test_canonical_domain.mjs`.
- PesaPal return origins include `sokohai.com` and `www.sokohai.com`.
- The sitemap fallback no longer uses `sokohai.example.com`.

**Recommended, in this order:**

1. Netlify:
   1. Site `sokohaicom` → Domain management → Add `sokohai.com` and `www.sokohai.com`.
   2. Set the DNS records shown by Netlify at your registrar.
   3. Wait for the HTTPS certificate.
   4. Set `sokohai.com` as **Primary domain**. Netlify then redirects the `.netlify.app` and `www` names to it with 301.
2. Firebase Console → Authentication → Settings → Authorized domains: add `sokohai.com` and `www.sokohai.com`.
3. PesaPal dashboard: register the IPN/callback URLs on the new domain.
4. When `https://sokohai.com` loads: run `node tools/set_canonical_domain.mjs https://sokohai.com`, then `npm test`, commit and deploy.
5. Set `PUBLIC_BASE_URL=https://sokohai.com` in `functions/.env.sokonet-3b847` and redeploy functions.

**Consequences:**

- Search engines move ranking to the new origin through the 301s.
- Old shared links keep working through the redirect.
- Users signed in on `sokohaicom.netlify.app` must sign in again on `sokohai.com`, because browser storage is per origin.

---

## D-3. `/sitemap.xml` route

**Why this needs you**

- `robots.txt` advertises `/sitemap.xml`, but no hosting rule serves it; the sitemap is the `sitemapXml` function.
- Adding the rule changes production routing (`netlify.toml`), which needs your approval.

**Recommended:** after D-1 succeeds, add this to `netlify.toml` above the catch-all `/*` rule:

```toml
[[redirects]]
  from = "/sitemap.xml"
  to = "https://europe-west1-sokonet-3b847.cloudfunctions.net/sitemapXml"
  status = 200
```

---

## D-4. Group Soko "soft glow" on the Soko section (design)

**Why this needs you**

- Owner design R-13H gave the Soko section a green glow.
- Merge 9ca6ad2 replaced the group navigation with one collapsible rail and deliberately removed that glow (`css/77-chat-conversations.css`).
- The tests now follow the new rail. Whether the glow should come back is a design decision.

**Recommended:** keep the new rail. If you want Soko highlighted, add the glow back to `#gsgTabs [data-tab=soko]` in css/77. It is a one-line change.

---

## D-5. Live payments (PesaPal live mode)

**Why this needs you**

- Live mode is still disabled; nothing in this work touched PesaPal credentials or real money.
- A real end-to-end payment test needs your merchant account, a real phone or card, and real money.

**Recommended:**

1. Run the full sandbox test on staging (`docs/SOKOHAI-DEPLOY-FIREBASE-HATUA.md`, Hatua 6).
2. Then one small live payment (for example TSh 1,000) with immediate refund, before opening payments to users.

---

## D-6. Taxonomy and inventory proposals (carried over, unchanged)

These need D8 or business approval. Details are in `docs/audit/2026-11-20/SOKOHAI-ECOM-GAP-AUDIT.md` and `SOKOHAI-INVENTORY-GAP-AUDIT.md`.

- **Airtime / data, gift cards / vouchers.**
  - Why: telecom/stored-value licensing.
  - Recommended: not now.
- **Human pharmacy / OTC; age verification.**
  - Why: TMDA and legal.
  - Recommended: keep blocked until legal advice.
- **Attributes (no new categories):**
  - size-range (plus-size);
  - halal / gluten-free;
  - duty-paid;
  - book language;
  - water sports;
  - sports nutrition;
  - modern instruments.

  Recommended: approve as attributes.
- **Inventory:**
  - expiry/FEFO enforcement, which touches the sale path;
  - cost method (FIFO or weighted average).

  Recommended: weighted average first; expiry enforcement only for the HEALTH and FOOD profiles.

---

## D-7. Features that intentionally have no server function

- **`offlineMemberCustomToken`**
  - The client already falls back to assisted mode.
  - Minting a sign-in token for another person is an impersonation capability.
  - Recommended: do not build it without a written security design.
- **`translateContent`** (machine translation of listings)
  - The client already shows the original text when the function is absent.
  - Recommended: optional; decide on a provider and a cost limit first.

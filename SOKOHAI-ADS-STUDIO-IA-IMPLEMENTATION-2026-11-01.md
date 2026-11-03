# SokoHai Marketplace Ads — 11-Section IA Implementation

**Date:** 2026-11-01 · **Branch:** `improve/phase1-audit-upload-fix` (uncommitted, not merged, not deployed)
**Scope of this step:** the approved information architecture, built into the **real** studio — UI only. No backend, schema, rules, function, billing or tracking changes.

Files touched: `js/app/101-marketplace-ads-studio.js` (1,886 lines), `css/43-marketplace-ads-studio.css` (+4.2 KB of new components), `tools/ads_studio_rebuild_verify.mjs`, `tools/ads_ia_shots.mjs` (new).

---

## 1. Navigation shipped (11 sections, grouped)

| Group | Section | What it does | Data source |
|---|---|---|---|
| — | **Muhtasari** (overview) | real counters, alerts, ad-type entry cards, honest chart placeholder | `announcements` (own records) |
| Unda | **Tengeneza** | the create flow (type → listing → creative → settings → placement → schedule → preview) | own listings + `creativeSaveDraft` / `creativePublish` |
| Simamia | **Kampeni Zangu** | all campaigns + 7 filter chips with live counts, grouped by state | own `announcements` |
| Simamia | **Maktaba** | your creatives, with "Tumia" (re-open creation on the same listing) | `creatives` where `ownerId == uid()` |
| Simamia | **Arifa** | ad notifications only, with a toggle to reveal account notifications | `notifications` where `userId == uid()` |
| Sanidi | **Hadhira** | supported targeting (`targetRegions/Categories/Keywords/EntityTypes`) + explicit "not supported" list | campaign records |
| Sanidi | **Mahali** | the 12 real delivery placements, per-placement campaign counts, Swahili labels + raw keys | `PLACEMENTS` mirror |
| Uchanganuzi | **Uchanganuzi** | impressions / clicks / CTR + per-campaign and per-type tables + CSV export | live ad counters only |
| Uchanganuzi | **Bajeti & Malipo** | real impression goals; spend/remaining/reserved marked unavailable; billing "Coming Soon" | `goals.*` on campaigns |
| Uchanganuzi | **Fedha & Ankara** | empty by design — no invoices, no ad balance, no client-side numbering | none (stated) |
| Msaada | **Mipangilio** | account, publishing rights, listing types, billing link, access/security facts | session + claims |

## 2. The honesty rule, implemented rather than described

Every metric slot renders one of two components:

* `realTile(...)` — a number that exists today (impressions, clicks, CTR, campaign counts), labelled *"kaunta halisi"*.
* `unavailableTile(...)` — a dashed, patterned tile that says **"Haipatikani"**, why, and what would be needed (e.g. *Reach — hakuna hesabu ya watu wa kipekee — inahitaji rollup ya server*).

Nothing shows `0` when the truth is "not measured". No chart is drawn where no time series exists — the overview and analytics show a patterned placeholder explaining that daily series live in `adDeliveryMetrics`, which the client may not read. No conversion, revenue, ROAS, spend or CPC figure appears anywhere.

## 3. Interaction details worth knowing

* **Campaign filters** are chips with counts (`Zote 5 · Rasimu 1 · Zinasubiri 1 …`); the old separate "Rasimu" nav item is gone, drafts are a filter inside Kampeni Zangu.
* **Date range (Siku 7/30/90)** is rendered as non-interactive spans, visibly inert, with the reason inline: the counters are lifetime totals, not daily. (Deliberately not `<button disabled>`: the global `button:disabled { background:#94a3b8 !important }` reset would paint them as if selected.)
* **CSV export** writes exactly the rows on screen — `Tangazo, Aina, Hali, Maoni, Clicks, CTR %, Kuanzia, Hadi` — and contains no invented columns.
* **Arifa** classifies notifications by type/link/title rather than dumping all 40 account notifications into an ads view; account notifications are one click away, and the in-app notifications panel is linked.
* **"Tumia" in Maktaba** re-opens the create flow on the *same* listing with the previous headline carried over; the creative document is never copied, so a deleted listing cannot be re-published from a stale creative.
* Document ids now come from the snapshot (`{...doc.data(), id: doc.id}`), so a stale `id` field inside a document can no longer win over the real id (that bug made "Tumia" dead-end on older creatives).

## 4. Verification (real running build, not mockups)

All numbers below come from Playwright runs against `tools/dev_server.mjs` serving `dist/` — the actual app.

| Suite | Result |
|---|---|
| `tools/ads_studio_rebuild_verify.mjs` (studio contract + new IA sections) | **74 / 74** checks passed |
| `tools/ads_phase1_verify.mjs` (marketplace ad delivery, unchanged paths) | **30 / 30** |
| `tools/ads_task01_verify.mjs` (card parity: width, no overflow, tablet) | **18 / 18** |
| `tools/test_ads_studio_transport_link.mjs` (transport link contract) | **11 / 11** |

New checks added for this step: 11 approved sections present, navigation grouped, campaign filter chips narrow to drafts, analytics marks ≥3 unsupported metrics as unavailable, Arifa separates ad vs account notifications, the "show all" toggle expands, CSV downloads as `sokohai-matagazo-YYYY-MM-DD.csv` with no invented columns, "Tumia" reopens creation. Zero page errors; zero Firestore writes (all persistence intercepted).

Screenshots: `audit-shots/mas-ia-*.png` (11 sections at 1440, plus 390 and 820 breakpoints), `audit-shots/mas-05-marketplace-three-types.png` (ads rendering inside the real feed).

## 5. Fixed along the way

1. **Doc-id precedence** in `creatives` and `notifications` readers (see §3) — was silently breaking the reuse action.
2. **Global reset collisions**: `h4 { font-size: … !important }` and `button:disabled { background:#94a3b8 !important }` were overriding new components; fixed by changing markup (group labels are `div`, range controls are `span`), not by weakening the global rules.

## 6. Still open — needs your approval (no backend work started)

* Seller-facing **lifecycle callables** (pause/resume) and a **modelled campaign read** so campaign states beyond draft/pending/active can be shown truthfully.
* A **read callable for `adDeliveryMetrics`** — the single unlock for daily series, placement/region breakdowns and therefore *Ads Performance Intelligence*.
* **Ad notifications writer** (server) so Arifa is not empty.
* **Ad funds as a separate balance from `walletBalance`**, invoices and numbering — design only, and only after you approve the money phase.
* Attribution — explicitly deferred until tracking is validated.

Say the word and I will start at the top of that list; until then the studio stays UI-only on this branch.

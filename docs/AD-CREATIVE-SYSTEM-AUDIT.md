# SokoHai Advanced Advertiser + Graphic Design Creative System — Pre-Coding Audit

**Audit date:** 2026-09-23 (Africa/Dar_es_Salaam)  
**Audited repository:** `https://github.com/ramadhancripto/SokoHai`  
**Audited branch/commit:** `main@bd4196e7807cc3e374ffb924086f55277f8756bf`  
**Implementation status:** Audit only. No Creative Studio runtime implementation has started.

---

## 0. Executive verdict

SokoHai already has four pieces that must be preserved:

1. An Admin-managed Home Advertisement Showcase backed by `announcements`.
2. A Cloudinary uploader shared by Product, Service, Transport and Home Ad media.
3. Product/Service/Transport boost fields and a centralized marketplace ranking module.
4. An Advertiser Dashboard shell whose Company Ads and Billing sections are intentionally Coming Soon.

It does **not** currently have a reusable graphic design canvas, editable layer model, campaign entity, user-owned creative drafts, creative versions, brand kits, templates, ad targeting, trustworthy ad impression/click analytics, or user advertiser authorization.

The correct architecture is therefore an extension—not replacement:

```text
Existing entity / custom content
  → ONE SokoHai Creative Studio
  → editable Creative + immutable Creative Version
  → preview / validation
  → publication channel
       ├─ existing announcements Home Showcase
       ├─ business/product/service/general update channel (when authorized)
       └─ future Campaign/Ad Set distribution
  → existing destinations, boost/ranking, analytics and moderation
```

`announcements` remains the existing Home publication authority. It should not be discarded or silently migrated into an incompatible collection. A Creative is an editable design asset; an Announcement/Ad publication references an immutable Creative Version. This normalization is not a duplicate ad system.

### Implementation gate

The Creative Studio must **not** be implemented on the current release baseline until these repository/deployment defects are repaired:

- Full `npm test` currently fails because the stale application under `fonts/` was reintroduced.
- The full repository was duplicated under `assets/` in the latest commit.
- Netlify production remains on old commit `4fe6506`; current GitHub changes are not deployed.
- GitHub Actions has no workflow runs and does not block broken commits.

---

# 1. Existing advertising files

| File | Role | Current function | Dependencies | Current problems | Action |
|---|---|---|---|---|---|
| `js/app/09-feed-announcements.js` | Existing Home advertisement data authority on client | Listens to latest 50 `announcements`; creates/updates/archives Admin announcements; derives draft/scheduled/active state | Firestore, `skh`, `js/06-announcement.js`, Admin UI | Admin-only; flat creative fields; no owner, entity link, version, campaign, destination object or editable design state; public listener fetches drafts and archived docs | **MODIFY** |
| `js/06-announcement.js` | Public Home Advertisement Showcase renderer | Filters active ads, rotates by priority, renders image/video/audio/text card, CTA and displayed metrics | `announcements` cache, `#topAnnouncement`, `css/38-home-ad-manager.css` | Only one Home placement; trusts summary metrics without an event writer; CTA is URL string; no immutable creative version; no entity destination; no targeting | **EXTEND** |
| `js/app/16-pos-admin-jobs.js` | Admin Advertisement Manager UI | Creates current ad form, preview, schedule/status, media upload/library and archive actions | Admin claims, `09-feed-announcements`, Cloudinary uploader, `adminMedia` | Large unrelated POS/Admin monolith; form is not a canvas; Admin-only; no layers, formats, templates, undo, export, autosave or versioning | **MODIFY + MERGE UI INTO SHARED STUDIO** |
| `css/38-home-ad-manager.css` | Home ad, Admin manager and preview styling | Professional current Home card and Admin form styles | `js/06-announcement.js`, `16-pos-admin-jobs.js` | Tied to one flat card layout; not an editor layout; contains Admin and delivery styles together | **MODIFY**; retain publication-card styles, move editor styles to a lazy Creative Studio stylesheet |
| `html/16-topnav.html` | Home ad placement | Defines `#topAnnouncement` before search | `js/06-announcement.js` | One placement only; correct location should be preserved | **REUSE** |
| `html/03-modals-core.html` | Advertiser entry shell | Advertiser Dashboard, Company Ads Coming Soon and Billing Coming Soon | `19-roles.js`, `36-advertiser-coming-soon.css` | Company Ads is locked; no Create Creative entry | **MODIFY** |
| `css/36-advertiser-coming-soon.css` | Advertiser shell styling | Responsive dashboard and locked cards | `html/03-modals-core.html` | No Studio workspace states | **EXTEND** only for dashboard launch cards; do not put full editor CSS here |
| `js/app/19-roles.js` | Advertiser dashboard open/close | Opens Advertiser UI and Coming Soon dialogs | auth, modal system | Any signed-in user can open shell, but no advertiser workspace authorization/model | **MODIFY** |
| `js/app/22-printing.js` | Unified role/menu routing | Routes `mode_advertiser` to dashboard | `19-roles.js` | No defect relevant to editor | **REUSE** |
| `js/app/01-market.js` | Existing listing boost flow | Calculates boost price; writes boost summary in free mode; initiates PesaPal in paid mode | Products/Services/Transport records, payment helpers, system config | Boost is not a campaign manager; direct writes and `adminRevenue` rules require hardening; target views are not proven delivered | **EXTEND, DO NOT REPLACE** |
| `js/app/39-market-ranking.js` | Organic/boosted marketplace ranking | Validates active boost, expiry and target; creates boosted section with relevance checks | listing records and feed builder | `boostedViewsCount` has no proven authoritative impression updater; not a Creative distribution engine | **EXTEND AFTER ANALYTICS AUTHORITY** |
| `js/app/00-bootstrap.js` | Feed/cards and shared infrastructure | Renders Boosted labels and sections; exposes shared upload/image helpers | many app modules | Main page already heavy; Creative Studio must not load here eagerly | **REUSE; MINIMAL lazy-loader hook only** |
| `css/01-core.css`, `css/07-market-polish.css`, `css/16-commerce-card.css` | Boosted card presentation | Existing Boosted badge/card layout | feed cards | Must not become editor CSS | **REUSE** |
| `tools/test_home_ads_product_cards_contract.mjs` | Current Home ad regression contract | Verifies Home placement, current ad manager and product cards | source files | Does not test a graphic editor | **EXTEND** |
| `tools/test_advertiser_billing_coming_soon_contract.mjs` | Billing scope guard | Proves Billing remains UI-only | advertiser files | Must continue to prevent accidental payment implementation during Creative stages | **REUSE** |

---

# 2. Existing post/update files

## What exists

- `announcements` acts as the current Admin Home advertisement/update publication collection.
- Product, Service and Transport records are marketplace entities and can be boosted.
- Group Soga and Chat have discussions/messages/shared contexts, but these are not a general advertising post database.
- Product publication and seller updates exist in commerce-specific modules.

## What does not exist

No canonical top-level collections or complete lifecycle were found for:

- `businessUpdates`
- `productPosts`
- `servicePosts`
- `generalPosts`
- user-owned announcement posts
- advertiser campaigns
- ad sets
- editable creatives

The terms Advertisement, Business Update, Product Post, Service Post and General Post must remain distinct publication types that consume the **same** Creative Version. They must not be modeled as separate editors.

### Current conceptual conflict

`announcements` currently mixes:

- announcement semantics;
- Home sponsored advertisement semantics;
- SokoHai live notices;
- flat visual creative fields;
- publication scheduling.

The shared editor should not add more design logic directly into this flat document. Existing fields must remain readable for backward compatibility, while new publications reference a versioned Creative.

---

# 3. Existing media upload files and Cloudinary

| File | Role | Current function | Problems | Action |
|---|---|---|---|---|
| `js/11-uploads.js` | Canonical uploader | One shared Cloudinary uploader; client compression; single/multiple input; Product photo picker | Uses public unsigned preset in browser; no signed deletion; folder is client supplied; no creative ownership metadata | **REUSE + MODIFY SECURITY** |
| `js/app/00-bootstrap.js` | Compatibility wrappers | `skh.uploadImage`, optimized Cloudinary URL helper | Optimization is fixed `600x600 c_fit`; Creative export/preview needs format-aware transforms | **EXTEND** |
| `js/app/16-pos-admin-jobs.js` | Admin ad media library | Uploads image/video/audio/logo and stores URL metadata in `adminMedia` | Admin-only; cannot serve ordinary advertisers; deletion removes reference only; no original/optimized/thumbnail roles | **MODIFY/MIGRATE** |
| `js/app/08-app-state.js` | Product/Service/Transport upload usage | Uses canonical uploader to publish entity media | Must remain untouched by canvas internals | **REUSE** |
| `js/app/03-dashboard.js`, `js/app/07-product.js` | Other existing media consumers | Upload Product/profile/recording media | Must not be forked | **REUSE** |

## Verified Cloudinary state

- Cloud name: `dt7erwy1r`.
- Unsigned preset: `Sokohai_preset`.
- Upload endpoint: Cloudinary REST upload API.
- Client image compression exists for JPEG/PNG/WebP.
- Firestore stores URLs/metadata, not image bytes.
- No signed Cloudinary upload/delete Function was found.
- No real remove-background or subject-cutout service was found.

### Decision

- Reuse Cloudinary and `skhUploadFromFile`.
- Add a server-signed upload path before ordinary advertiser uploads are considered production-secure, or strictly lock the unsigned preset in Cloudinary.
- Track `original`, `optimized`, `thumbnail`, and `preview` references as metadata.
- Do not implement “Remove Background” until a real image service exists. Show it as unavailable, not simulated.

---

# 4. Existing campaign and targeting system

## Finding

There is no real advertising campaign collection, ad-set model, targeting resolver, budget/spend model, or advertiser billing backend.

Existing items called “campaign” are labels/placeholders only:

- Company Ads is Coming Soon.
- Billing & Payments is Coming Soon.
- Admin ad form accepts a Brand/Campaign name string.
- Digital Marketing/Campaigns exists only as a Service taxonomy category.
- Boost is a listing promotion mechanism, not a campaign entity.

No factual audience targeting implementation was found for Home ads. Existing Home ads are globally read and rotated by priority/date.

### Decision

- Creative Studio creates Creative assets only.
- Stage N may add a campaign layer after Creative publication is stable.
- Do not hide campaign management inside the canvas editor.
- Preserve Product/Service/Transport boost as an existing distribution mechanism.

---

# 5. Existing analytics

## Existing reusable analytics

- `js/app/11-analytics.js` calculates commerce/inventory/sales metrics from existing records.
- `platform_stats` exists for server-generated platform aggregates.
- `recommendationEvents` records selected user/search engagement signals.
- Marketplace ranking reads views, likes, saves, shares, reviews and recent Orders when those fields exist.
- Home ad renderer can display `viewCount`, `clickCount` and likes fields.

## Missing ad analytics authority

No authoritative code was found that writes Home ad:

- impressions;
- unique impressions;
- clicks;
- CTA conversions;
- placement;
- creative version attribution;
- campaign attribution.

`boostedViewsCount` is read for boost eligibility, but this audit did not find an authoritative updater that proves delivered views. Therefore target-view completion is not currently a trustworthy ad delivery claim.

### Decision

Add append-only/aggregated ad events later, server validated and privacy bounded. Never let the editor write analytics. A Creative Version ID must be included in publication and event attribution.

---

# 6. Existing collections

## Current advertising-related collections/fields

| Collection/record | Current purpose | Decision |
|---|---|---|
| `announcements` | Existing Home ads/announcements and scheduling | **Canonical Home publication; extend safely** |
| `adminMedia` | Admin-only Cloudinary media references | Preserve existing docs; migrate/extend carefully for user-owned creative assets |
| Product/Service/Transport records | Existing listing and boost state | Preserve; add only references/actions |
| Product/Service/Transport boost fields | `isBoosted`, target, delivered count, start/expiry | Preserve existing mechanism; harden analytics |
| `adminRevenue` | Boost/admin revenue records | Existing rules are overbroad; do not use for new Creative billing |
| `recommendationEvents` | Search/engagement signals | Reuse only through current ranking/privacy behavior |
| `platform_stats` | Server aggregates | Potential aggregate destination, not raw creative events |

## Proposed normalized extension

```text
creatives/{creativeId}
  ownerId
  type                      // advertisement, business_update, product_post, service_post, general_post
  format
  canvas
  background
  currentDraftVersion
  linkedEntity
  defaultDestination
  businessId?
  sellerId?
  brandKitId?
  status                    // DRAFT, PREVIEW, READY, ARCHIVED
  createdAt
  updatedAt

creatives/{creativeId}/versions/{versionId}
  version
  canvas
  background
  layers[]
  brandSnapshot
  linkedEntitySnapshot
  destinationSnapshot
  renderMetadata
  createdBy
  createdAt
  immutable

brandKits/{brandKitId}
  ownerId
  businessId?
  name
  logo variants
  colors
  preferredFonts
  tagline/contact/public links
  editors/authorization metadata

creativeEvents/{eventId} or server aggregate path (later)
  publicationId
  creativeId
  creativeVersion
  eventType
  placement
  actorHash/session-safe identity
  server timestamp
```

Existing `announcements/{id}` gains only compatible publication references:

```text
creativeId
creativeVersion
advertiserId
publicationType
authorizationScope
linkedEntity
destination
campaignId?          // only when a real campaign exists
status
startAt/endAt
```

Legacy `headline`, `imageUrl`, `colors`, etc. remain readable. During migration they may be generated from the pinned Creative Version so old renderers continue to work.

---

# 7. Existing Firebase security

## Current relevant rules

- `announcements`: public read; Admin-only create/update/delete.
- `adminMedia`: Admin-only all operations.
- Products/Services: public read, owner/Agent/Admin write contracts.
- Drivers: public read, but any signed-in user can write—too broad for trusted Transport promotion.
- `adminRevenue`: any signed-in user can read/write—financial integrity defect.
- `recommendationEvents`: owner/Admin-scoped except search read behavior.

## Critical advertising privacy problem

The public announcement listener queries the latest 50 announcements without filtering published state. Because `announcements` allows public read, **draft, scheduled, archived and expired documents are readable by the public even when the UI hides them**.

This must be corrected before advertisers can save confidential drafts.

## Required rule design

- Creative draft owner is derived from `request.auth.uid`, never accepted as an arbitrary client `advertiserId`.
- Owner or explicitly authorized Business editor can edit a draft.
- Published Creative Versions are immutable.
- Public users read only approved, active/public publication projections—not draft design JSON.
- Admin moderation fields are server/Admin-only.
- Brand Kit and user asset access is owner/team scoped.
- Public analytics never exposes user identity.
- Publication action must validate linked entity ownership and destination existence.
- Agent acting for an offline account must use the existing permissioned assisted-account authority, not silently become owner.

## Query/rule split required

- Public Home query: published/approved/non-archived records only.
- Admin manager query: all states under Admin authorization.
- Advertiser query: records owned/authorized for that advertiser.

Indexes must support those bounded queries.

---

# 8. Existing UI entry points

1. `Kazi / Usimamizi → Advertiser` opens Advertiser Dashboard.
2. Advertiser Dashboard shows Overview, Company Ads Coming Soon and Billing Coming Soon.
3. Admin Dashboard → Home Management → Advertisement Manager.
4. Admin can create, preview, publish/schedule, edit and archive Home ads.
5. Admin Media Library can upload/select image, video, audio and logo.
6. Home renders the active Advertisement Showcase before search.
7. Product/Service/Transport dashboards expose the existing boost modal.
8. Feed cards show a factual “Boosted” badge when boost eligibility passes.

## Recommended integration

- Advertiser Dashboard gets a **Create Creative** action.
- Existing Admin “Create Advertisement” opens the same Studio with Admin/Home publication context.
- Product detail gets **Advertise this product**.
- Service detail gets **Promote this service**.
- Business entry is enabled only after an authoritative Business entity exists.
- Transport detail gets **Promote transport service**.
- Existing boost remains a separate distribution action, not a second editor.

Canonical API:

```js
window.SokoHaiCreativeStudio.open({
  sourceType: 'product',
  sourceId: '...',
  format: 'square',
  publicationType: 'advertisement'
});
```

---

# 9. Duplicate and conflicting implementations

## Confirmed duplicates outside feature architecture

- `assets/js`, `assets/css`, `assets/html`, and `assets/functions` are byte-identical copies of root trees in the audited commit.
- `fonts/js`, `fonts/css`, `fonts/functions`, etc. are a stale duplicate application and differ materially from root.
- The current full test suite fails specifically because stale `fonts/` application content exists.

Actions:

- `assets/**` full-project copy: **REMOVE ONLY IF VERIFIED DUPLICATE** — verification completed for root JS/CSS/HTML/Functions; preserve genuine image assets.
- stale application under `fonts/**`: **REMOVE ONLY IF VERIFIED DUPLICATE/STALE** — preserve actual root font binaries and `fonts/inter.css`.

## Advertising conflicts

- Admin ad form contains visual controls but is not a reusable Creative Editor.
- Home ad renderer is a publication renderer, not a design canvas.
- Boost is ranking/distribution, not a creative editor.
- Company Ads shell is placeholder, not a campaign system.

None should be rebuilt as parallel editors.

---

# 10. Font audit

## Verified locally available fonts

Only **Inter** is bundled and verified, with weights:

- 400
- 500
- 600
- 700
- 800
- 900

The following requested font families are **not bundled/verified in the repository**:

- Roboto
- Open Sans
- Lato
- Poppins
- Montserrat
- Manrope
- Bebas Neue
- Anton
- Oswald
- Playfair Display
- Merriweather
- Nunito
- Quicksand

CSS mentions system fallbacks such as Roboto/Segoe UI, but that does not prove the font file is available consistently.

### Decision

- Stage D starts with verified Inter.
- Additional curated fonts must be licensed, downloaded, self-hosted and loaded on demand before appearing as available.
- Never display a font option that silently renders an unrelated fallback.
- Font preview uses the actual loaded font and reports loading failure.

---

# 11. Canvas/graphics engine audit

No Fabric.js, Konva, Cropper, html2canvas, jsPDF or equivalent Creative Editor library is installed.

Existing Canvas usage is unrelated chart/utility rendering. No layer engine, selection box, drag/resize, undo/redo, grouping, guides, export pipeline or design JSON exists.

## Recommended engine

Use one lazy-loaded, SVG-based editor core:

- SVG provides independent layers, text, shapes, images, masks, gradients, transforms and filters.
- The editable model remains plain JSON.
- DOM/SVG handles selection and manipulation.
- Export rasterizes a pinned SVG version through Canvas to PNG/JPG.
- PDF remains disabled until a verified print pipeline exists.
- Video background publication remains media-based; static image export uses poster frame only.

A third-party canvas library may be considered only after dependency, license, bundle-size, mobile and export/CORS evaluation. It must be vendored or reliably lazy loaded, and must not load on Home startup.

---

# 12. Recommended canonical files

## Existing canonical files to retain

- `js/11-uploads.js` — one media uploader.
- `js/app/09-feed-announcements.js` — existing Home publication integration.
- `js/06-announcement.js` — Home publication renderer.
- `js/app/39-market-ranking.js` — existing organic/boosted ranking.
- `js/app/28-buyer-engagement.js` — existing Follow/Save relations; do not duplicate.
- `js/18-icons.js` and existing SokoHai icon system — professional icons.
- `html/03-modals-core.html` — Advertiser entry shell only.
- `functions/index.js` — server export entry point.
- `firestore.rules`, `firestore.indexes.json` — one Firebase contract.

## New Creative Studio module boundary

```text
js/app/creative/creative-model.js
js/app/creative/creative-history.js
js/app/creative/creative-svg-renderer.js
js/app/creative/creative-interactions.js
js/app/creative/creative-text.js
js/app/creative/creative-image.js
js/app/creative/creative-templates.js
js/app/creative/creative-brand.js
js/app/creative/creative-assistant.js
js/app/creative/creative-export.js
js/app/creative/creative-persistence.js
js/app/95-creative-studio.js       // ONE public editor entry/orchestrator
css/39-creative-studio.css
```

These are modules of one editor, not separate Product/Service/Business/Transport editors.

---

# 13. File classification

## REUSE

- `js/11-uploads.js`
- `js/18-icons.js`
- `js/app/00-bootstrap.js`
- `js/app/22-printing.js`
- `js/app/39-market-ranking.js`
- `js/06-announcement.js` publication renderer architecture
- `html/16-topnav.html`
- `css/01-core.css`
- `css/07-market-polish.css`
- `css/16-commerce-card.css`
- existing Product/Service/Transport canonical records and openers
- existing SokoPay/Orders/Chat/Negotiation/Usafir infrastructure

## MODIFY

- `js/app/09-feed-announcements.js`
- `js/app/16-pos-admin-jobs.js`
- `js/app/19-roles.js`
- `html/03-modals-core.html`
- `html/21-scripts.html` — lazy entry only
- `css/36-advertiser-coming-soon.css`
- `css/38-home-ad-manager.css`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/index.js`
- `package.json`

## EXTEND

- `js/06-announcement.js`
- `js/app/01-market.js`
- `js/app/39-product-showcase.js` for Product/Service entry actions
- relevant Transport detail opener/module for Transport source context
- `js/app/75-discover-engine.js` and `88-discover-complete.js` only when sponsored Discover integration is ready
- existing test contracts

## MERGE

- Move reusable ad form/preview behavior out of `16-pos-admin-jobs.js` into the shared Creative Studio.
- Keep the Admin manager as a publication manager that launches the Studio.
- Do not keep an Admin-only mini editor in parallel.

## DEPRECATE

- Flat visual editing directly on `announcements` after the versioned Studio is stable. Keep compatibility reading/writing during migration.
- `91-discover-fixes.js` remains historical/non-loaded and must not be used for sponsored integration.

## REMOVE ONLY IF VERIFIED DUPLICATE

- Full app copy under `assets/` after preserving genuine media assets.
- Stale app under `fonts/` after preserving real fonts and `inter.css`.
- Never delete existing `announcements` or published ad data.

---

# 14. Files to create

## Runtime

- `js/app/95-creative-studio.js`
- modules under `js/app/creative/` listed above
- `css/39-creative-studio.css`
- `functions/creative.js` for authoritative publish/version/ownership commands

## Templates

- `js/app/creative/templates/core.json` or equivalent lazy static template packs by category.
- Templates contain editable layers only; no fake Products, prices, locations or sellers.

## Tests

- `tools/test_creative_model.mjs`
- `tools/test_creative_history.mjs`
- `tools/test_creative_templates.mjs`
- `tools/test_creative_export_contract.mjs`
- `tools/test_creative_persistence_contract.mjs`
- `tools/test_creative_integration_contract.mjs`
- `tools/test_creative_security_contract.mjs`
- `tools/test_creative_mobile_contract.mjs`

A browser/device lab is still required for real drag, resize, crop, touch and export verification; source/DOM contracts alone are insufficient.

---

# 15. Files that must not be touched for Creative Editor internals

Unless a narrowly proven integration requires a one-line launcher/reference, do not modify:

- `functions/negotiation.js`
- `functions/routing.js`, `routing-core.js`, `routing-logic.js`
- Chat engine files (`34-chat-core.js`, negotiation forms, group chat)
- Order/Escrow/SokoPay lifecycle modules
- Custody/token/tracking modules
- POS transaction engine (`15-pos-sales.js`)
- Offline identity and Agent authentication internals
- Group Order system
- Product/Service/Transport canonical persistence schemas beyond linked Creative actions
- Global Discover foundation/ranking logic before sponsored placement rules are explicitly defined

Creative Studio must not become a route to mutate price, stock, seller identity, payment, order, location or transport facts.

---

# 16. Risk assessment

| Risk | Severity | Evidence/impact | Required mitigation |
|---|---:|---|---|
| Public access to draft announcements | P0 | Current public query/rule exposes all announcement states | Split public/admin/owner queries and rules before advertiser drafts |
| Arbitrary advertiser identity | P0 | No user creative ownership model exists | Server derives owner from auth; callable publish validates authority |
| Published creative mutation | P0 | Current ad doc is updated in place | Immutable versions; publication pins version |
| Unsigned Cloudinary uploads | P0/P1 | Preset and folder are client-side | Strict preset or signed upload Function; metadata ownership |
| Linked entity/price fabrication | P0 | No linked entity validation in current ad model | Server reads canonical entity and creates snapshot; client cannot assert price/owner |
| Stale deploy/source duplicates | P0 | GitHub tests fail; Netlify is stale | Clean and restore green baseline before Stage B |
| Organic Discover corruption | P1 | Sponsored integration not defined | Separate bounded sponsored slots with labels; never mix score into organic silently |
| Fake analytics | P1 | Metrics rendered but no authoritative writer found | Server events/aggregates; label only factual counts |
| Canvas export CORS failure | P1 | Cloudinary images rasterized in browser can taint canvas if misconfigured | Use `crossorigin`, verified Cloudinary transforms/CORS and export tests |
| Mobile performance | P1 | Main page already loads many scripts | Lazy-load Studio, templates and fonts; virtualize layers/templates |
| Font inconsistency | P1 | Only Inter is bundled | Offer only verified fonts; self-host/lazy load curated additions |
| Autosave write amplification | P1 | Firestore writes on drag would be expensive | Local changes; save on drag end; debounced/version-aware persistence |
| Undo memory growth | P2 | Large image/data snapshots can exhaust mobile memory | Command/history patches; cap history; store asset references, not blobs |
| Business authorization gap | P1 | Canonical Business/Branch graph incomplete | Delay team brand kits/business publish until authority exists |
| Remove-background promise | P2 | No service found | Mark unavailable; do not fake |

---

# 17. Proposed state and version contract

## Creative lifecycle

```text
DRAFT → PREVIEW → READY → ARCHIVED
```

A Creative is an editable asset. Publication has a separate lifecycle:

```text
DRAFT → PREVIEW → READY → PUBLISHED → PAUSED → ARCHIVED
```

Publishing creates/pins an immutable version. Editing a running ad creates a new draft version and does not mutate the running version.

## Undo/redo/autosave

- Every meaningful model mutation is a command/patch.
- Pointer movement updates local transient state.
- Drag end commits one history command.
- Autosave is debounced.
- Firestore does not receive per-pixel writes.
- Recovery prompt appears when a local draft is newer than remote.

---

# 18. Template and factual adaptation rules

Templates may provide placeholders and layout defaults, but must never manufacture commercial facts.

When opened from an entity:

- Product fields come from the canonical Product record.
- Service fields come from the canonical Service record.
- Transport route/vehicle/availability comes from authorized transport records.
- Seller/Provider identity comes from public/authorized identity projection.
- Location comes from the entity’s real public location.
- Discount is calculated only when current and previous/offer prices are trusted records.
- CTA destination is an internal typed destination whenever possible.

Entity snapshots in a published Creative Version preserve what was shown, but publication validation must reject missing/unauthorized destinations.

---

# 19. Sponsored Discover integration decision

Do not insert advertisements directly into organic ranking arrays.

Required behavior:

- Organic results continue through current Discover ranking.
- Sponsored candidates use a separate authorized query/resolver.
- Sponsored placement is bounded and explicitly labeled `Sponsored` or `Promoted`.
- Candidate must be relevant to query/category/location and have active publication status.
- Placement and creative version are recorded for factual analytics.
- No “best” or organic rank claim is made.
- If no eligible sponsored record exists, no sponsored placeholder appears.

This integration belongs after publication, security and analytics—not in the first canvas stages.

---

# 20. Implementation stages and reporting gate

## Stage A — completed by this document

- Existing ad/post/media/campaign/analytics/rules/UI audit.
- No runtime implementation.

## Stage B — canonical Creative model

- Pure model/schema/validation.
- Firestore rules and server ownership design.
- Legacy announcement compatibility tests.

## Stage C — Creative canvas

- One SVG canvas, preset sizing, safe areas, zoom and selection.

## Stage D — text engine

- Verified Inter first; typography hierarchy, wrap/overflow protection, stroke/shadow/background.

## Stage E — image/background engine

- Existing Cloudinary assets, non-destructive transforms, masks, overlays and gradients.

## Stage F — layers/alignment

- z-order, lock/hide/duplicate/delete, grouping, guides, snap and grids.

## Stage G — templates

- Category packs; editable layers; factual entity placeholders.

## Stage H — Brand Kit

- Owner/team authorization, logo/colors/font pairing; opt-in apply.

## Stage I — Auto Design

- 3–5 labeled deterministic variations: Minimal, Bold, Elegant, Modern, Promotional.
- No “best” claim.

## Stage J — previews

- Feed, Story, Product Card, Mobile and Desktop previews.

## Stage K — persistence/versioning

- Debounced autosave, recovery, immutable published versions, duplication.

## Stage L — entity integration

- Product, Service, Transport, then Business only after Business authority is ready.

## Stage M — publishing

- Existing Home announcements first; other post types only when their publishing channel exists.

## Stage N/O — campaign and analytics

- Separate manager and server-authoritative events.

## Stage P/Q/R — mobile, performance, security and full regression

After every stage report:

- changed files;
- reason;
- dependencies;
- tests performed;
- regression result;
- remaining risks.

---

# 21. Mandatory test matrix

## Model and editor

- Blank design
- Product/Service/Transport source
- Business source when authorized
- Preset/custom canvas
- Safe/text-safe/bleed guides
- Text formatting, wrap, overflow, stroke, shadow and background
- Color/gradient/texture
- Upload/select existing image
- Crop/rotate/flip/opacity/filters
- Shapes/icons/masks
- Layer ordering, lock, hide, duplicate, delete
- Group/ungroup
- Guides, snap, align and distribute
- Undo/redo
- Autosave/recovery
- Duplicate Creative
- Resize adaptation review
- Preview modes
- PNG/JPG export
- Publish/pause/edit/new version/archive

## Breakpoints

- 320
- 360
- 390
- 414
- 768
- 1024
- desktop

## Regression

- Product/Service/Usafir/People/Business/Seller Discover
- Chat and Negotiation
- Orders/SokoPay/Escrow
- POS
- Notifications
- Follow/Save
- Offline account and Agent separation
- PWA
- Existing Home announcements
- Existing boost and market ranking

Do not claim physical-device, browser-driven, live Firebase, live Cloudinary or screenshot testing unless it is actually performed.

---

# 22. Final recommendation

Proceed only after restoring a clean, deployable, green repository baseline. Then implement one lazy-loaded SokoHai Creative Studio with:

- pure versioned Creative JSON;
- SVG layer editor;
- existing Cloudinary uploader;
- existing Home announcement publisher;
- existing entity records and typed destinations;
- server-derived ownership and immutable published versions;
- separate organic and sponsored discovery;
- factual analytics only.

Do not create ProductAdEditor, ServiceAdEditor, BusinessAdEditor, TransportAdEditor, PosterEditor or BannerEditor. All are context presets of one Creative Studio.

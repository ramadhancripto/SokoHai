# SokoHai — Current Discover Removal Report

Date: 2026-09-26
Status: current Discover implementation removed; no replacement built.

## Backup

Created before removal:

- `/home/user/SokoHai-discover-removal-backup-20260926.zip`

The backup includes the pre-removal `index.html`, active Discover modules/styles, shared files touched for dependency review, and the original Discover tests/rules snapshot.

## Removed

### Production modules

- `js/app/42-discovery-feed.js`
- `js/app/68-chat-discover.js`
- `js/app/75-discover-engine.js`
- `js/app/76-discover-foundation.js`
- `js/app/88-discover-complete.js`
- `js/app/91-discover-fixes.js`

### Discover-only CSS

- `css/21-discovery-maoni.css`
- `css/30-discover-engine.css`

### Discover-only test contracts

- `tools/test_card_discovery.mjs`
- `tools/test_discover_phase2_contract.mjs`
- `tools/test_discover_phase3_service_contract.mjs`

### Runtime wiring removed

- Discover CSS imports from `index.html`
- Discover module imports from `index.html`
- Product-detail vertical Discover navigation
- Search-bar handoff into `skhDiscoverEngineOpen`
- Product detail activation of the removed Discovery Context
- Group refresh calls into removed Discover functions
- Discover FAB/overlay handling from the shared one-UI patches
- Discover-only role-search/visibility persistence code
- Dead Discover i18n strings

## Modified but preserved

These files were shared with Chat, Groups, profiles, dictionary, search, or modal behavior and were not deleted:

- `js/app/00-bootstrap.js` — removed Discover-only modal close IDs; retained shared bootstrap.
- `js/23-smart-search.js` — retained the existing search surface and safe product/feed behavior; removed only the call into the deleted Discover engine.
- `js/app/69-chat-groups.js` — retained group membership and group UI; removed Discover join/refresh hooks.
- `js/app/70-role-identity.js` — retained role badges/account identity; removed Discover-specific role matching/visibility code.
- `js/app/71-visual-dictionary.js` — retained Kamusi; renamed its shared sheet classes away from Discover naming.
- `js/app/73-group-soga.js` — retained Group Soga; renamed shared sheet classes.
- `js/app/78-chat-fix-blink.js`, `js/app/79-one-ui-at-a-time.js`, `js/app/81-absolute-one-ui-live.js`, `js/94-modal-stack.js` — retained Chat/Group/Order modal behavior while removing Discover-only branches.
- `css/29-nav-dict.css` — retained role/dictionary/shared sheet styling; removed Discover FAB and renamed shared sheet selectors.
- `css/27-visual-audit-fixes.css` — updated shared sheet selector names only.
- `tools/build_html.py` and `html/*.html` — kept the byte-exact HTML source/build contract synchronized after the intentional `index.html` change.
- `package.json` — removed deleted Discover tests from the aggregate test command.

## Preserved data and systems

No Firestore collection, product, service, user, seller, store, business, inventory, stock, order, delivery, transport, chat, group, live, ads, review, engagement, location, or payment data was deleted.

The following authoritative systems were not replaced or redesigned:

- Home
- Products
- Services
- Transport
- Chat and Groups
- Orders, Cart, Checkout
- SokoPay and escrow
- Delivery and custody
- Store and management modules
- Authentication and notifications
- Ads delivery/authoring
- Live/SokoPay dashboard paths

The Ads `discover` placement remains as dormant central delivery metadata because Ads is a shared system and no duplicate Ads engine was created. It has no active Discover UI surface after this removal.

## Potential dependencies intentionally preserved

1. Generic product/service/transport cards contain historical “discovery” terminology but are shared marketplace cards, not the removed Discover engine.
2. Firestore public-profile/group fields such as `discoverable` and `discovery` were preserved because they are data/privacy contracts, not Discover-owned data, and deleting them would alter authoritative user/group data.
3. Historical audit logs and `_old_fonts_project`/`assets` copies were not deleted; they are not active production imports. The active root production paths were removed.
4. Ads central placement metadata includes `discover`; it is intentionally dormant and preserved for future taxonomy/Ads architecture review.

## Verification

Passed:

- `npm test` — **146 passed, 0 failed** after removing obsolete Discover-only test contracts from the aggregate suite
- JavaScript syntax checks for all modified shared modules and updated test contracts
- `npm run check:html` — **CHECK OK**, byte-exact
- Active import scan — **0 missing imports**
- No active `index.html` import remains for the removed Discover modules/styles
- No active call remains from Smart Search into `skhDiscoverEngineOpen`
- No active Discover FAB/engine is created by the remaining one-UI modules

Preview/smoke status:

- Static HTTP preview started successfully on port 4173.
- Browser interaction and browser-console inspection were not automated in this environment; the source import scan and project contract suite passed.
- Recommended manual smoke-test remains: Home, Bidhaa, Huduma, Usafiri, Chat, Orders, Store, Management, Checkout, SokoPay, Delivery, and Authentication.

## Stop point

No replacement Discover engine, search engine, taxonomy, listing system, indexing, ranking, location discovery, or Quick Listing system was built.
The repository is intentionally stopped before Posting / Listing Taxonomy work.

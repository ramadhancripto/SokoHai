# SokoHai Discover — Phase 2 Audit, Implementation & Verification

**Date:** 22 September 2026  
**Scope:** Phase 2 only — search, filters, discovery foundation  
**Phase 3 status:** **Not started**. No Smart Auto-Match, event-alert automation, ML prediction, or complex personalization was added.

## Executive result

The existing Discover implementation was inspected and integrated rather than rebuilt as a new marketplace. One active Phase 2 overlay now consumes the existing Product, seller/public-profile, Huduma, Usafir, Chat/group, and canonical card systems. A database-free pure foundation owns normalized intent interpretation, canonical filter state, URL round-tripping, privacy projection, location validation, combined filtering/sorting, real loaded-result counts, and dynamic facets.

The focused Discover contract passes **25/25**, the full repository `npm test` command exits **0**, all application JavaScript passes syntax checking, generated HTML is byte-exact with its fragments, JSON parses, `git diff --check` passes, and Firestore rules compile in the Firestore emulator.

This is a verified **code/static/emulator-compilation foundation**, not a claim of browser, physical-device, live-data, or authenticated Firebase verification.

## 1. Pre-change audit findings

The audit found and mapped:

- Multiple Discover layers: source/ranking code in `75`, a second large UI in `88`, and a legacy patch layer in `91`.
- Static/decorative category and filter controls rather than one reusable filter state.
- No complete shareable Discover URL state.
- A fabricated Dar es Salaam coordinate fallback that made distance context appear available without permission.
- People search reading broad `users` documents and person presentation containing fields inappropriate for public discovery.
- Result counts and navigation that were not consistently driven by the actual loaded sections.
- Existing canonical Product, Service, Driver, seller-profile, Chat, and group entry points that had to remain the authorities.
- Bounded source pools and several internal catches that prevented the UI from reporting partial source failures.
- Existing Product Foundation eligibility/ranking primitives that could be reused instead of duplicated.

Relevant architecture reviewed included `00-bootstrap`, `23-smart-search`, `39-product-core`, `39-market-ranking`, `42-discovery-feed`, `68-chat-discover`, `69-chat-groups`, `75-discover-engine`, `88-discover-complete`, `91-discover-fixes`, script order, rules, and indexes.

## 2. Implemented Phase 2 foundation

### Intent and query normalization

`js/app/76-discover-foundation.js` now provides pure reusable helpers for:

- case/spacing/punctuation normalization without inventing stronger model variants;
- product, seller, service, business, group, people, and transport intents;
- confidence and multi-entity interpretations;
- price-language extraction (`under`, `below`, `chini ya`, ranges, `k/m` suffixes);
- Dar es Salaam, Arusha, Mwanza, Dodoma, Mbeya, Zanzibar, Morogoro, Tanga, Kilimanjaro, and Iringa place extraction;
- wholesale, offer, auction, and group-buy commercial-mode constraints;
- a preserved searchable text remainder.

### One canonical state and URL recovery

The canonical state covers:

- query;
- entity type;
- category and subcategory;
- brand;
- minimum and maximum numeric price;
- location and maximum distance;
- availability;
- condition;
- product type;
- sort.

The active UI serializes this using `discover=1` and `d_*` parameters and restores it on refresh. Clear filters preserves the original query. Individual active constraints are removable as chips.

### Search, navigation, counts, and empty handling

- The smart navigation is horizontally scrollable.
- Empty sections/tabs are hidden.
- Counts are calculated from actual bounded loaded arrays; they are not invented global catalog totals.
- Products, sellers, businesses, services, transport, groups, and people remain separate contexts.
- Offers, auctions, group buy, and wholesale are derived only from real Product fields/modes.
- Successful sections remain visible when another source reports an error.
- One empty source does not erase successful source results.

### Context-aware filters and sorting

Filters are generated from the loaded result facets and current entity context. Query and constraints are applied together. Implemented sorting includes relevance, newest, price ascending, price descending, nearby when valid location exists, and popular from real engagement fields.

### Existing systems reused

- Product cards: `skh.ProductPostCard`
- Service cards: `skh.ServicePostCard`
- Transport cards: `skh.DriverPostCard`
- Product eligibility: Product Foundation helper where available
- Product details and seller profiles: existing application entry points
- Chat: existing Chat entry point
- Groups: existing public group open/join flow
- Products/services/drivers: existing canonical feeds/caches plus bounded Firestore reads

No Discover order, payment, Chat, notification, Product, service, transport, or profile subsystem was created.

The obsolete runtime inclusion of `91-discover-fixes.js` was removed from the script manifest after conflict review. The file remains in the repository for history, but its global mobile selectors, mutation timers, and profile interception no longer compete with the active Phase 2 overlay.

### Paid content

Only a boost that passes the existing authentic `boostEligibility` helper is marked as promoted and receives the existing small ranking contribution. Promoted results are visibly labeled and do not replace the organic relevance calculation.

## 3. Location and privacy controls

### Location

- The fabricated Dar es Salaam fallback was removed.
- Valid distance context requires GPS, manual coordinates, or explicitly consented saved coordinates.
- Denied, fallback, invalid, or absent coordinates cannot activate nearby sorting/filtering.
- Region/city text filtering remains available without implying a precise distance.

### Public people/business projection

Discover now reads `publicProfiles`, not full `users` records. Opt-in settings publish a restricted projection and opt-out deletes it. Allowed public projection content is limited to public identity/commercial fields, region, selected interests, discovery flags, timestamps, and public aggregate counts. Orders, chats, private groups, email, phone, exact address, and private activity are not copied into this projection.

People are distinct from sellers. People rows do not open the broad seller account modal; they expose only their projected public context and the existing Chat action when appropriate.

Firestore rules now:

- validate top-level and nested `publicProfiles` keys/types;
- require owner/admin writes and matching projection UID;
- permit reads only for discoverable projections;
- expose only public/discoverable group headers to non-members;
- restrict `users` document creation/update to the document owner/admin rather than any signed-in user.

**Known broader issue:** the pre-existing global signed-in read permission for full `users` documents remains. Discover no longer consumes that rule, but complete platform-wide private/public user-document separation is outside this focused integration and remains security debt.

## 4. Source/query behavior

- Product fetching uses bounded reads and applies category server constraints when available.
- Query execution is debounced in the UI.
- Existing cached canonical pools are reused and merged/deduplicated with fresh bounded reads.
- Products respect publication/availability eligibility from Product Foundation.
- Services, transporters, public profiles, and public groups use their existing records and visibility states.
- Result IDs come from source records; generated fake entity IDs were removed.
- Media rendering remains delegated to canonical cards, which own their existing lazy-media behavior.

## 5. Verification performed

Detailed output: `DISCOVER-PHASE2-TEST-LOG.txt`

| Verification | Result |
|---|---:|
| Focused Discover Phase 2 contract | **25 passed, 0 failed** |
| Product Foundation contract during full regression | **18 passed, 0 failed** |
| Full repository `npm test` | **exit 0** |
| All `js/**/*.js` syntax checks | **exit 0** |
| HTML fragment/build equivalence | **pass** |
| `package.json` and `firestore.indexes.json` parsing | **pass** |
| `git diff --check` | **pass** |
| Firestore rules emulator compilation | **pass** |

The focused contract covers:

- exact/partial normalization and model-name preservation;
- product/seller/service/transport and commercial-mode interpretation;
- multi-constraint extraction;
- valid/invalid location behavior;
- privacy projection exclusions;
- query + price + location + availability combination;
- nearby gating;
- price/popular sorting;
- dynamic facets and actual-array counts;
- state/URL round-trip;
- canonical card reuse;
- horizontal count-driven navigation;
- chips, clear action, and mobile filter sheet;
- no fabricated location;
- public-profile rather than full-user reads;
- public-profile and public-group rule boundaries;
- owner-only user discoverability writes;
- partial-source metadata;
- absence of a Discover database or Phase 3 engine.

## 6. Verification not performed / remaining limitations

No claim is made for any of the following:

1. Physical-device testing, screenshots, actual small-phone behavior, browser-driven E2E, or screen-reader testing; no browser runtime was available.
2. Authenticated live Firebase reads/writes or production deployment.
3. Firestore rule semantics tests with authenticated mock users. The emulator compiled and loaded the rules, but no `@firebase/rules-unit-testing` suite exists yet.
4. Global catalog totals. Displayed counts are honest counts of bounded loaded results.
5. Full-catalog text-search scalability. Discover still aggregates bounded provider pools; it is not a dedicated search index.
6. True cursor-based load-more across every heterogeneous source. Bounded limits protect the current foundation, but cursor pagination remains future Phase 2 hardening.
7. Automated migration of users who opted into the old setting before `publicProfiles` existed. They must resave settings or be migrated by a separately reviewed trusted process.
8. Complete platform-wide removal of broad signed-in reads from `users`; doing that safely requires auditing every non-Discover profile consumer and potentially migrating more public fields.
9. Live index proof for every production data-shape/query combination. Current added queries avoid new composite combinations where practical; actual production index feedback was unavailable.
10. Authoritative global popularity where a source lacks engagement fields. Popular sorting only uses authentic fields that are present.

## 7. Phase boundary

Phase 3 must not start from this checkpoint automatically. Smart Auto-Match, event alerts, predictive ranking, and complex personalization remain intentionally absent. The next safe work is remaining Phase 2 hardening: authenticated rules tests, browser/device verification, true cursor pagination, production-index validation, opt-in projection migration design, and the broader `users` privacy split.

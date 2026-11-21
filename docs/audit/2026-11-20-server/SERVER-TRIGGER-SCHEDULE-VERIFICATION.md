# Trigger, schedule and HTTP verification (G-2)

**Test:** `tools/test_triggers_schedules_emulator.mjs`, **20/20 passed** in the final run (SERVER-FINAL-VERIFICATION). It is now part of `test:security:all:emulator` and `test:ci:emulator`.

**Method.** Every check uses the **exported** function object from `functions/index.js`, not the module helper:

- wiring is read from `fn.__endpoint`;
- Firestore triggers get `fn.run({ data: <real emulator snapshot | {before, after}>, params })`;
- schedules get `fn.run({})`, or `{scheduleTime}` where the handler reads it;
- HTTP functions get `fn(req, res)`.

All writes go to the Firestore emulator. PesaPal is a mocked `fetch`. FCM is a stubbed `admin.messaging()`.

## 1. Wiring (checked for all 22 by the first test)

| Export | Kind | Path / schedule | Region |
|---|---|---|---|
| `inventoryOrderCreated` | Firestore created | `orders/{orderId}` | europe-west1 |
| `inventoryOrderUpdated` | Firestore updated | `orders/{orderId}` | europe-west1 |
| `catalogSearchIndexProducts` | Firestore written | `products/{id}` | europe-west1 |
| `catalogSearchIndexServices` | Firestore written | `services/{id}` | europe-west1 |
| `pushOnNotification` | Firestore created | `notifications/{id}` | europe-west1 |
| `userCardSync` | Firestore written | `users/{docId}` | europe-west1 |
| `systemConfigAudit` | Firestore written | `system/{docId}` | europe-west1 |
| `announcementsAudit` | Firestore written | `announcements/{docId}` | europe-west1 |
| `adminMediaAudit` | Firestore written | `adminMedia/{docId}` | europe-west1 |
| `ordersAdminAudit` | Firestore written | `orders/{docId}` | europe-west1 |
| `productsAdminAudit` | Firestore written | `products/{docId}` | europe-west1 |
| `usersAdminAudit` | Firestore written | `users/{docId}` | europe-west1 |
| `pesapalReconcileSweep` | schedule | every 10 minutes (Africa/Dar_es_Salaam) | europe-west1 |
| `platformStatsHourly` | schedule | `0 * * * *` (Africa/Dar_es_Salaam) | europe-west1 |
| `sokopayAutoRelease` | schedule | `*/5 * * * *` (Africa/Dar_es_Salaam) | europe-west1 |
| `inventoryReservationSweep` | schedule | every 5 minutes | europe-west1 |
| `adsDeliverySweep` | schedule | every 60 minutes | europe-west1 |
| `deliveryOfferExpirySweep` | schedule | every 5 minutes | europe-west1 |
| `commerceModesSweep` | schedule | every 15 minutes | europe-west1 |
| `groupBuySweep` | schedule | every 15 minutes (UTC; interval schedule, so the zone has no effect) | europe-west1 |
| `pesapalIpn` | HTTP | `GET/POST` | europe-west1 |
| `sitemapXml` | HTTP | `GET` | europe-west1 |

## 2. Behaviour (one or more tests per export)

| Export(s) | What was proven on the emulator |
|---|---|
| `catalogSearchIndexProducts` / `Services` | a product/service write gets `searchTokens`; an unchanged rewrite is **not** rewritten (no trigger loop) |
| `userCardSync` | a **buyer**: the public card has no e-mail, phone or wallet. A **business** account publishes its contact number only as `businessPhone` (by design: buyers must reach sellers), still with no e-mail or wallet. Delete removes the card. |
| `inventoryOrderCreated` / `Updated` | with reservations ON, an order reserves stock (`ACTIVE`) and cancelling releases it |
| `pushOnNotification` | **off by default**: no send without `SKH_PUSH_ENABLED`. With it on, sends to both devices and prunes the dead token. |
| `systemConfigAudit` | `system/config` change → `admin_audit_log` row |
| `announcementsAudit` / `adminMediaAudit` | a stamped browser admin write is audited once; an unstamped server metrics write is **not** |
| `ordersAdminAudit` / `productsAdminAudit` / `usersAdminAudit` | an admin-signed edit of someone else's record → `*_CHANGED_BY_ADMIN`; the owner's own edit is not audited |
| `deliveryOfferExpirySweep` | an expired delivery offer becomes `expired` |
| `inventoryReservationSweep` | an `ACTIVE` reservation past expiry → `EXPIRED` |
| `platformStatsHourly` | `platform_stats/current` recomputed from `adminRevenue` |
| `commerceModesSweep` | an auction whose end time (milliseconds, as the client writes it) has passed is finalised (`ended`) |
| `groupBuySweep` | a campaign past its end below target → `failed`; a running one is untouched |
| `adsDeliverySweep` | the exported handler runs with no due campaigns and writes nothing. Its delivery logic is covered by `test_ads_delivery_engine` and `test_ads_local_delivery_regression` (npm test). |
| `sokopayAutoRelease` | a held order **without** a release date is **not** released early (no unintended escrow release) |
| `pesapalIpn` | acknowledges PesaPal (200) for every call, including an empty one. An **unpaid** transaction changes nothing. A **COMPLETED** deposit credits the wallet **once** after two IPNs. |
| `pesapalReconcileSweep` | an old open checkout reported COMPLETED is settled **once** (two sweeps). **PesaPal down** = left open (never marked paid without provider status). |
| `sitemapXml` | 200 XML; a sellable product is listed; an archived one is not |

**Backfills (production drift repair, SRV-04), idempotency on fixtures:**

| Callable | Proven |
|---|---|
| `adminBackfillUserCards` | super admin only (plain admin refused); creates missing cards; second run = same card; never copies e-mail or wallet; user data untouched |
| `adminSearchBackfill` | admin only; server lease (`system_locks/search_backfill`): start → continue with `runId` until `done`; a **parallel second start is refused** (`already-exists`); fills missing tokens; second run changes nothing (`searchIndexedAt` unchanged); price and stock untouched |
| Opening stock | no backfill callable exists by design. `inventoryAdjust OPENING_BALANCE` is once per stock record: `test_inventory_reservation_emulator` "R27" proves that a second opening with a new key is refused. |

## 3. Defects and test corrections found while finishing G-2

| Finding | Kind | Resolution |
|---|---|---|
| `platformStatsHourly` uses cron form `0 * * * *` | test assumption | the wiring check accepts cron and "every N" forms |
| `userCardSync` published the phone of a user with `businessName` | **by design** (`isBusinessAccount` → `businessPhone`) | the test now proves both cases. **Owner note:** a user who only types a business name has their phone shown publicly as the business contact. |
| `admin.messaging` is a getter | test mechanics | stubbed with `Object.defineProperty` |
| auction fixture used an ISO end time | test fixture | the client writes milliseconds (`08-app-state.js`); the fixture now matches |
| fake `res` lacked `type()`/`end()` | test mechanics | added |
| `adminSearchBackfill` returned `already-exists` | **correct behaviour** (one run at a time) | the test now follows the lease protocol and asserts the refusal |
| `sitemapXml` swallowed read errors silently | logging gap | `logBestEffort('sitemapXml.read', e)`. Behaviour unchanged: it still returns the home URL. |

## 4. What the emulator cannot prove (STAGING)

- Cloud Scheduler actually invoking each schedule (IAM, time zone, retry). Check *Last run* in Cloud Scheduler after 1 h.
- Eventarc delivery of Firestore events: at-least-once and duplicates. The handlers are idempotent in the tests above; on staging, confirm one card/token write per change in the logs.
- `pesapalIpn` reachable from PesaPal's servers, plus sandbox IPN registration (SERVER-STAGING-READINESS §3.4).
- Real FCM delivery to a device.
- Composite indexes used by the sweeps (the emulator does not enforce them).

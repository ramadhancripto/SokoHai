# SokoHai canonical Ads Delivery & Rotation Engine

## Architecture

- **Campaign source:** the existing Firestore `announcements` collection. No parallel campaign collection or placement-specific engine was added.
- **Server authority:** `functions/ads-delivery.js` requests candidates, validates lifecycle/targeting/protected contexts, enforces caps/cooldowns, creates a short-lived lease, and records delivery events. Pure rules live in `functions/ads-delivery-core.js` so the same implementation is testable without Firebase.
- **Client authority:** `js/app/96-ad-delivery-controller.js` is the one slot controller. It lazy-requests, renders through `window.skhAdvertisementCardHtml`, observes viewport/viewability, rotates temporary leases, and fails open. Each request has a scoped idempotency key so callable retries reuse a live lease instead of creating duplicate reservations.
- **Creative authority:** existing shared Ads Design Rules, Creative Model, validation, renderer, Basic/Advanced publish pipeline, and preview remain the source of truth. The delivery projection only returns the fields the existing renderer needs.
- **Functions exports:** `adsRequestDelivery`, `adsTrackDeliveryEvent`, `adsUpdateCampaignDelivery`, `adsDeliverySweep`, plus the existing shared Creative callables.

## Placement map

| Key | Current host / adapter | Safety boundary |
|---|---|---|
| `home` | `#topAnnouncement` in `html/16-topnav.html` | Selection and rotation are server-leased; live system notices temporarily protect the slot. |
| `discover` | Discover home renderer in `js/app/75-discover-engine.js` | Contextual, lazy slot. |
| `search` | Search results renderer in `js/app/75-discover-engine.js` | Receives sanitized query/category context. |
| `product_detail` | `#pmAdSlot` after related products | Placed below commerce actions. |
| `service_detail` | Same product-showcase host, keyed for services | Placed below commerce actions. |
| `auction` | Product-showcase adapter when `saleMode === 'auction'` | Below the auction/transaction controls. |
| `group_buy` | Product-showcase adapter when `saleMode === 'group_buy'` | Below the existing group-buy controls. |
| `price_drop` | Product-showcase adapter when `saleMode === 'price_drop'` | Below the existing deal controls. |
| `chat` | Chat **inbox only** in `html/06-modals-social.html` | Never inserted into messages, negotiation, order, or payment flows. |
| `groups` | `#gsgAdSlot` in group modal | Enabled only for `PERMANENT_COMMUNITY`; organic group announcements remain in `#gsgAnnounce`. Commerce groups stay protected. |
| `dashboard` | Buyer Dashboard overview rendered in `js/app/28-buyer-engagement.js` | Not inserted into SokoPay, order, account-security, or Admin views. |
| `live` | Supported by the central placement contract, but no current commercial slot adapter | The existing Live/system-alert host is protected and remains non-commercial. A future ordinary Live-content slot can opt in explicitly. |
| future keys | Accepted when matching `^[a-z][a-z0-9_]{0,47}$` | Still subject to the same central targeting, lifecycle, frequency, and protected-context rules. |

## Campaign document contract

The existing announcement projection remains backward compatible. New delivery metadata is additive:

```js
{
  campaignType: 'business' | 'product' | 'service' | 'event' | 'announcement' |
                'promotion' | 'partnership' | 'community' |
                'sokohai_announcement' | 'other',
  placements: ['home', 'search'], // omitted legacy field defaults to ['home']
  lifecycleStatus: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived',
  startAt: 'ISO timestamp',
  endAt: 'ISO timestamp',
  targetCategories: ['footwear'],
  targetKeywords: ['running'],
  targetRegions: ['dar_es_salaam'],
  targetEntityTypes: ['product'],
  targetEntityIds: ['public-entity-id'],
  goals: { dailyImpressions: 100, totalImpressions: 1200 }
}
```

The engine also accepts the existing `status`, `active`, `archived`, `moderationStatus`, `startAt`, and `endAt` fields. Legacy announcements without placement metadata remain Home-only rather than unexpectedly appearing in Chat/Groups/commerce pages. Daily/total impression goals count **viewable** deliveries, not requests or renders. Daily goals pause for the configured local day and become eligible again on the next day; total-goal, expiry, and scheduled-state transitions are resolved by the engine and hourly sweep.

**Admin delivery controls:** the Admin announcement manager now has a per-campaign **Delivery** action. It writes additive campaign type, placement, targeting, daily/total viewable-goal, and active/paused settings through the Admin-only `adsUpdateCampaignDelivery` callable. This is a post-creation delivery-settings panel, not a second creative editor or publication pipeline: Basic and Advanced still share `creativeSaveDraft`/`creativePublish`, schedule dates, validation, and the Creative Model. Replacing an existing announcement through that shared publish path carries its campaign delivery metadata forward and preserves an explicit paused state. Drafts may receive delivery metadata from the Drafts view, but remain non-serving and cannot be activated here; the shared `creativePublish` replacement path carries those fields onto the authoritative published announcement. Moderation-pending campaigns may also receive metadata but cannot be activated here. Archived campaigns are read-only, while expired/total-goal-completed campaigns remain closed. Existing schedule, priority, and duration fields are unchanged. Custom future placement keys are saved centrally but will not render until a host adapter is added.

## Central configuration

Read `/system/adsDelivery` (Admin-write-only under the existing `/system/{doc}` rule). If the doc is absent/unavailable, the engine applies safe defaults from `functions/ads-delivery-core.js`.

```js
{
  timezone: 'Africa/Dar_es_Salaam',
  frequency: { session: 5, hour: 12, day: 30, maxActiveLeases: 3 },
  cooldowns: {
    globalGapMs: 30000,
    advertiserMs: 3600000,
    creativeMs: 900000,
    dismissedCreativeMs: 86400000
  },
  fatigue: { viewWeight: 0.12, dismissWeight: 0.45, decayMs: 86400000, suppressionThreshold: 0.82, max: 1 },
  viewability: { threshold: 0.5, durationMs: 1000 },
  lazy: { rootMarginPx: 400, requestThrottleMs: 5000 },
  rotation: { defaultSeconds: 15, minSeconds: 5, maxSeconds: 59 },
  lease: { ttlMs: 300000 },
  state: { sessionRetentionDays: 30, anonymousRetentionDays: 30 },
  analytics: { retentionDays: 90 }
}
```

Values are centrally clamped in the policy module. Placement files contain no delivery-policy magic numbers.

## Delivery state and analytics

- `adDeliveryState/{hashed-user}/adDeliverySessions/{hashed-session}` stores frequency history, active reservations, advertiser/creative cooldowns, dismissal memory, and fatigue. Raw user IDs and session tokens are not stored. Per-session state expires after 30 days; anonymous parent state also expires after 30 days, while authenticated user-level cooldown state is retained.
- `adDeliveryLeases/{random-lease}` stores placement/campaign ownership and expiry; abandoned reservations are ignored after lease expiry and pruned on subsequent selection. `firestore.indexes.json` declares TTL on `expiresAt`.
- `adDeliveryMetrics/{campaignId}` stores aggregate counters and the current daily viewable count used for pacing/goals.
- `adDeliveryEvents/{deterministic-hash}` stores distinct `requested`, `loaded`, `rendered`, `entered_viewport`, `viewable`, `clicked`, `dismissed`, and `lease_released` events. Event docs carry `expireAt`; `firestore.indexes.json` declares TTL for automatic 90-day deletion.
- Browser writes to all new state/metrics/event paths are denied in `firestore.rules`. The old `creativeTrackEvent` remains available for legacy/preview actions; the Home controller no longer records render as an impression.

## Fail-open and media behavior

No eligible campaign returns `{status:'NO_ELIGIBLE_AD', code:'NO_ELIGIBLE_AD', reasonCodes:[...]}`. Protected contexts receive no campaign. Network, renderer, analytics, observer, or campaign-read failures leave the underlying marketplace/chat/checkout UI usable. Video continues to use the canonical poster-first renderer and only plays after a user gesture; delivery does not autoplay audio.

## Verification

Run `node tools/test_ads_delivery_engine.mjs` for 40 focused checks spanning the 28 acceptance areas plus Admin metadata controls (lifecycle, targeting, protected contexts, caps/cooldowns/fatigue, pacing, leases/diversity, lazy loading, viewability, dismissal, video, failures, shared renderer/model, compatibility, and analytics separation). No Firebase deployment or scheduled-function deployment is implied by local tests.

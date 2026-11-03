# SokoHai Ads — Offline Outbox (tangazo halipoteyi)

**Tarehe:** 2026-11-01 · **Tawi:** `improve/phase1-audit-upload-fix`

## Kwa nini

Mtumiaji: *"inagoma kupost pia kwann"* na *"kama itawezekan kuweka kwenye system kisha
itakwenda badae kweny serva"*.

Uchunguzi: upande wa mteja (studio → `persistCreative` → `creativePublish`) unafanya kazi.
Kizuizi halisi cha server ni kwamba **`functions/creative.js` haijasambazwa** (deploy) —
toleo lililo hai linatumia `ENTITY_COLLECTIONS` ya collection moja, hivyo transport/haulinganishwa
na listing. Lakini mtumiaji hakupaswa kupoteza tangazo lake kwa sababu ya hilo.

## Nini kimeongezwa (mteja pekee — hakuna mabadiliko ya kanuni za server)

1. **`submitCampaign` inashusha kwa upole.** Ikishindwa kwa sababu ya mtandao/server
   (`unavailable`, `failed to fetch`, `timeout`, `unauthenticated`), creative **nzima**
   inahifadhiwa kwenye kifaa (`localStorage: skh_ads_outbox_v1`) na mtumiaji anarudishwa
   kwenye *Kampeni zangu* akiambiwa wazi: *"tangazo limehifadhiwa kwenye kifaa chako na
   litatumwa server ikipatikana."*
2. **Kipengele "Zinasubiri kusambazwa"** juu ya orodha ya kampeni: kila tangazo lililohifadhiwa
   linaonyesha kichwa, aina, tarehe, idadi ya majaribio, na vitufe *Tuma sasa* / *Ondoa*.
3. **Usambazaji wa kiotomatiki:** tukio la `online`, `skh:auth-ready`, na kufungua studio/kampeni
   kunasambaza foleni kimya kimya. Kila kimoja kinapitia `creativePublish` **kama kawaida** —
   idhini ya SokoHai na RBAC hazibadilishwi.
4. **Makosa ya kudumu yanazuiwa:** `permission-denied`, `invalid-argument`, `failed-precondition`,
   `not-found` → hali `blocked` (haisambazwi mara kwa mara, inaonyesha *Jaribu tena*).
   Makosa ya mtandao yanabaki `pending`.
5. **Mipaka:** upeo wa vitu 20 kwenye foleni; kila kipengele ni cha mtumiaji huyo huyo
   (funguo moja kwa kifaa, `uid` inahitajika kabla ya kusambaza).

## Mabadiliko ya faili

| Faili | Mabadiliko |
|---|---|
| `js/app/101-marketplace-ads-studio.js` | `outboxRead/Write/Store/Remove/Update`, `flushOutbox`, `outboxAutoFlush`, `outboxHtml`, `readableError` (unaohusu mtandao), `submitCampaign` catch, vitendo `flush-outbox`/`outbox-retry`/`outbox-delete` |
| `css/43-marketplace-ads-studio.css` | `.mas-outbox`, `.mas-row.outbox`, hali ya `blocked`, mobile wrap |
| `functions/creative.js` | **Tayari ilikuwa imebadilishwa lakini HAijasambazwa** — `ENTITY_COLLECTIONS` sasa ni arrays, `transport:['delivery','drivers']`, first-wins lookup. Ongeza hii kwenye deploy yako. |
| `tools/test_ads_outbox.mjs` | Mtihani mpya 12/12 (offline → foleni → online → flush, blocked, cleanup) |

## Matokeo ya vipimo

```
test_ads_outbox                   12/12 passed
test_creative_no_undefined        12/12 passed
ads_studio_rebuild_verify         74/74 passed
test_creator_studio_upgrade       ALL PASS
test_creative_system              ALL PASS
```

## Hatua inayofuata (inahitaji idhini yako)

1. `firebase deploy --only functions:creative` ili `creativePublish` ya server ipokee
   `ENTITY_COLLECTIONS` mpya. **Bila hii, tangazo la Usafiri linaweza kuzuiwa upande wa server** —
   outbox italiweka salama, lakini halitasambazwa hadi function isambazwe.
2. Uthibitisho wa UI halisi: `node tools/dev_server.mjs 8080` → `http://localhost:8080/`.

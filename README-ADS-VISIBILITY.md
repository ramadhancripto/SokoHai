# SokoHai — Matangazo Yanaonekana Sokoni (kipaumbele)

**Tarehe:** 2026-11-01 · Tawi: `improve/phase1-audit-upload-fix`

## Kwa nini yalibaki kwenye Creator Studio tu (chanzo halisi)

Bomba lilikuwa limekatika sehemu MOJA:

1. `functions/creative.js` → `creativePublish` inaweka `moderationStatus:'pending'` kwa kila
   mchapishaji asiye admin.
2. `functions/ads-delivery-core.js:266` inakataa tangazo lenye moderation isiyo `approved`
   (`MODERATION_NOT_APPROVED`) — hivyo hakuna slot inayojazwa.
3. **Hakuna mahali popote pa kuidhinisha.** Hakuna ukurasa wa admin, hakuna callable.
   Kwa hiyo kila tangazo linabaki "Inasubiri idhini" **milele**.

Kuongeza: slot ya feed ilikuwa inaingizwa **baada ya bidhaa ya 5**, na gridi yenye
bidhaa chini ya 6 ilikataliwa kabisa — hivyo hata tangazo lililoidhinishwa lingeonekana
kwa shida.

## Kilichofanywa

### 1. Idhini (iliyokosekana kabisa)
| Faili | Mabadiliko |
|---|---|
| `functions/creative.js` | callable mbili mpya: `creativeModerationQueue` (orodha ya yanayosubiri) na `creativeModerate` (approve/reject + audit: `moderatedAt`, `moderatedBy`, `moderationNote`) — zote **admin pekee** kwa `isAdmin` ile ile iliyopo |
| `functions/index.js` | exports mbili zimeongezwa |
| `js/app/101-marketplace-ads-studio.js` | sehemu mpya **"Idhini"** kwenye nav — inaonekana kwa admin tu; foleni + vitufe *Idhinisha* / *Kataa* |

Kuidhinisha: `moderationStatus: approved`, `status: published`, `active: true` kwenye
`creatives`, `announcements` na `creativePublications`. Kukataa: `rejected` + sababu.

### 2. Kipaumbele kwenye UI (ombi lako)
| Mahali | Kabla | Sasa |
|---|---|---|
| Feed ya nyumbani | baada ya bidhaa ya 5 | **nafasi ya KWANZA**, kabla ya bidhaa ya kwanza |
| Gridi ndogo | ilikataliwa chini ya bidhaa 6 | inaruhusiwa kuanzia bidhaa 2 |
| Nyongeza | — | **badge ndogo** kwenye *Dashibodi* na *Mazungumzo* (`js/app/103-ad-badges.js` + `css/41-ads-marketplace.css`) |

Badge ni mstari mmoja (74–90 px): picha 56 px, jina la mfanyabiashara, `SPONSORED`,
kichwa cha tangazo, na kitufe cha kufunga. Haisimami kazi ya mtumiaji na haichukui
skrini — mtiririko unaendelea.

### 3. Kanuni zilizotunzwa
- **Hakuna injini ya pili:** badges zinaingia kwenye `skhAdDeliveryController` ile ile
  (`data-skh-ad-slot`), hivyo targeting, frequency, leases na tracking hazibadiliki.
- **Hakuna renderer ya pili:** badge inatumia kadi ile ile ya mfumo (`skh-ann-card`);
  tunaibana kwa CSS tu.
- **Maeneo yaliyolindwa** (admin, checkout, malipo, wallet, escrow, usalama) hayapati badge.
- **Hakuna kipimo kinachobuniwa** — hakuna impressions/reach/clicks za kubuni.
- Tangazo moja halionekani mara mbili kwenye skrini moja (dedupe iliyopo inaheshimiwa).

## Vipimo vilivyoendeshwa

```
test_ads_visibility             18/18 passed   (mpya: nafasi ya juu, badges, idhini, RBAC)
test_ads_outbox                 12/12 passed
test_product_publish_outbox     15/15 passed
ads_studio_rebuild_verify       74/74 passed
test_creative_no_undefined      12/12 passed
ads_phase1_verify               30/30 passed
bottom_nav_verify               12/12 passed
```

## Kinachohitaji wewe

1. **`firebase deploy --only functions:creative,functions:index`** — bila hii,
   `creativeModerationQueue`/`creativeModerate` hazipo kwenye server na kila tangazo
   litaendelea kubaki "Inasubiri idhini". Sehemu ya *Idhini* itasema wazi kuwa huduma
   haijasambazwa (haitaleta kosa la kuficha).
2. Baada ya deploy: fungua Ads Studio → **Idhini** → *Idhinisha*. Tangazo litaingia
   sokoni mara moja, juu ya feed, na badge kwenye dashibodi/chat.

## Picha
`audit-shots/ads-feed-top.png` · `audit-shots/ads-badges.png` · `audit-shots/ads-moderation-queue.png`

# SokoHai — Pakiti ya Marekebisho · 2026-11-01

Pakiti moja yenye marekebisho yote ya kipindi hiki. Kila faili hapa ni la mwisho
(lililojaribiwa), si rasimu.

---

## 1. Matangazo yanabaki Creator Studio tu — SABABU ILIYOPATIKANA

Bomba lilikuwa limekatika sehemu MOJA, na sehemu hiyo ilikuwa **haipo kabisa**:

| Hatua | Hali |
|---|---|
| `creativePublish` (server) | inaweka `moderationStatus:'pending'` kwa kila mfanyabiashara asiye admin |
| `ads-delivery-core.js:266` | inakataa tangazo lisilo `approved` → `MODERATION_NOT_APPROVED` |
| **Idhini** | **hakuna ukurasa, hakuna callable — haipo kabisa** |

Matokeo: kila tangazo linabaki *"Inasubiri idhini"* milele → hakuna nafasi inayojazwa →
linaonekana kwenye studio pekee.

**Iliyorekebishwa:**
- Sehemu mpya **Idhini** kwenye Ads Studio (admin pekee): foleni + *Idhinisha* / *Kataa* + audit.
- Callable mbili mpya: `creativeModerationQueue`, `creativeModerate` (`functions/creative.js`).
- Tangazo sasa linaingia **juu kabisa ya feed** (nafasi ya kwanza), gridi ndogo inaruhusiwa kuanzia bidhaa 2.
- **Badge ndogo** kwenye Dashibodi na Mazungumzo (`js/app/103-ad-badges.js`).

## 2. Kuchapisha bidhaa inagoma

Chanzo: `js/app/61-full-system-repair.js` ilifuta `opts` na **ilirudia kuandika kwa kila kosa**
(ikiwemo ruhusa na mtandao) — ndiyo ilizalisha bidhaa za nakala na makosa yasiyoeleweka.

**Iliyorekebishwa:** `opts` inapita; kurudia kunafanyika kwa `undefined` pekee; mtandao ukianguka
bidhaa inahifadhiwa kwenye kifaa (`js/app/102-publish-outbox.js`) na kusambazwa baadaye kwa
`clientId` ile ile (hakuna nakala); ujumbe wa Kiswahili badala ya Kiingereza ghafi.

## 3. Firestore `undefined` (kurasa nyeupe / kosa la kuandika)

`shared/ads-design-rules.js` + nakala yake `functions/shared/ads-design-rules.js` (lazima
zibaki **byte-identical**): `durationAuto` sasa ni boolean kila wakati, `basicType` inaondolewa
ikiwa haijulikani, pamoja na `skhStripUndefined()` kwenye mwendo mmoja wa kuandika.

---

# SHIDA YA `internal` — ni nini hasa

`internal` ni kosa la Firestore/Functions lenye code `internal` (HTTP 500). Maana yake:
**Cloud Function ilianza kukimbia kisha ikakwama**, au **haipo kwenye server**.

Kwa mpangilio wa uwezekano **kwenye mradi huu**:

| # | Sababu | Dalili | Jinsi ya kuthibitisha |
|---|---|---|---|
| 1 | **Function haijasambazwa** (au toleo la zamani linaendelea) | `internal` au `not-found` mara ya kwanza kabisa | `firebase functions:list` — angalia `creativeModerate`, `creativeModerationQueue` zipo |
| 2 | **Server ina toleo la zamani** la `creative.js` (`ENTITY_COLLECTIONS` ya collection moja) | tangazo la Usafiri linashindwa, mengine yanapita | `firebase deploy --only functions` |
| 3 | **Firestore index/ruhusa haipo** kwa query mpya | `internal` ikiwa na `FAILED_PRECONDITION` kwenye logs | `firebase functions:log` → tafuta stack trace |
| 4 | **Thamani `undefined`** inaandikwa na server | `internal` / "Unsupported field value" | logs za function; marekebisho ya §3 yanashughulikia upande wa client |

### Hatua moja ya kuthibitisha (bila kufungua logs)

Fungua app, bonyeza `F12` → Console, bandika hii, kisha bofya Enter:

```js
(async () => {
  const f = window.skh && window.skh.callFunction;
  if (!f) return console.log('skh.callFunction haipo — fungua ukurasa wa SokoHai kwanza');
  const names = ['creativeModerationQueue', 'creativePublish', 'adsRequestDelivery', 'inventoryAdjust'];
  for (const n of names) {
    try { await f(n, {}); console.log(n, '→ OK (imesambazwa)'); }
    catch (e) { console.log(n, '→', e && (e.code || e.name), '|', (e && e.message) || e); }
  }
})();
```

Jinsi ya kusoma jibu:

| Jibu | Maana |
|---|---|
| `invalid-argument` / `permission-denied` | **Function ipo na inafanya kazi** (ilikataa tu data tupu) ✅ |
| `internal` | Function ipo lakini **imekwama ndani** → `firebase functions:log` onyesha sababu halisi |
| `not-found` / `unimplemented` | **Function haijasambazwa** → `firebase deploy --only functions` |
| `unavailable` | Mtandao/CORS — sio kosa la msimbo |

### Amri za kusambaza (ndani ya folda `SokoHai/`)

```bash
firebase deploy --only functions
# au kwa uchache (haraka):
firebase deploy --only functions:creativePublish,functions:creativeModerate,functions:creativeModerationQueue
```

Kumbuka: `functions/creative.js` na `functions/index.js` **zote** zinahitajika;
`functions/shared/ads-design-rules.js` lazima iwe sawa kabisa na `shared/ads-design-rules.js`.

---

## Faili zilizomo

**Client:** `js/app/00-bootstrap.js`, `08-app-state.js`, `30-seller-products.js`,
`61-full-system-repair.js`, `95-creative-studio.js`, `99-ads-marketplace.js`,
`101-marketplace-ads-studio.js`, `102-publish-outbox.js` *(mpya)*, `103-ad-badges.js` *(mpya)*,
`index.html`, `css/41-ads-marketplace.css`, `css/43-marketplace-ads-studio.css`

**Server:** `functions/creative.js`, `functions/index.js`, `functions/shared/ads-design-rules.js`,
`shared/ads-design-rules.js`

**Vipimo:** `tools/test_ads_visibility.mjs`, `test_ads_outbox.mjs`,
`test_product_publish_outbox.mjs`, `test_creative_no_undefined.mjs`

## Matokeo ya vipimo (viliendeshwa kweli)

```
test_ads_visibility           18/18
test_ads_outbox               12/12
test_product_publish_outbox   15/15
test_creative_no_undefined    12/12
ads_studio_rebuild_verify     74/74
ads_phase1_verify             30/30
bottom_nav_verify             12/12
```

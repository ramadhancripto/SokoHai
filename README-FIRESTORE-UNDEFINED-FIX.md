# "Imeshindwa kutuma tangazo" — Firestore `undefined` fix

## Kosa
```
Function addDoc() called with invalid data. Unsupported field value:
undefined (found in field durationAuto in document creatives/…)
```

## Chanzo
Firestore **haitakiwi** kupokea `undefined` kwenye hati. Katika `shared/ads-design-rules.js`,
`normalizeCreative()` ilihesabu:

```js
durationAuto: … : fallback.durationAuto,
basicType:  … : fallback.basicType
```

Lakini `createCreative()` (msingi/fallback) **haito** uwanja huo — kwa hiyo thamani ilikuwa
`undefined` na kuandikwa moja kwa moja kwenye `creatives`.

Nimepima kwa build halisi: creative ya Ads Studio ilikuwa na **majedwali mawili** yenye
`undefined` — `durationAuto` **na** `basicType`. Kurekebisha moja tu kungeliweka kosa
kwenye lingine.

## Marekebisho (tabaka tatu)

### 1. Chanzo — `shared/ads-design-rules.js` (+ `functions/shared/…` sawa kabisa)
- `durationAuto` sasa ni **boolean KILA MARA** (kamwe `undefined`).
- Mantiki ya kuhesabu `duration` **haijabadilika**: inahesabiwa upya pale tu ambapo
  awali `durationAuto` ilikuwa `true` kwa uwazi (`autoDurationExplicit`).
  Hii ni muhimu: toleo la kwanza la marekebisho liliharibu `duration` (10 → 9) —
  `tools/test_creator_studio_upgrade.mjs` ilikamata, na nikarekebisha.
- `basicType` huondolewa kabisa kama haijulikani (kama `design` inavyofanyika).

### 2. Kinga kwenye mahali pa kuandika
`js/app/95-creative-studio.js` → `persistCreativeDraft()` ndiyo njia **moja** inayotumiwa na
studio zote tatu (Basic admin, Advanced, Marketplace Ads). Kila andiko sasa linapita
`skhStripUndefined()`:
- `undefined` huondolewa (ndege/ndani ya array pia)
- `null` inabaki (Firestore inaruhusu)
- `Date` / `Timestamp` / `FieldValue` haziguzwi

`js/app/101-marketplace-ads-studio.js` ina kinga hiyo hiyo kwa njia yake ya kuandika.

### 3. Mtihani wa kudumu
`tools/test_creative_no_undefined.mjs` — inaiga Firestore kali na kuandika creative za aina
zote (`product`, `service`, `transport`, `general`).

## Uthibitisho

| Kipimo | Matokeo |
|---|---|
| Umbo la zamani (kwa kosa lile lile) | `REJECTED → Unsupported field value: undefined (found in field durationAuto)` |
| Umbo la sasa | `WROTE` |
| Creative za aina zote 4 zinazoandikwa kwa Firestore kali | zote `OK`, `undefined` **0** |
| `duration` ya media iliyowekwa wazi | haibadilishwi (10 → 10) |
| `test_creative_no_undefined` | **12/12** |
| `test_creator_studio_upgrade` | PASS |
| `test_creative_system` | PASS |
| `test_unified_ad_designer` | 146/146 |
| `test_noncanvas_ad_designer` | 56/56 |
| Ads Studio / welcome name / bottom nav / marketplace / card parity | 74 · 7 · 12 · 30 · 18 — zote PASS |

## Kufunga
```
copy shared/ functions/shared/ js/app/ juu ya mzizi wa mradi
node tools/build_dist.mjs
```
**Kumbuka:** `shared/ads-design-rules.js` na `functions/shared/ads-design-rules.js` lazima
zibaki **sawa kabisa** (nimehakikisha kwa `diff`). Ukibadilisha moja, badilisha nyingine.

# Welcome modal — jina la mtumiaji (fix)

## Tatizo
Sehemu ya kukaribisha ilikuwa inaonyesha **"MTUMIAJI"** badala ya jina la mtu, hata kama amejisajili.

## Chanzo halisi
Kipengele cha jina lilikuwa na sifa ya tafsiri:

```html
<h2 id="welcomeName" data-i18n="onboard_user">Mwanachama</h2>
```

`onboard_user` kwenye kamusi ni `MTUMIAJI` / `USER`. Mlolongo ulikuwa hivi:

1. `63-audit-fixes.js` (600ms) inavuta jina halisi na kuliandika — **sahihi**.
2. `24-ui-final.js` (700ms) inawasha `MutationObserver` + `LMS.setLanguage()`.
3. `apply()` inaona `data-i18n="onboard_user"` → **inaandika "MTUMIAJI" juu ya jina**.
4. Kila mabadiliko ya DOM yalirudia hatua ya 3 — hivyo jina lilifutwa daima.

Kwa maneno mengine: mfumo wa tafsiri ulikuwa unafuta utambulisho wa mtumiaji.

## Suluhisho
Jina ni **thamani ya utambulisho, si lebo ya lugha**:

1. `index.html` + `html/03-modals-core.html` — `data-i18n="onboard_user"` imeondolewa, nafasi yake `data-no-i18n="1"` (i18n inaheshimu sifa hii tayari).
2. `js/app/63-audit-fixes.js`:
   - `writeWelcomeName()` — njia moja ya kuandika jina; inahakikisha `data-no-i18n` na kuondoa `data-i18n` kama ipo.
   - `guardWelcomeNameEl()` — `MutationObserver` ndogo kwenye kipengele hicho pekee; kitu kingine kikianika jina, jina la mtumiaji linarejeshwa.
   - Uchaguzi wa jina umepanuliwa: `fullName` → `displayName` → `name` → **`firstName + lastName`** → `storeName`/`shopName`/`businessName`/`sellerName`/`userName` → sehemu ya barua pepe.
   - Sifa zinazokataliwa kama "jina": `MTUMIAJI`, `USER`, `Mwanachama`.
   - `sokohai:languageChanged` → jina linarejeshwa baada ya kila kubadilisha lugha.
   - `skh:auth-ready` → mtumiaji akimaliza kuingia, jina linavutwa upya kama welcome iko wazi.
   - `window.skhRefreshWelcomeName()` — kurudisha kwa mkono (tests / skrini nyingine).

## Matokeo

| Hali | Kabla | Sasa |
|---|---|---|
| Mgeni (hajaingia) | `MTUMIAJI` | `Mgeni` |
| Amejisajili (fullName) | `MTUMIAJI` | `Amina Hassan` |
| Ana jina la kwanza + la mwisho pekee | `MTUMIAJI` | `Rehema Salum` |
| Akaunti ya barua pepe pekee | `MTUMIAJI` | `baraka.mwakyusa` |
| Muuzaji mwenye jina la duka pekee | `MTUMIAJI` | `Duka la Bahari` |
| Akibadilisha lugha EN/SW | jina linafutwa | jina linabaki |

## Uthibitisho
`node tools/test_welcome_name_contract.mjs` → **7/7**
(hiari: inahitaji `dist/` + server kwenye 8080)

Regressions: Ads Studio **74/74**, bottom nav **12/12**, marketplace **30/30**, card parity **18/18**.

Screenshots: `audit-shots/welcome-name-signedin.png`, `audit-shots/welcome-name-guest.png`

## Kufunga
Nakili faili hizi juu ya mzizi wa mradi, kisha:
```
node tools/build_dist.mjs
node tools/dev_server.mjs 8080
```

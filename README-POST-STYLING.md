# SokoHai — Muonekano wa ndani ya matangazo (styling)

**Tarehe:** 2026-11-01 · Tawi: `improve/phase1-audit-upload-fix`

## Matatizo yaliyopimwa kabla (kadi 237 px kwenye gridi ya bidhaa)

| # | Tatizo | Ushahidi |
|---|---|---|
| 1 | Jina la mfanyabiashara lilikatwa haraka | `Duka la K…` — monogram ilikuwa inaiba 22 px |
| 2 | "SPONSORED" lilikuwa na uzito zaidi kuliko jina | chip ya dhahabu, herufi kubwa, yenye mpaka |
| 3 | **Bei haikuonekana kabisa** | `offerW: 90px` lakini maandishi yalikatwa: `TSh 35,0…` |
| 4 | CTA `Tembelea` ilikuwa kama kiungo, si kitufe | `ctaClass: null` kwenye hali ya kawaida |
| 5 | Urefu wa kadi uliyumbishwa na maudhui | 297–346 px kwa tangazo moja |
| 6 | Tangazo la maandishi tu lilikatwa | kichwa + bei + CTA vilikatwa nusu |

Chanzo cha #4: renderer inachora `<span class="skh-ann-no-cta">` (maandishi) badala ya
kitufe ikiwa tangazo halina kiungo. Pia `priceTag` (si `offer`) ndiyo uwanja unaosomwa.

## Suluhisho — mpangilio mmoja thabiti wa sehemu nne

```
┌─────────────────────────────┐
│ Brand                 SPONSORED │   kichwa cha utambulisho
├─────────────────────────────┤
│        picha 168 px         │   urefu SAMA kwa kadi zote
├─────────────────────────────┤
│ Kichwa cha tangazo (mistari 2) │
│ Maelezo (mistari 2)         │   nafasi iliyotengwa mapema
├─────────────────────────────┤
│ TSh 35,000      (Tembelea →) │   bei kushoto, CTA kulia
└─────────────────────────────┘
```

- **Brand:** monogram imeondolewa kwenye kadi ndogo → jina kamili linaonekana.
- **Sponsored:** chip ndogo ya kijivu, herufi ndogo — utambulisho, si tangazo la nafsi.
- **Picha:** 168 px (simu 146 px), `object-fit: cover`, kivuli laini chini.
- **Maudhui:** nafasi ya mistari 2 + 2 imetengwa mapema → **kadi zote zina urefu sawa**
  (354 px desktop), gridi haiyumbishwi.
- **Mstari wa mwisho:** bei 15 px yenye `tabular-nums`, CTA kitufe cha kijani 30 px.
  Kwenye kadi nyembamba (container query ≤ 205 px) bei inapinda mstari wake —
  **haikatwi kamwe**.
- **Tangazo la maandishi tu:** panel laini ya kijani, maudhui katikati, CTA chini;
  urefu unachukua nafasi iliyobaki badala ya kukatwa.

Ni **CSS pekee**: renderer (`js/06-announcement.js`), data na placements hazibadiliki.
Hakuna renderer ya pili, hakuna mfumo mpya wa muonekano.

## Picha
`audit-shots/post-after-v1.png` (kamilifu) · `post-after-v2.png` (bila bei)
`post-after-v3.png` (maandishi tu) · `post-mobile.png` (simu 390 px)
`audit-shots/feed-after.png` (tangazo juu ya feed)

## Kipimo cha kudumu

`tools/test_ad_card_styling.mjs` — **14/14**

```
desktop: picha 168px · brand haikatwi · bei haikatwi · CTA kijani
desktop: kichwa mistari 2 · footer haukatwi · kadi zote urefu sawa
desktop: tangazo la maandishi halikatwi
mobile:  bei inapinda · kitufe kamili · kadi haizidi
```

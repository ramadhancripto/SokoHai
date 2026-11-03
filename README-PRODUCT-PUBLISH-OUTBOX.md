# SokoHai — Kuchapisha Bidhaa: hifadhi kwa kifaa, sambaza baadaye

**Tarehe:** 2026-11-01 · Tawi: `improve/phase1-audit-upload-fix`

## Kilichoonekana kwanza (kipimo, si dhana)

Nilipima njia halisi ya *"CHAPISHA BIDHAA SOKONI"* kwa kubonyeza fomu halisi:

| Hali | Matokeo ya awali (kabla) |
|---|---|
| Mtandao ukiwa mzuri | **Inafanya kazi** — hati 1 ya `products`, `inventoryAdjust` imeitwa, ujumbe wa mafanikio |
| Mtandao umeanguka | `Kosa wakati wa kuhifadhi data: Failed to get document because the client is offline.` — Kiingereza, hana la kufanya, **bidhaa haikuhifadhiwa popote** |
| Ruhusa (rules) | `Kosa wakati wa kuhifadhi data: Missing or insufficient permissions.` — Kiingereza ghafi |
| Stock (`inventoryAdjust`) imeshindwa | `Bidhaa imeundwa lakini opening stock haikukamilika; jaribu tena.` — **bidhaa ilikuwa imeundwa**, na "jaribu tena" ilizalisha **bidhaa ya pili** |
| Picha haikupanda | Ujumbe mzuri tayari (uliwekwa awali) |

## Kasoro ya msingi iliyopatikana

`js/app/61-full-system-repair.js` ilifunika `skh.saveData` na:
1. **kupoteza `opts`** (hivyo `clientId` iliyozuia nakala haikufika), na
2. **kurudia kuandika kwa KILA kosa** — ikiwemo `permission-denied` na mtandao.
   Kurudia huku ndiko kunakozalisha bidhaa za nakala mtumiaji anapojaribu tena.

Sasa: `opts` inapita, na kurudia kunafanyika **tu** kwa kasoro ya `undefined`.

## Kilichoongezwa

| Faili | Mabadiliko |
|---|---|
| `js/app/102-publish-outbox.js` **(mpya)** | Foleni ya kifaa: `enqueue`, `attach`, `flush`, `remove`, kipengele cha UI, vitambulisho `local-ob…` |
| `js/app/00-bootstrap.js` | `skh.saveData(col, data, opts)`; kuhifadhi kwa kifaa mtandao ukiwa offline au write ikishindwa kwa mtandao; `clientId` → `setDoc` (hakuna nakala); ujumbe wa Kiswahili kwa ruhusa/mtandao |
| `js/app/08-app-state.js` | `submitSeller` inatambua id ya ndani (haisimamishi `inventoryAdjust`, inaambatanisha opening stock); `inventoryAdjust` ikishindwa **hairejeshi** tena (hakuna nakala) na inaeleza ukweli; huduma na usafiri vivyo hivyo |
| `js/app/30-seller-products.js` | Kipengele **"Zinasubiri kuchapishwa"** juu ya *Bidhaa Zangu* |
| `js/app/61-full-system-repair.js` | `opts` inapita; kurudia kwa `undefined` pekee |
| `index.html` | Moduli mpya imesajiliwa |
| `tools/test_product_publish_outbox.mjs` | Mtihani mpya **15/15** |

## Tabia mpya

- Mtandao ukianguka: bidhaa **inahifadhiwa kwenye kifaa**, fomu inasafishwa, mtumiaji
  anaambiwa kwa Kiswahili. Foleni inasambazwa kiotomatiki (`online`, kuingia akaunti,
  kurudi kwenye ukurasa) au kwa kitufe **Tuma sasa**.
- Kusambaza **hakuleti nakala**: hati huandikwa kwa `clientId` ile ile (`setDoc`).
- Stock ya kuanzia inakamilishwa kwa `inventoryAdjust` (`OPENING_BALANCE`) wakati wa kusambaza.
- Ruhusa ikikataa: ujumbe elekezi, **hakuna foleni**, maandishi yanabaki kwenye fomu.
- Hakuna mfumo wa pili wa data: bado `products` / `services` / `drivers`.

## Vipimo vilivyoendeshwa

```
test_product_publish_outbox      15/15 passed
test_ads_outbox                  12/12 passed
test_creative_no_undefined       12/12 passed
test_welcome_name_contract        7/7  passed
bottom_nav_verify                12/12 passed
ads_phase1_verify                30/30 passed
```

## Kinachohitaji uamuzi wako

Kama kosa linaendelea kwenye simu yako, ujumbe kamili wa Kiswahili/Kiingereza
unaonekana ni upi? Hiyo itatuambia ni sehemu gani (picha, ruhusa, mtandao, stock) —
na jibu lake lipo tayari kwenye msimbo huu.

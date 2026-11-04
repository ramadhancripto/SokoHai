# SOKOHAI — FAILI ZILIZOBADILISHWA TU (tayari kwa GitHub push)

Tarehe: 2026-11-04 · Repo HEAD: `03a6811` · Tawi: `main`

ZIP hii ina **faili 14 pekee** zilizobadilishwa/kuongezwa. Hakuna mfumo mzima.
Zote ni **zile zile zilizo hai kwenye app** (port 5055) — nimezithibitisha kwa
`diff` moja kwa moja: **faili zote 14 zinafanana kwa 100%** na working tree.

---

## Jinsi ya kuweka (njia 2 — chagua MOJA)

### Njia A — faili kamili (rahisi, inashauriwa)
```bash
cd /njia/ya/SokoHai
unzip -o /njia/ya/SOKOHAI-GITHUB-PUSH.zip
cp -r SOKOHAI-GITHUB-PUSH/files/* .
rm -rf SOKOHAI-GITHUB-PUSH
git status          # kagua
git add -A
git commit -m "Group chat: nav 9, UI sawa na chat ya kawaida, sauti + biashara"
git push origin main
```

### Njia B — patch (kwa wale wanaopenda diff)
```bash
cd /njia/ya/SokoHai
git apply --check patch/tracked-changes.diff     # kagua kwanza
git apply patch/tracked-changes.diff
# kisha nakili faili MPYA kutoka files/ (hazipo kwenye patch):
cp files/css/52-chat-discovery-feed.css css/
cp files/css/53-group-chat-ui.css css/
cp files/js/app/106-chat-discovery-feed.js js/app/
cp files/tools/dev_server.mjs tools/
cp files/tools/test_chat_conversation_security.mjs tools/
cp files/tools/test_group_chat_rules.mjs tools/
git add -A && git commit -m "..." && git push origin main
```

> ⚠️ **Usichanganye njia zote mbili.** Njia A au Njia B — moja tu.

---

## Faili 14 na kila moja ni ya nini

### 🟢 KAZI YA GROUP CHAT (kuu)
| Faili | Aina | Kilichobadilika |
|---|---|---|
| `js/app/73-group-soga.js` | MODIFIED | Nav tabs 9, panels 9, `GSG_TAB_HOST`/`setGsgTab`, renderers 6, composer sawa na chat ya kawaida, **mic (sauti)**, **menyu ya biashara**, typing kwenye kichwa, renderer ya ujumbe wa sauti |
| `js/app/69-chat-groups.js` | MODIFIED | `groupOrders`/`supplierOffers`; aina **`audio`** kwenye `GSG_MSG_TYPES` + uthibitishaji + preview |
| `css/53-group-chat-ui.css` | **MPYA** | Mandhari `#EFE7DD`, composer, typing dots, vitufe vya mic/biashara, rekodi chip, kadi za biashara |
| `css/48-chat-shell.css` | MODIFIED | Mitindo ya zamani ya kikundi iliondolewa hapa (imehamia 53) — ndiyo maana ina `-258` mistari |

### 🔵 INDEX.HTML — LAZIMA uweke (inaunganisha CSS/JS)
`index.html` inaongeza `<link>` ya `css/52` na `css/53` pamoja na markup ya
"Gundua Biashara". **Bila faili hii, CSS ya kikundi haitapakiwa GitHub.**
Kwa hiyo lazima uweke pia:

| Faili | Aina | Ni ya nini |
|---|---|---|
| `css/52-chat-discovery-feed.css` | **MPYA** | "Gundua Biashara" (Stage B) — inarejelewa na `index.html` |
| `js/app/106-chat-discovery-feed.js` | **MPYA** | Feed ya fursa (Stage B) — inarejelewa na `index.html` |

> Kama hutaki Stage B, usiweke `index.html` — lakini ndipo CSS ya kikundi
> haitapakiwa. Kwa hiyo ni bora uweke zote 3 kwa pamoja.

### 🟡 ZILIZOKUWA NA MABADILIKO KABLA (si za kazi ya leo)
| Faili | Aina | Ufafanuzi |
|---|---|---|
| `firestore.rules` | MODIFIED | Marekebisho ya rules (`+406/-60`) kutoka kazi ya awali. **Haikuwa sehemu ya kazi ya chat UI.** Ondoa kama hutaki. |
| `package.json` | MODIFIED | Mstari 1 |
| `tools/preview_start.sh` | MODIFIED | `+4/-3` |
| `tools/test_white_system_modules_contract.mjs` | MODIFIED | `+7/-6` |
| `tools/dev_server.mjs` | **MPYA** | Server ya preview (5055) — salama, haijengi dist |
| `tools/test_group_chat_rules.mjs` | **MPYA** | Kipimo cha rules (kinahitaji emulator) |
| `tools/test_chat_conversation_security.mjs` | **MPYA** | Kipimo cha usalama (kinahitaji emulator) |

---

## Uthibitisho — faili hizi ni HALISI na ZINAFANYA KAZI

Nilithibitisha kwa browser halisi (Playwright) kabla ya kufunga ZIP:

| Kipimo | Matokeo |
|---|---|
| `chat_verify.mjs` (kutuma, reply, viambatisho, guards) | **PASS 19 · FAIL 0** |
| `gcui_biz_test.mjs` (nav 9 + tabs zote) | **PASS 27 · FAIL 0** |
| `gcui_test.mjs` (1440/768/390/360) | **pass=true** zote, `overflowX=false` |
| `test_voice.mjs` (mic → rekodi → tuma) | `RECORDING ✓` → `sent:[{type:"audio",dur:1000}]` → chip imefungwa |
| Page errors | **0** (404 tatu ni za awali: `css/40-ui-refinement.css`, `shared/product-schema-*.mjs`) |

Vitufe vilivyopimwa: 1440 → `+38 · 😊38 · 🎤38 · 🛒38 · ➤44` · 390 → `34 · 34 · 34 · 34 · 40`

`syntax check` ya faili zote 7 za JS/MJS ndani ya ZIP: **zote OK**.

---

## Mambo ya kujua kabla ya push ⚠️

1. **`chatGroupOrders` bado imezimwa** kwa backend. Kitufe cha "Group Oda"
   kwenye menyu ya biashara hakionyeshwi — hii ni **sahihi**, si kasoro.
2. **Kipimo cha rules hakijafanyika** kwenye sandbox (hakuna Firestore emulator).
   Endesha kwenye machine yako:
   ```bash
   firebase emulators:exec --only firestore,auth --project demo-sokohai \
     "node tools/test_chat_conversation_security.mjs"
   ```
3. Sauti huhifadhiwa kama `audioUrl`; ikikosa upload → data URL ≤700 KB;
   ikizidi → mtumiaji anaambiwa wazi. **Hakuna kudanganya.**
4. Kama hukubaliani na `firestore.rules` kwenda kwenye push hii, iondoe
   kwenye `files/` kabla ya `git add`.

---

## Muundo wa ZIP
```
SOKOHAI-GITHUB-PUSH/
├── files/          ← faili 14 zenye njia za repo (nakili juu ya repo)
├── patch/
│   ├── tracked-changes.diff   (mistari 2,146 — faili zilizofuatiliwa)
│   └── untracked-files.txt    (faili 6 mpya)
├── MANIFEST.txt    ← orodha + ukubwa + aina
└── SOMA-KWANZA.md  ← hii
```

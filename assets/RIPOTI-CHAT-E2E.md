# RIPOTI: Live Backend Probe + E2E Journey — Chat System (21 Sept 2026)

## 1. Live probe kama `rshabansaid@gmail.com` (backend halisi `sokonet-3b847`)

| Jaribio | Matokeo |
|---|---|
| Login (email + password) | ✅ uid `eLxm…FEN2` |
| Kusoma inbox (conversations) | ✅ 10 conversations |
| Kusoma ujumbe ndani ya conversation | ✅ |
| **Kutuma ujumbe** (write + delete mara moja) | ✅ inaruhusiwa |
| Kusoma negotiations (fallback query) | ✅ 5 negotiations |
| Kuunda negotiation | ✅ inaruhusiwa |
| Kusoma groups (4) | ✅ |
| Kuunda group + group conversation | ✅ inaruhusiwa |
| Cleanup ya probe docs (3) | ✅ zimefutwa — production safi |

## 2. Matokeo MUHIMU mawili

### A. Production rules NI tofauti na `firestore.rules` ya repo 🔴
Writes ambazo repo-rules zingekataa (group create, participants 1, offer bei 0) **zote ZIMERUHUSIWA live**.
- **Maana 1 (nzuri):** tatizo la chat **SIO rules** — backend inakubali kila kitu.
- **Maana 2 (hatari/usalama):** production iko wazi — mtumiaji yeyote aliye-login anaweza kusoma/kuandika karibu kila kitu. **Pendekezo:** deploy `firestore.rules` + `firestore.indexes.json` za repo (`firebase deploy --only firestore`), LAKINI kwanza rekebisha rules kuruhusu group convs (`participants.size() == 2` sasa inakataa groups — gundua W2) na kuongeza rules za `chatGroups`/`sharedContexts` (hazipo — default deny). Usideploy rules kama zilivyo bila marekebisho hayo, vinginevyo groups zitavunjika.
- Composite indexes mbili hazipo live (inbox-ordered, nego conversationId+updatedAt) — **hazina madhara** kwa sababu app inatumia fallback queries (zimethibitishwa zinafanya kazi).

### B. Data live inaonyesha dalili ya code ya ZAMANI 🟡
Conversation moja ina ujumbe 6 unaofanana ("Habari, nimevutiwa…") ndani ya dakika 16 — maana yake mtumiaji alibonyeza **send mara 6 bila feedback**. Hii ni dalili ya code **bila optimistic UI** = code ya zamani kabla ya fix yangu (`9ceec35`).
- `https://sokonet-3b847.web.app/` = **Site Not Found** — app haiko kwenye default hosting URL.
- **Hitimisho:** unaweza kuwa unajaribu code ya zamani. **Deploy zip mpya** (`SokoHai-imekarabatiwa.zip`) ndipo ujaribu tena.

## 3. E2E Journey (modules halisi 37/34/38/69/39 + Firestore mock) — 30/30 ✅

| Safari | Asserts |
|---|---|
| J1 inbox reload | 1 ✅ |
| J2 startChat → conv + prefill + product context + product msg | 6 ✅ |
| J3 send → optimistic + reconcile + hakuna dup | 3 ✅ |
| J4 Toa Ofa ndani ya chat → negotiation (v1, OFFER_SENT) + form close | 5 ✅ |
| J5 seller counter (v2) → buyer accept (v3, AGREEMENT), native path | 2 ✅ |
| J6 group create → conv row → member → send | 5 ✅ |
| J7 group order create → join | 3 ✅ |
| J8 `skhChatNegotiate` (39-fix): await open + form + in-flight guard | 3 ✅ |

Full suite (`npm test`, vikosi 17): **zote green, exit 0**. Commit: `ccd8f0c`.

## 4. Inayofuata (kwako)
1. **Deploy zip mpya** mahali unapoiendesha app.
2. Jaribu tena chat — kama tatizo fulani bado lipo, nitumie: (a) hatua ulizofanya, (b) screenshot ya Console (F12) errors.
3. **Badilisha password ya account hiyo** (umeishare hapa — kwa usalama).
4. Amua kuhusu Firestore rules (angalia 2A) — nikirekebisha group-rules, nita-commit `firestore-rules-fix`.

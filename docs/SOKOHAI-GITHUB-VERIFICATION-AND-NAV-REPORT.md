# SokoHai — Uhakiki Mpya wa GitHub + Marekebisho ya Navigation

**Tarehe:** 14 Novemba 2026.
**Hakuna push, merge, deploy, reset wala kufuta kilichofanywa.**

---

## Sehemu A — Uhakiki wa GitHub

Repository ilisomwa moja kwa moja kwa `git ls-remote` na `git fetch` (read-only). GitHub API haijawezeshwa kwa kikao hiki, kwa hiyo orodha ya PR imesomwa kupitia `refs/pull/*`.

### 1. Commit ya mwisho GitHub

| | |
|---|---|
| Tawi kuu | `main` |
| HEAD | **`af9947fd7a54be671a3a19703c191b402f206636`** |
| Tarehe | **12 Nov 2026, 21:50 (+0300)** |
| Ujumbe | "Add acorn for Netlify minified build" |

### 2. Commits mpya tangu `ebfc999`

**0.** GitHub `main` haijabadilika tangu ukaguzi uliopita.

Kinyume chake, `ebfc999` iko **commits 19 mbele** ya GitHub `main`, na tawi la kazi `pilot/completion-20261114` liko **commits 31 mbele**. `af9947f` ni babu yao moja kwa moja, kwa hiyo hakuna mgongano wowote.

### 3. Mabadiliko yaliyopo GitHub

**`main`:** hakuna jipya.

**Matawi mengine:**

| Tawi / PR | Hali | Maoni |
|---|---|---|
| PR #3–#9 (dependabot) | Hayajaunganishwa | Ni masasisho ya vifurushi: `actions/checkout` 4→7, `setup-node` 4→7, `dotenv`, **`firebase-admin` 12→14**, **`firebase-functions` 5→7**, `jsdom` 29→31, `playwright` 1.64→1.65. Mawili yenye herufi nzito ni toleo kubwa lenye hatari ya kuvunja; yasiunganishwe bila majaribio. |
| PR #6 + commit ya netlify-bot `5c55224` | Haijaunganishwa | Inarekebisha "false positive" ya `verify_minify.mjs`. Marekebisho yanayolingana yamo tayari kwenye `ebfc999`, kwa hiyo hakuna kinachohitajika. |
| `auction-live-integration`, `remediation/…`, `feature/…`, `security/…`, `sokohai-local-work-20261112` | Yamo ndani ya tawi letu | — |
| `restore-sokohai-16d8c3e` | Commit 1 ya Septemba ("trigger test deploy") | Haina thamani. |

### 4. Tofauti kati ya GitHub na nakala za kazi

**Kompyuta yako** (`real-sokohai-complete`):
- HEAD = `sokohai-local-work-20261112` = **`af9947f`**, sawa na GitHub. Integration ya `ebfc999` ilifanywa kama dry-run tu.
- Backups 2 za tarehe 14 Nov zipo. Faili zako 22 ambazo hazijaongezwa kwenye git hazijaguswa.

**Kiini cha tatizo lako:** video uliyonitumia inaonyesha unajaribu `localhost:5055` kwenye kompyuta yako. Hiyo inaendesha **`af9947f`**, yaani toleo lisilo na marekebisho ya navigation. Ndiyo maana bado unaona matatizo.

**Hatari kubwa kwenye GitHub `main`:** `functions/index.js` ina **alama za mgongano wa merge zisizotatuliwa** (`=======` / `>>>>>>> origin/main`, mistari 4039–4041). Matokeo yake:
- Cloud Functions za toleo hilo **hazipakii kabisa** (`SyntaxError`);
- deploy ya functions kutoka GitHub `main` ingeshindwa.

Hii imerekebishwa kwenye tawi letu (`4788ae5`).

### 5. Matatizo uliyoyaripoti yaliyorekebishwa (tawi letu, si GitHub)

Nilijaribu toleo la GitHub (`af9947f`, likiwa na marekebisho ya mgongano tu ili lipakie) dhidi ya tawi letu, kwa majaribio yale yale ya browser halisi:

| Tatizo | GitHub `af9947f` | Tawi letu |
|---|---|---|
| Live inafunguka **nyuma** ya ukurasa wa bidhaa | ❌ inajitokeza (`room:true`, juu ni `productModal`) | ✅ |
| Login inafichwa nyuma ya Chat | ❌ inajitokeza (`auth` na `inbox` zote wazi, juu ni chat) | ✅ |
| Jaribio la Live + Chat auth | **1/10** | **40/40** |
| Back inaacha **ukurasa wa blue** (overlay tupu `rgba(0,34,68,.95)` = navy) | ❌ mf. SokoPay → Back → `plusMenu` tupu inabaki | ✅ |
| Jaribio la navigation | **4/14** | **56/56** |
| Sweep ya menyu na vitufe vyote vya bidhaa (mpya) | **52/60** | **60/60** (simu na desktop) |

### 6. Yaliyorekebishwa leo (ukaguzi wa kina zaidi)

Jaribio jipya la **matrix** linapima kila skrini ya msingi dhidi ya kila skrini lengwa:
- skrini 7 za msingi: bidhaa, chat, chumba cha Live, kikapu, menyu, profile, ukurasa wa muuzaji;
- skrini 15 lengwa;
- skrini 9 za mtu ambaye hajaingia.

Kabla ya marekebisho **128/214 zilishindwa**. Sasa **214/214 zinapita**.

| Tatizo | Ilivyokuwa | Marekebisho |
|---|---|---|
| Back kutoka skrini iliyofunguliwa juu ya bidhaa, chat, kikapu, ukurasa wa muuzaji au profile | Kutoka kwenye kikapu, oda, saved, muuzaji, SokoPay, token, profile n.k., Back ilienda moja kwa moja **ukurasani**, si ulikotoka. | Skrini ya chini inarudi (`56-nav-back`: alama `~X` sasa inatambuliwa baada ya skrini kufunuliwa). |
| Skrini iliyofunguliwa ndani ya chumba cha Live | Back iliacha mini-player inayoelea juu ya ukurasa. | Back inarudisha chumba kizima; session haikatiki. |
| Menyu ya akaunti (drawer) | Tabia ilitegemea kipengele ulichochagua. | Inafungwa kwa kila kipengele, na Back haiifungui tena (kama apps za simu). |
| Kiingereza: "Bidhaa (Product) (Product) (Product)…" | Neno liliongezeka kila mara menyu ilipofunguliwa. | Kanuni za tafsiri sasa hazijirudii (unit test inashindwa kwenye code ya zamani na inapita kwenye mpya). |

### 7. Je, GitHub `main` ni msingi salama?

**Hapana, peke yake.** Ina alama za mgongano kwenye functions, na haina marekebisho 31 (navigation, auth, pesa, search, checkout n.k.).

**Msingi salama ni `af9947f` + tawi `pilot/completion-20261114`.** Ni fast-forward safi, bila migongano, na kazi yako yote ya awali imehifadhiwa.

### 8. Hatua zinazofuata (napendekeza)

1. Leta tawi kwenye kompyuta yako kwa `SOKOHAI-PILOT-COMPLETION.bat` mpya (dry-run kwanza).
2. Endesha `localhost:5055` kutoka kwenye tawi hilo, kisha jaribu tena: Live kutoka bidhaa, Chat bila kuingia, na Back kila mahali.
3. Kama ni sawa, nipe ruhusa ya **push** ya tawi (si `main`), ili CI ipime GitHub.
4. Baada ya hapo: merge kwenda `main` (fast-forward), kisha deploy ya **staging**.
5. Dependabot: unganisha `checkout`/`setup-node`/`jsdom`/`playwright` baada ya CI. `firebase-admin` 14 na `firebase-functions` 7 zijaribiwe kwenye tawi tofauti.
6. Fanya maamuzi 11 yaliyo kwenye ripoti ya pilot (nauli, vikomo, upeo).

---

## Sehemu B — Matokeo ya majaribio (tawi `dd12afd`)

### Yaliyoendeshwa

| Kundi | Matokeo |
|---|---|
| `npm test` (amri 108) | **108/108** |
| Matrix ya skrini (simu + desktop) | **214/214** |
| Navigation | **56/56** |
| Live + Chat auth | **40/40** |
| Sweep ya menyu na vitufe vya bidhaa | **60/60** simu, **60/60** desktop |
| Live journeys: r13b, r13d, r14 kamera, pilot, oda, group chat | **zote** zimepita, simu + desktop |
| E2E kuu s1–s9 | **56/56** simu, **56/56** desktop |

### Yasiyoendeshwa

- Production: haijaguswa kabisa.
- GitHub CI: haiwezi kuendeshwa bila push.

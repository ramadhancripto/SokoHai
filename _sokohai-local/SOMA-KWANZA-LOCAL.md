# SokoHai Local — mfumo halisi kwenye kompyuta yako

Bofya mara mbili **`ANZISHA-SOKOHAI-LOCAL.bat`**. Itafungua http://localhost:5055 ukiwa na
code ya tawi `remediation/audit-findings-2026-11` na data ya majaribio.

## Inafanya nini (hatua 6)

1. Inakagua Git, Node.js, Java na curl. Java inatafutwa pia ndani ya `%USERPROFILE%\.jdks`.
2. Inaleta tawi la remediation kutoka `sokohai-remediation.bundle` na kuliweka kwenye folda mpya
   **`..\..\sokohai-remediation`** (pembeni ya `real-sokohai-complete`). Folda yako kuu na tawi
   `main` **havibadilishwi**.
3. Inasakinisha packages za `functions` (mara ya kwanza tu inachukua muda; inahitaji internet).
4. Inafungua dirisha la **SokoHai Emulator** (Firestore 8085 + Auth 9099, project `demo-sokohai`).
5. Inafungua dirisha la **SokoHai Server** (`functions/local-server.js`, port 5055).
6. Inaweka akaunti na matangazo ya demo, kisha inafungua browser.

Kusimamisha: funga madirisha mawili. Kuanza tena: bofya `.bat` tena (data ya demo inarudishwa).

## Mahitaji

| Kitu | Toleo | Pakua |
| --- | --- | --- |
| Git | yoyote ya karibuni | https://git-scm.com |
| Node.js | 20 LTS au zaidi | https://nodejs.org |
| Java | 11 au zaidi (21 inapendekezwa) | https://adoptium.net |
| Internet | mara ya kwanza (packages, Firebase tools, Firebase SDK ya browser) | — |

## Akaunti za demo (emulator tu) — nenosiri: `SokoHai-Local-2026`

| Barua pepe | Ni nani | Jaribu nini |
| --- | --- | --- |
| `asha@sokohai.test` | Mnunuzi | Kategoria, utafutaji, "Linganisha wauzaji" (TV 55 vs 43), oda, Patana Bei |
| `juma@sokohai.test` | Muuzaji aliyethibitishwa | Fomu ya kuuza (kategoria → sub-kategoria → aina), Business OS, POS |
| `neema@sokohai.test` / `baraka@sokohai.test` | Wauzaji wengine | Ofa za bidhaa ile ile, bidhaa ya zamani (lebo ya zamani) |
| `wakala@sokohai.test` | Wakala aliyeidhinishwa | Kuona na kukubali kazi ya usafiri iliyo wazi |
| `dereva@sokohai.test` | Dereva bila idhini | Hataona ubao wa kazi zilizo wazi (R1/R2) |
| `admin@sokohai.test` | Admin | Admin control center |

Matangazo yote ya demo yanaishia na "· demo". Picha zao ni picha za kategoria (si picha halisi za bidhaa).

## Jaribu modules mpya za R13

| Module | Wapi | Akaunti |
| --- | --- | --- |
| Live na Live Commerce | Nyumbani › "Live sasa", au menyu ya pembeni › Live sasa. Live 2 za demo zinaendelea | `asha` (mtazamaji), `juma` (mwenyeji: anza/maliza/onyesha bidhaa) |
| Mnada Live | Live "Mnada wa simu · demo", au kadi ya "Simu Samsung A54 (mnada)" › "Fungua chumba cha mnada" | `asha` aweke zabuni (angalau TSh 315,000) |
| Bei Kushuka Live | Live "Ofa za TV na spika leo": bei ya Spika JBL inashuka kila dakika 5 | `asha` |
| Hali (stories) | Chat › mstari wa Hali juu ya "Mapya sokoni" | `asha` kuangalia, `juma` kuongeza |
| Group Soko | Menyu ya pembeni › Group Soko › Unda | `juma` aunde na amwalike Asha Mnunuzi; `asha` akubali na arekodi mchango |

Video ya live ni kiungo cha YouTube/Vimeo tu (hakuna streaming server bado). Bila kiungo, live inaonyesha bidhaa (showcase).

## Kuhusu "data halisi" (production)

Script hii kwa makusudi **haiunganishi** na Firebase halisi (`sokonet-3b847`):

- Rules mpya za remediation bado hazijawekwa (deploy) production, kwa hiyo browser ingetumia rules za zamani.
- Kila oda, chat au tangazo ungelojaribu lingeandikwa kwa wateja halisi.

Ukiamua kutumia data halisi, ni hatua ya makusudi yako: `LOCAL-SERVER-MWONGOZO.md` (njia B, ADC),
na inashauriwa baada ya kuidhinisha na ku-deploy rules za remediation.

## Ukaguzi wa production wa SOMA-TU (read-only) — hiari, kwa ruhusa zako

Baada ya `ANZISHA-SOKOHAI-LOCAL.bat` kumaliza mara moja (packages zimesakinishwa):

1. Ingia kwa akaunti yako ya Google Cloud: `gcloud auth application-default login`
2. Bofya mara mbili `..\..\sokohai-remediation\tools\windows\UKAGUZI-PRODUCTION-READONLY.bat`
   (au iendeshe na jina la project: `UKAGUZI-PRODUCTION-READONLY.bat sokonet-3b847`).

Inasoma tu: safari za zamani (contact kwenye doc kuu), chanzo cha beji za "verified" za
wauzaji/bidhaa/huduma, na kategoria za zamani. Kila njia ya kuandika (set/update/delete/batch/
transaction) imezuiwa ndani ya script. Inatoa idadi na ID za nyaraka tu — hakuna majina wala
namba za simu. Inahifadhi faili `production-readonly-audit-YYYYMMDD.json`; nitumie faili hilo.

## Matatizo ya kawaida

- **"Bundle haikuweza kusomwa"** — repo yako lazima iwe na commit `bc3d147` (tawi `audit/master-engineering-2026-11`).
- **Emulator haianzi** — angalia dirisha la "SokoHai Emulator": mara nyingi ni Java haipo, au port 8085/9099 inatumika.
- **Port 5055 inatumika** — funga server ya zamani ya SokoHai, kisha anza tena.
- **Kuona kwenye simu yako (Wi-Fi ileile)** — si salama kwa default; ukihitaji, niambie nikuandalie kwa usalama.

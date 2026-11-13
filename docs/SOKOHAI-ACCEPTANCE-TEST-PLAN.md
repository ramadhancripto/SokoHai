# SokoHai — Mpango wa majaribio ya kukubali (acceptance)

**Hali (2026-11-13):** kila kipengele hapa chini **kimeendeshwa kiotomatiki** kwa browser halisi (Chromium) kwenye
emulator ya Firebase, kwa simu 390×844 na desktop 1440×900, kupitia vitufe halisi vya app. Safu ya "Mkono" ni
hatua zako za kurudia kwa mkono kwenye staging (baada ya setup). Hakuna pesa halisi; wallet ya SokoPay ni data ya emulator.

| # | Mtiririko | Jaribio la kiotomatiki | Matokeo (simu / desktop) | Mkono (staging) |
|---|---|---|---|---|
| 1 | Checkout ya mnunuzi + SokoPay wallet | `test_r16_order_journey` hatua 1–3 | 7/7 · 7/7 | Kikapu → "Sitahitaji usafirishaji" → Lipa kwa SokoPay Wallet → oda iwe *held*, salio lipungue mara moja |
| 2 | Muuzaji kusafirisha + Pickup Token | order journey hatua 4–5; `test_r16_transport_journey` (PK: muuzaji + wakala tu, mnunuzi hawezi kuisoma) | 7/7 · 7/7 | Muuzaji "Nimesafirisha"; kwa usafiri: wakala anaonyesha PK, muuzaji anaiandika |
| 3 | Mnunuzi kupokea + tathmini yenye beji | order journey hatua 6–7; service journey hatua 10 | 7/7 · 7/7; 10/10 · 10/10 | "Nimepokea" → "Andika Tathmini" → tathmini ionyeshe "verified" |
| 4 | Mgogoro na refund | `test_dispute_refund_lifecycle` (emulator, server) | 7/7 | Mnunuzi "Fungua Mgogoro" → Admin → Migogoro → refund → wallet ya mnunuzi |
| 5 | Huduma: ombi → fundi kukubali/kukataa → malipo → kukamilisha | `test_r16_service_journey` | 10/10 · 10/10 | Huduma Hub → Maombi Mapya → Kubali → mteja analipa → "Kazi imekamilika" → namba → kuthibitisha |
| 6 | Usafiri: wakala kukubali → pickup → safari → delivery | `test_r16_transport_journey` | 7/7 · 7/7 | "Maombi Yaliyotumwa Kwako" → Kubali → PK → Anza safari → DL ya mnunuzi → Kamilisha |
| 7 | Group Buy: kujiunga, kutoka, kughairi, settlement | `test_r16_group_buy` + `test_group_buy_lifecycle` | 6/6 · 6/6; 12/12 | Watu 2–3 wajiunge → mmoja atoke na arudi → Admin → Group Buy → "Sasisha hali" → kulipa; kampeni nyingine "Ghairi" kwa sababu |
| 8 | Utambulisho + hati za siri | `test_r16_identity` + `test_identity_verification` | 5/5 · 5/5; 8/8 | (Inahitaji Cloudinary signed) Wasifu → Thibitisha utambulisho → Admin → Uthibitisho → "Tazama hati" (kiungo kilichosainiwa) → Idhinisha |
| 9 | Mnada, Bei Kushuka, Group Chat | `ali.cjs` (Auction Live), `test_r14_auction_admin`, suites za mnada/bei kushuka, `test_r13g/r13h` | 10/10 · 10/10; 3/3 · 3/3; 8/8 + 13/13 kila upande | Zabuni kutoka akaunti 2, mshindi alipe kwa wallet; Bei Kushuka foleni; kundi + tangazo la Soko + idhini |
| 10 | Live Commerce + PWA offline | `test_r14_live_camera`, `test_r15_pwa` | 6/6 · 6/6; 8/8 · 8/8 | Live kwenye mtandao mmoja (sauti sasa inaruhusiwa kwenye sokohai.com); Airplane mode → app ifunguke |

**Mipaka iliyo wazi:** live kati ya mitandao tofauti inahitaji TURN; PesaPal halisi inahitaji funguo za sandbox;
barua pepe ya reset na push zinahitaji usanidi wa Firebase. Haya yako kwenye `SOKOHAI-USER-SETUP-CHECKLIST.md`.

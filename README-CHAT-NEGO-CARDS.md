# Kadi za Majadiliano (Negotiation) kwenye Chat — Balanced · 2026-11-02

Ombi: *"zile card za negotiation kwenye UI ya inbox/chat zinaonekana kubwa sana —
ziwe balanced ili UI isibanwe kwa pande zote: anayetoa ofa na anayejibu."*

## Tatizo halisi (vipimo kabla)

| Kipimo (desktop 1280×900) | Kabla | Baada |
|---|---|---|
| Upana wa kadi — upande wangu (kulia) | 430 px | **420 px** |
| Upana wa kadi — upande wa mwenzangu (kushoto) | 374 px | **420 px** |
| Kadi ya Ofa (amber) | 374 × 269 px | **420 × 174 px** |
| Counter Ofa | 298–374 × 200 px | **420 × 157 px** |
| Makubaliano + vitufe | 300 × 337 px | **420 × 237 px** |
| Jumla ya urefu (kadi 3) | 806 px | **568 px** |
| Simu 390 × 844 — kadi | 322 × 337 px | **~350 × 302 px** |

Sababu nne zilizopatikana:
1. **Fremu mbili** — kadi ilikuwa ndani ya `chat-bubble` yenye rangi (`#DCF8C6`
   kijani / `#FFFFFF`) pamoja na padding yake → kadi ilionekana nzito na
   ilibana kwa pande zote. Sheria ya "bubble isiwe fremu" ilikuwepo kwa
   `.ch-card` na `.ch-offer-msg` **lakini haikuwa na `.ch-nego-event`**.
2. **Upana usio sawa** — 374px kushoto vs 430px kulia (bubble ilikuwa
   `max-width: 78%` na kadi `width:100%`); pande mbili zilionekana tofauti.
3. **Masharti kwenye mstari mmoja mrefu** — "Idadi: 3 · Bei unayopendekeza
   (TSh): TSh 38,000 (ilikuwa TSh 45,000)" ulivunjika-vunjika, ukapandisha
   urefu wa kadi.
4. **Vitufe vibovu** — padding kubwa, "Tengeneza Oda" ilivunjika mistari miwili
   na upande wa simu ilitoka nje ya kadi.

## Kilichofanyika

**`css/47-chat-nego-balance.css` (mpya)** — CSS pekee:
1. `#chatMessages .chat-bubble:has(.ch-nego-event)` na `:has(.ch-offer-msg)` →
   `background: transparent`, `border-color: transparent`, `padding: 0`,
   **`width: 420px`** (fremu moja tu, kadi ndiyo fremu).
2. Upana mmoja pande zote: kadi `width:100%; max-width:420px`, zikiwa
   zimepangwa `margin-right:auto` (kushoto) / `margin-left:auto` (kulia).
3. Kichwa kimeshinikizwa: ikoni 34→28px, beji 12→10px, kichwa 13.5→13px,
   jina la bidhaa mistari 2 tu (`line-clamp`).
4. **Masharti kama vigae**: gridi ya safu 2 — `KIASI` | `BEI` — kisha
   `JUMLA` inachukua mstari wake yote. Lebo ndogo (10px, uppercase), thamani
   nzito 13px. Hii inapunguza urefu kwa ~40% na kusomeka haraka.
5. Bango la zamu, kadi ya oda na maombi yaliyowekwa pending: padding/nafasi
   ndogo, vipimo vya sare.
6. **Vitufe**: gridi `repeat(auto-fit, minmax(104px,1fr))` — desktop vitufe 3
   kwa mstari mmoja; simu 2 kwa mstari; hakuna maandishi yanayokatwa.
7. Kadi ya **Ofa (amber)** imepangwa upya kama vigae vilevile: `IDADI` |
   `BEI (TSh)` (+ "ilikuwa TSh 45,000" ndogo yenye mkato) na `JUMLA` mstari
   wake.

**`js/app/34-chat-core.js` — `renderOfferCard()`**: markup ya kadi ya ofa
imebadilishwa kutoka mstari mmoja mrefu kwenda vigae (`ch-offer-grid` /
`ch-offer-term`), jumla inahesabiwa (idadi × bei). Mantiki ya biashara,
vitendo na amri za negotiation hazijaguzwa.

**`js/app/32-i18n.js`**: keys mbili mpya — `ch_offer_price_short`
("Bei (TSh)") na `ch_offer_total` ("Jumla").

**`index.html`**: mstari mmoja — `css/47-chat-nego-balance.css` baada ya `46`.

## Uthibitisho

`tools/test_chat_nego_cards.mjs` (mpya) — **33/33 passed** kwenye
1280×900, 1024×800 na 390×844. Kila ukubwa hukagua:
- kadi zote zimechorwa, hakuna page error;
- upana wa kadi za negotiation **sawa kabisa** pande zote (≤2px tofauti);
- upana ≤ 424px (desktop) / ≤ 378px (simu);
- urefu ≤ 300px (desktop) / ≤ 360px (simu);
- bubble yenye kadi **haina fremu ya pili** (background wazi, padding 0);
- kadi haivuki safu ya mazungumzo;
- vitufe vinaingia ndani ya kadi;
- masharti ni vigae (≥2) na `JUMLA` ina mstari wake;
- ofa inaonyesha bei ya awali;
- hakuna horizontal overflow.

Regressions zilizoendelea kupita: `test_chat_compact` **37/37**,
`test_fullscreen_pages` **399/399**, `test_post_cards` **60/60**.

Picha: `audit-shots/nego-desktop.png`, `audit-shots/nego-mobile.png`
(kadi zote tatu: Ofa, Counter, Makubaliano).

## Jinsi ya kujaribu
```bash
node tools/build_dist.mjs
source /home/user/pw.sh
node tools/test_chat_nego_cards.mjs
```

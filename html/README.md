# HTML BODY — Vipande Huria (Phase 2.7)

Hii ni folder ya **vyanzo vya HTML**. Faili kubwa ya `index.html` (298 KB)
imegawanywa kuwa vipande 22 huru — kila kimoja kina **kazi yake muhimu**,
kama ilivyofanyika kwa `css/` na `js/app/`.

> ⚠️ **Kanuni:** Usihariri `index.html` moja kwa moja — hariri kipande husika
> hapa, kisha ukusanye:
> ```bash
> python3 tools/build_html.py build     # kusanya vipande -> index.html
> python3 tools/build_html.py check     # thibitisha kila kitu kiko sawa
> ```

## Ramani ya vipande

| Kipande | Kazi yake |
|---|---|
| `00-head.html` | `<head>`: meta, title, CSS links, Chart.js + Leaflet |
| `01-shell.html` | `<body>` + Sidebar ya desktop (Soko Huru, HaiPay...) + mwanzilishi wa app-content-main |
| `02-inputs.html` | File inputs fiche (dp upload, receipt, image search, chat file) |
| `03-modals-core.html` | Modals: category grid, buyer orders, sidebar menu, mode switcher, seller type, boost, subscription, escrow dispute, welcome, map, direct hire |
| `04-modal-auth.html` | Login / Signup modal |
| `05-modals-market.html` | Product details, quantity, buy buttons, cart, checkout (PesaPal), dynamic payment inputs |
| `06-modals-social.html` | Chat, chat list (inbox), notifications |
| `07-modal-payment.html` | User payment settings (M-Pesa/bank/card), unlock, account lines |
| `08-modal-transport.html` | Unified transport request + delivery choice |
| `09-admin-sell.html` | Admin settings modal + fomu nzima ya kuuza (sell form + POS) |
| `10-form-agent.html` | Fomu ya wakala (usajili + subcategories) |
| `11-form-driver.html` | Fomu ya dereva + transporter (vehicles, routes) |
| `12-form-offline.html` | Fomu ya wakala kusajili mwanachama offline |
| `13-form-edit.html` | Fomu ya kuhariri tangazo |
| `14-haipay.html` | **HaiPay modal nzima** (sidebar + Home/Pay/Create Link/Track/Transactions/Help/Disputes/Settings) — kipande kikubwa zaidi (74 KB) |
| `15-main-menu.html` | Main menu (kitufe cha "+") + mwanzo wa header ya nje |
| `16-topnav.html` | Top nav (Usimamizi, HaiPay icon, cart, notification) + search + location + announcement + tab za bidhaa/huduma/usafiri |
| `17-sliders.html` | Kitufe cha kategoria + subcategory/filter sliders |
| `18-buyer-view.html` | Buyer view: KPI cards + main feed grid |
| `19-bottomnav.html` | Bottom nav: Home, Bidhaa, Huduma, Usafirishaji, Chat |
| `20-modal-rating.html` | Rating & reviews modal (nyota) |
| `21-scripts.html` | Script tags zote (modules `js/app/*` + classic scripts) |

## Kwa nini njia hii (build) na si runtime?

- **Runtime** (browser inapakia vipande kwa `fetch()`) ingebadilisha tabia ya app
  — modules za JS zinasoma DOM mapema, na mpangilio ungeweza kuvunja mambo
  (kama bug ya `updateApp` iliyotokea awali).
- **Build** inakuwezesha kuhariri kipande kimoja kwa wakati, huku app
  inabaki **kama ilivyo** — mkutano ni byte-exact (imehakikishwa na `check`).

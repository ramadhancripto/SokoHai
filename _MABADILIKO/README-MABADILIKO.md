# SokoHai — MABADILIKO YOTE (ZIP ya GitHub)

**Imesasishwa:** 2026-11-05 (build `HEADER-R5d`) · **Chanzo:** `/home/user/SokoHai` · **Base:** `03a6811`

Faili **89** (zilizobadilishwa 19 + mpya 70), mpangilio ule ule wa folda.

---
## 1. Kuvuta
```bash
cd /path/to/SokoHai
unzip -o ~/Downloads/SOKOHAI-MABADILIKO-YOTE.zip -d .
rm -rf taxonomy-draft/out/     # faili zilizofutwa
rm -rf _MABADILIKO            # hiari
git status && git add -A && git commit -m "SokoHai Job 13"
```

## 2. Faili zilizobadilishwa (19)

**assets/html/**
- `assets/html/00-head.html`
- `assets/html/03-modals-core.html`
- `assets/html/05-modals-market.html`

**css/**
- `css/26-design-system.css`
- `css/48-chat-shell.css`

**js/app/**
- `js/app/00-bootstrap.js`
- `js/app/26-image-zoom.js`
- `js/app/35-comments.js`
- `js/app/39-product-showcase.js`
- `js/app/56-nav-back.js`
- `js/app/69-chat-groups.js`
- `js/app/73-group-soga.js`
- `js/app/99-ads-marketplace.js`

**root (index.html, package.json, firestore.rules, ripoti)**
- `firestore.rules`
- `index.html`
- `js/00-pwa.js`
- `package.json`

**tools/**
- `tools/preview_start.sh`
- `tools/test_white_system_modules_contract.mjs`

## 3. Faili mpya (70)

**assets/img/categories/ (picha za kategoria)** — 49
- `assets/img/categories/*.webp` (49 picha, 340×255, q78, 632 KB)

**css/** — 9
- `css/52-chat-discovery-feed.css`
- `css/52-product-card-details.css`
- `css/53-group-chat-ui.css`
- `css/53-product-inquiry.css`
- `css/54-maoni-polish.css`
- `css/55-engagement-system.css`
- `css/56-lazy-feed.css`
- `css/57-home-brand-header.css`
- `css/58-category-photo-strip.css`

**js/app/** — 6
- `js/app/106-chat-discovery-feed.js`
- `js/app/53-product-inquiry.js`
- `js/app/60-lazy-feed.js`
- `js/app/68-gundua-soko.js`
- `js/app/82-home-header-actions.js`
- `js/app/83-category-photos.js`

**root (index.html, package.json, firestore.rules, ripoti)** — 3
- `CHAT-SPONSORED-DISCOVERY-REFINEMENT-REPORT.md`
- `KIKUNDI-STRUCTURE-REPORT.md`
- `assets/img/sokohai-logo.png`

**tools/** — 3
- `tools/dev_server.mjs`
- `tools/test_chat_conversation_security.mjs`
- `tools/test_group_chat_rules.mjs`

## 4. Faili zilizofutwa (10)

- `taxonomy-draft/out/attribute-audit.draft.json`
- `taxonomy-draft/out/attribute-audit.draft.md`
- `taxonomy-draft/out/business-coverage.draft.json`
- `taxonomy-draft/out/coverage-matrix.draft.csv`
- `taxonomy-draft/out/hierarchy.draft.md`
- `taxonomy-draft/out/legacy-mapping.draft.csv`
- `taxonomy-draft/out/legacy-mapping.draft.json`
- `taxonomy-draft/out/reports.draft.json`
- `taxonomy-draft/out/sokohai-taxonomy-v1.draft.json`
- `taxonomy-draft/out/types.draft.csv`

---
## 5. Marekebisho ya R5d (local server vs screen shot)

- `js/00-pwa.js`: service worker sasa inasajiliwa kwenye domain halisi ya uzalishaji PEKEE. Kwenye host za preview/maendeleo (`*.e2b.app`, `*.arena.*`, ngrok, LAN, localhost) SW **haijisajili** na cache zote zinafutwa — ndiyo sababu preview ilikuwa inaonyesha toleo la kale.
- `tools/dev_server.mjs`: `Cache-Control: no-store` + `Pragma` + `Expires` + `Clear-Site-Data: "cache"` kwa HTML, na kichwa `X-SokoHai-Build`.
- `index.html`: version-bump ya rasilimali zote (`?v=20261105r5d`) na build stamp `HEADER-R5d-2026-11-05` ili browser isitumie faili za kale.
- USIMAMIZI imebaki kama ilivyo kwenye GitHub (`.menu-item` + "Funga X"); marekebisho ni CSS ndogo pekee.

## 6. Vipimo
```
test_v5 12/12 · test_v5b 4/4 · test_topad 8/8 · test_mode 16/16 · test_preview_host 6/6
test_header_r4 16/16 · verify_brand 18/18 · verify_all 11/0 · chat_verify 19/0
final_shots: 0 page errors @1440/768/390
```
# SokoHai Full-System Visual Audit Map — 2026-09-22

## 1. Scope decision
The Chat Home refinement is one completed module inside a larger visual transformation. It does **not** close the full-system task. The full task covers every user-visible shell, view, modal, dynamic renderer, state, and responsive layout while preserving all existing records, navigation, permissions, and backend behavior.

Required workflow for every module:

`INSPECT → MAP AUTHORITY → RECORD BASELINE → REPAIR SOURCE → TEST MODULE → RUN REGRESSION → NEXT MODULE`

No sample data, duplicate component, duplicate route, or replacement mini-application is permitted.

## 2. Repository-wide inventory

### Static structure
- CSS files: **35** (`css/00-tokens.css` through `css/34-chat-inbox-identity.css`, with numbered gaps).
- HTML source fragments: **22**.
- Application scripts: **105 JavaScript files** across `js/` and `js/app/`.
- User-visible modal IDs discovered in HTML: **53**.
- Menu-related IDs: **30**.
- Static buttons in HTML fragments: **237**.
- Current HTML build remains fragment-based; `index.html` must always be rebuilt from `html/` and checked byte-exact.

### Visual-debt indicators
- Legacy blue/gradient search produced **533 matching usages/lines** across CSS, HTML, and renderer scripts. These are candidates for inspection, not blind replacement.
- Current color hotspots include `#1268A8` (**313 occurrences**) and `#0B4F7A` (**155 occurrences**).
- There are **156 distinct CSS custom-property names**, including several overlapping token namespaces.
- Highest inline-style/runtime-style hotspots:
  - `js/app/21-sokopay.js` — 674 style operations/usages.
  - `js/app/73-group-soga.js` — 472.
  - `js/app/10-dashboard-tabs.js` — 435.
  - `html/21-scripts.html` — 359.
  - `html/14-haipay.html` — 304.
  - `js/app/16-pos-admin-jobs.js` — 235.
  - `html/09-admin-sell.html` — 193.
  - `js/app/17-hub.js` — 173.
  - `js/app/19-roles.js` — 155.
  - `js/app/11-analytics.js` — 140.

Inline styles in these files often come from authoritative dynamic renderers, so a global CSS override alone cannot be assumed sufficient.

## 3. Proven design-system root cause

SokoHai already contains design-system attempts, but they are internally inconsistent:

1. `css/00-tokens.css` defines the `--skh-*` namespace but still sets blue as primary and uses a blue-tinted page background.
2. `css/26-design-system.css` defines a second `--sh-*` namespace and explicitly restores a dark-blue Bottom Navigation.
3. Legacy `--primary-*`, `--green`, `--gold`, module-local market tokens, and Chat-local tokens coexist.
4. Later files in the load order can override earlier white-first work. In particular, `css/25-typography.css`, `css/26-design-system.css`, `css/27-visual-audit-fixes.css`, `css/28-my-profile.css`, and `css/29-nav-dict.css` load after `css/33-white-marketplace.css` and `css/34-chat-inbox-identity.css`.
5. Many major modules build HTML with inline colors and layout rules, bypassing reusable CSS classes.

Therefore the correct transformation is not a global blue-to-green replacement. It requires consolidating token meaning, repairing authoritative shared components, then handling proven inline renderer exceptions module by module.

## 4. Current major contradiction: Bottom Navigation

- Source markup: `html/19-bottomnav.html`.
- Navigation behavior: existing `updateApp(...)` and `openChatList()` handlers must remain unchanged.
- Base style: `css/01-core.css` uses a dark primary background and gold active state.
- Late design-system style: `css/26-design-system.css` explicitly forces `var(--sh-blue-deep)` and gold active state with `!important`.

This directly contradicts the required white Bottom Nav. The fix belongs in the shared design-system source, not in duplicated navigation markup.

## 5. Surface and authority map

| Visual domain | Primary HTML/source | Main style/runtime authorities | Key audit risks |
|---|---|---|---|
| Global shell, header, nav | `html/01-shell.html`, `html/16-topnav.html`, `html/19-bottomnav.html` | `css/01-core.css`, `css/12-mobile-responsive.css`, `css/26-design-system.css`, `css/29-nav-dict.css`, navigation scripts | Dark nav authority, competing late CSS, small-screen labels |
| Home/discovery/search | `html/17-sliders.html`, `html/18-buyer-view.html` | `js/20-search-chat.js`, `js/21-home-filters.js`, `js/app/75-discover-engine.js`, `js/app/88-discover-complete.js`, `css/30-discover-engine.css`, `css/33-white-marketplace.css` | Multiple discovery authorities, dynamic inline cards, dedupe/ranking must remain real |
| Product listing/detail | `html/05-modals-market.html` | `js/app/01-market.js`, `js/app/07-product.js`, `js/app/39-product-showcase.js`, `css/07-market-polish.css`, `css/18-product-showcase.css`, `css/31-product-actions.css` | Multiple card generations, modal hierarchy, action preservation |
| Services | `html/10-form-agent.html`, shared feed surfaces | `js/app/17-hub.js`, `js/app/19-roles.js`, `js/app/31-agent-assist.js` | Inline styles, role-specific variants, backend actions |
| Transport/logistics | `html/08-modal-transport.html`, request/logistics modals | `js/app/20-logistics.js`, `js/app/25-tracking-hub.js`, `js/app/52-transport-inbox.js`, `css/22-delivery-choice.css`, `css/23-logistics-market.css` | Blue has valid location meaning but must not dominate surfaces |
| Chat/inbox/groups | `html/06-modals-social.html` | `js/app/34-chat-core.js`, `69`, `73`, `74`, `76`, `93`; Chat CSS layers | Current Chat Home identity closed; remaining conversation/group/action surfaces still require system-wide pass |
| Negotiation | `#chatNegotiationHost` and dynamic form | `js/app/37-negotiation.js`, `38-nego-form-logic.js`, `38-negotiation-form.js`, `css/17-negotiation-form.css` | State semantics, no fake success, commerce type-specific fields |
| Cart/checkout/orders | `html/05-modals-market.html`, buyer order modal | `js/19-cart-checkout-canonical.js`, `js/app/02-checkout.js`, `js/app/04-orders-escrow.js`, `js/app/23-smart-cart.js` | Multiple flows, payment/order status accuracy |
| SokoPay/wallet/payment | `html/07-modal-payment.html`, payment/deposit dynamic modals | `js/app/21-sokopay.js`, `js/app/67-payment-accounts.js`, `js/12-payments.js`, `js/16-wallet.js`, `css/09-sokopay-polish.css` | Largest inline-style hotspot; payment state must stay honest |
| Profiles/community | profile and social modals | `js/app/13-community.js`, `28-buyer-engagement.js`, `29-seller-store.js`, `64-my-profile.js`, `css/21-discovery-maoni.css`, `css/28-my-profile.css` | Multiple role identities, follower/review/comment actions |
| Dashboards/POS/admin | `html/09-admin-sell.html`, `html/14-haipay.html`, `html/17-sliders.html` | `js/app/03-dashboard.js`, `10-dashboard-tabs.js`, `15-pos-sales.js`, `16-pos-admin-jobs.js`, `18-cockpit.js`, `css/08-dashboard-pos-polish.css`, `css/10-admin-dash-polish.css` | Rainbow KPI cards, heavy inline styles, dense mobile forms |
| Agent/offline/member tools | forms and dynamic operations in later HTML | `js/app/19-roles.js`, `31-agent-assist.js`, `58-request-visibility.js`, `59-agent-monitor.js` | Permission states and role actions must not become visual-only promises |
| Notifications/saved/request inbox | notification and request modals | `js/app/40-token-box.js`, `41-request-inbox.js`, related listeners | Status colors and empty/loading/error consistency |
| Modals/dialogs/menus | 53 modal IDs and 30 menu IDs | `js/05-dialogs.js`, `js/94-modal-stack.js`, `css/02-menu.css`, `css/26-design-system.css` | Inline shells, inconsistent radius/shadows, stacking cannot be solved with extreme z-index |
| Empty/loading/error/success | mixed static and runtime markup | `js/09-states.js`, `js/app/54-error-core.js`, module renderers, `.sh-*` classes | Existing shared classes are not universally used |

## 6. Safe implementation sequence

### Phase A — global foundation
1. Consolidate semantic token values while retaining compatibility aliases for existing namespaces.
2. Make the shared Bottom Nav white with green active state and neutral inactive state.
3. Normalize shared header, modal, drawer/menu, button, field, badge, empty, loading, error, and success primitives.
4. Add visual contract tests for token semantics and global shell behavior.

### Phase B — customer marketplace journey
Home → Search → Discover → Bidhaa → Product detail → Seller profile → Cart → Checkout.

### Phase C — service and transport journey
Huduma → provider profile → service detail; Usafiri → route/request → transporter profile → tracking.

### Phase D — commerce lifecycle
Negotiation → agreement → orders and states → SokoPay/payment → delivery/proof/completion.

### Phase E — social and communication
Chat conversation UI, Groups, Group Buy workspace/cards, posts, comments, reviews, followers/following, notifications.

### Phase F — business operations
Seller/service/transport dashboards, POS, reports, expenses, procurement, stock transfer, Agent and offline member systems.

### Phase G — account and support
Personal/business profiles, account, settings, help, permission/error states.

### Phase H — final consistency and responsive pass
Mobile/small-screen CSS contracts, tablet/desktop rules, full test suite, syntax checks, HTML byte-exact check, package integrity, and documented browser/device limitations.

## 7. Test policy

After each phase:
- Add a visual/source contract for the authoritative components changed.
- Run relevant module tests.
- Run Chat/commerce/navigation regression tests when shared shell styles are touched.
- Rebuild/check HTML.
- Run JavaScript syntax checks.
- Run full `npm test` before phase closure.

The current environment has no installed browser runtime, so screenshot, physical-device, or true end-to-end visual claims must not be made unless that capability is added and actually used.

## 8. Definition of done

The full task is complete only when every mapped domain has:
1. an identified rendering and style authority;
2. a white-first/green-primary visual treatment using shared semantics;
3. preserved real actions, state, and data;
4. responsive and interaction-state coverage;
5. module regression evidence; and
6. inclusion in a final system-wide walkthrough report.

Chat Home alone, Bottom Navigation alone, or a final global override stylesheet alone is not sufficient.

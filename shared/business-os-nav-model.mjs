/* ============================================================================
   shared/business-os-nav-model.mjs — SokoHai Business OS · Stage 3 (9 modules)
   ---------------------------------------------------------------------------
   Chanzo KIMOJA cha ukweli kwa urambazaji wa Business OS (sidebar) na tests.

   MUUNDO MPYA (9 moduli, mpangilio halisi ulioidhinishwa):
     1. Dashboard Kuu            → tab: overview (landing ya kawaida)
     2. Bidhaa Zangu             → tab: my_products
     3. Taarifa za Bidhaa        → 5 tabs za uchambuzi zilizopo
     4. Stoo na Usafirishaji     → A Stoo · B Logistics ya Ndani · C Usafirishaji wa Oda
     5. Fedha na Uhasibu         → Leja Kuu (expenses) + Muhtasari wa Fedha
     6. Rasilimali Watu          → staff (wafanyakazi & mishahara)
     7. Udhibiti                 → Kituo cha Udhibiti (admin) + sub-views zake
     8. POS — Mauzo ya Dukani    → action openPos (+ ripoti za POS zilizopo)
     9. Mipangilio ya Mfumo      → tab: settings

   MASHARTI (ADD, NEVER REMOVE — hakuna kilichofutwa):
   • Kila tab iliyokuwepo kwenye cockpit ya awali ipo: overview, my_products,
     product_analytics, product_performance, sales_insights, demand_insights,
     product_compare, inventory, expenses, staff, settings.
   • Kila action ya awali ipo: openStockTransferModal, openPos, skhOpenKamusi,
     skhOpenAdminControlCenter, switchModeBuyer (exit).
   • Kila tab ya dashboard iliyokuwepo (bookings, trips, tracking, drivers,
     fleet, cargo, finance, analytics) sasa INAONEKANA pia kwenye sidebar
     (awali zilifikiwa kwa vitufe tu) — hakuna iliyoondolewa.
   • `tab` → `id="btnTab_<tab>"` + `class="ct-sidebar-menu-btn side-menu-link"`
     hivyo `window.switchDashTab()` ileile inaendelea kufanya kazi.
   • Model hii haina imports: inasomwa na browser na node tests.

   MUUNDO WA ITEM:
     { tab }        → inabadilisha ukurasa (switchDashTab)
     { action }     → inaita global function (runAction), `arg` ni hiari
     { tab, action }→ inabadilisha ukurasa KISHA inafungua modal/panel
   Kikundi: { id, label, labelEn, icon, items, subgroups? }
   Subgroup: { id, label, labelEn, items }  — lebo ya kutenganisha sub-moduli.
   ========================================================================== */

export const BUSINESS_OS_NAV = [
  /* ------------------------------------------------------------------ 1 */
  {
    id: 'dashboard',
    num: 1,
    label: 'Dashboard Kuu',
    labelEn: 'Main Dashboard',
    icon: 'home',
    items: [
      { tab: 'overview', label: 'Dashibodi Kuu', labelEn: 'Business Overview', icon: 'home' }
    ]
  },

  /* ------------------------------------------------------------------ 2 */
  {
    id: 'products',
    num: 2,
    label: 'Bidhaa Zangu',
    labelEn: 'My Products',
    icon: 'package',
    items: [
      { tab: 'my_products', label: 'Bidhaa Zangu', labelEn: 'My Products', icon: 'package' }
    ]
  },

  /* ------------------------------------------------------------------ 3 */
  {
    id: 'intel',
    num: 3,
    label: 'Taarifa za Bidhaa',
    labelEn: 'Product Intelligence',
    icon: 'target',
    items: [
      { tab: 'product_analytics', label: 'Uchambuzi wa Bidhaa', labelEn: 'Product Analytics', icon: 'target' },
      { tab: 'product_performance', label: 'Utendaji wa Bidhaa', labelEn: 'Product Performance', icon: 'trophy' },
      { tab: 'sales_insights', label: 'Maarifa ya Mauzo', labelEn: 'Sales Insights', icon: 'bolt' },
      { tab: 'demand_insights', label: 'Mahitaji ya Soko', labelEn: 'Demand Insights', icon: 'search' },
      { tab: 'product_compare', label: 'Linganisha Bidhaa', labelEn: 'Compare Products', icon: 'scales' }
    ]
  },

  /* ------------------------------------------------------------------ 4 */
  {
    id: 'stock',
    num: 4,
    label: 'Stoo na Usafirishaji',
    labelEn: 'Stock & Delivery',
    icon: 'archive',
    /* `items` = orodha bapa ya vitu vyote (aliasing ya UTANGAMANI): shell za zamani
       zilizohifadhiwa kwenye cache zinatumia `group.items.map(...)`; zikikuta
       `subgroups` pekee zinavunjika ("Cannot read properties of undefined
       (reading 'map')"). Kwa kuweka `items` pia, toleo lolote la shell linafanya kazi. */
    items: [
      { tab: 'inventory', label: 'Stoo & Hifadhi', labelEn: 'Inventory & Stock', icon: 'archive' },
      { action: 'openOfflineStockModal', label: 'Ingiza / Toa Stoo', labelEn: 'Stock In / Out', icon: 'download' },
      { action: 'openProcurementModal', label: 'Wasambazaji & Upokeaji', labelEn: 'Suppliers & Receiving', icon: 'truck' },
      { action: 'openStockTransferModal', label: 'Uhamisho wa Matawi', labelEn: 'Multi-Branch Transfers', icon: 'truck' },
      { tab: 'bookings', label: 'Maombi ya Usafirishaji', labelEn: 'Delivery Requests', icon: 'inbox' },
      { tab: 'trips', label: 'Safari Zinazoendelea', labelEn: 'Active Trips', icon: 'route' },
      { tab: 'tracking', label: 'Ufuatiliaji (Ramani)', labelEn: 'Live Tracking', icon: 'map' },
      { tab: 'drivers', label: 'Madereva / Mawakala', labelEn: 'Drivers & Agents', icon: 'users' },
      { tab: 'fleet', label: 'Vyombo (Fleet)', labelEn: 'Fleet', icon: 'truck' },
      { tab: 'cargo', label: 'Kituo cha Tokeni (Cargo)', labelEn: 'Logistics Tokens', icon: 'key' },
      { tab: 'finance', label: 'Matumizi ya Safari', labelEn: 'Travel Expenses', icon: 'bank' },
      { tab: 'analytics', label: 'Takwimu za Usafirishaji', labelEn: 'Delivery Performance', icon: 'chart' }
    ],
    subgroups: [
      {
        id: 'stock_core',
        label: 'A · Stoo',
        labelEn: 'A · Stock',
        items: [
          { tab: 'inventory', label: 'Stoo & Hifadhi', labelEn: 'Inventory & Stock', icon: 'archive' },
          { action: 'openOfflineStockModal', label: 'Ingiza / Toa Stoo', labelEn: 'Stock In / Out', icon: 'download' },
          { action: 'openProcurementModal', label: 'Wasambazaji & Upokeaji', labelEn: 'Suppliers & Receiving', icon: 'truck' }
        ]
      },
      {
        id: 'stock_logistics',
        label: 'B · Logistics ya Ndani',
        labelEn: 'B · Internal Logistics',
        items: [
          { action: 'openStockTransferModal', label: 'Uhamisho wa Matawi', labelEn: 'Multi-Branch Transfers', icon: 'truck' }
        ]
      },
      {
        id: 'stock_delivery',
        label: 'C · Usafirishaji wa Oda',
        labelEn: 'C · Order Delivery',
        items: [
          { tab: 'bookings', label: 'Maombi ya Usafirishaji', labelEn: 'Delivery Requests', icon: 'inbox' },
          { tab: 'trips', label: 'Safari Zinazoendelea', labelEn: 'Active Trips', icon: 'route' },
          { tab: 'tracking', label: 'Ufuatiliaji (Ramani)', labelEn: 'Live Tracking', icon: 'map' },
          { tab: 'drivers', label: 'Madereva / Mawakala', labelEn: 'Drivers & Agents', icon: 'users' },
          { tab: 'fleet', label: 'Vyombo (Fleet)', labelEn: 'Fleet', icon: 'truck' },
          { tab: 'cargo', label: 'Kituo cha Tokeni (Cargo)', labelEn: 'Logistics Tokens', icon: 'key' },
          { tab: 'finance', label: 'Matumizi ya Safari', labelEn: 'Travel Expenses', icon: 'bank' },
          { tab: 'analytics', label: 'Takwimu za Usafirishaji', labelEn: 'Delivery Performance', icon: 'chart' }
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------ 5 */
  {
    id: 'finance',
    num: 5,
    label: 'Fedha na Uhasibu',
    labelEn: 'Finance & Accounting',
    icon: 'bank',
    items: [
      /* Ukaguzi 2026-11-03: ukurasa wa `expenses` hauna uwezo wa General Ledger
         (hakuna chart of accounts, debit/credit, trial balance). Kwa hiyo
         unaitwa kwa kilicho kweli: Matumizi & Gharama. GL kamili = kazi ya
         baadaye (tazama MISSING-FEATURES report). */
      { tab: 'expenses', label: 'Matumizi & Gharama', labelEn: 'Expenses & Costs', icon: 'book' }
    ]
  },

  /* ------------------------------------------------------------------ 6 */
  {
    id: 'people',
    num: 6,
    label: 'Rasilimali Watu',
    labelEn: 'Human Resources',
    icon: 'users',
    items: [
      { tab: 'staff', label: 'Wafanyakazi & Mishahara', labelEn: 'Staff & Payroll', icon: 'briefcase' }
    ]
  },

  /* ------------------------------------------------------------------ 7 */
  {
    id: 'control',
    num: 7,
    label: 'Udhibiti',
    labelEn: 'Control & Governance',
    icon: 'shield',
    items: [
      { action: 'skhOpenAdminControlCenter', arg: 'overview', label: 'Kituo cha Udhibiti', labelEn: 'Control Center', icon: 'shield' },
      { action: 'skhOpenAdminControlCenter', arg: 'accounts', label: 'Watumiaji & Majukumu', labelEn: 'Users & Roles', icon: 'users' },
      { action: 'skhOpenAdminControlCenter', arg: 'verify', label: 'Uthibitisho & Idhini', labelEn: 'Verification & Approvals', icon: 'check' },
      { action: 'skhOpenAdminControlCenter', arg: 'audit', label: 'Kumbukumbu za Ukaguzi', labelEn: 'Audit Logs', icon: 'book' },
      { action: 'skhOpenAdminControlCenter', arg: 'policy', label: 'Sera & Kanuni', labelEn: 'Policy', icon: 'settings' }
    ]
  },

  /* ------------------------------------------------------------------ 8 */
  {
    id: 'pos',
    num: 8,
    label: 'POS — Mauzo ya Dukani',
    labelEn: 'POS — In-store Sales',
    icon: 'calculator',
    items: [
      /* Ukurasa kamili: terminal ile ile (`#businessOSForm`) inaingizwa kwenye
         workspace — tazama js/app/112-business-os-pos-page.js.
         Njia ya zamani ya modal (footer POS / showForm) ipo bado. */
      { tab: 'pos_page', label: 'POS Terminal', labelEn: 'POS Terminal', icon: 'calculator' }
    ]
  },

  /* ------------------------------------------------------------------ 9 */
  {
    id: 'settings',
    num: 9,
    label: 'Mipangilio ya Mfumo',
    labelEn: 'System Settings',
    icon: 'settings',
    items: [
      { tab: 'settings', label: 'Mipangilio ya Mfumo', labelEn: 'System Settings', icon: 'settings' }
    ]
  }
];

/* Shughuli za kudumu (footer ya sidebar) — hazibadilishi tab. */
export const BUSINESS_OS_ACTIONS = [
  { action: 'openPos', label: 'POS — Mauzo ya Dukani', labelEn: 'POS', icon: 'calculator', primary: true },
  { action: 'skhOpenKamusi', label: 'Kamusi ya SokoHai', labelEn: 'Dictionary', icon: 'book' }
];

/* Kurudi sokoni — kilele cha sidebar (kama awali: Rudi Soko Kuu). */
export const BUSINESS_OS_EXIT = { action: 'switchModeBuyer', label: 'Rudi Soko Kuu', labelEn: 'Back to Market', icon: 'arrow-left' };

/* Ukurasa wa kwanza (default landing) — Dashboard Kuu. */
export const BUSINESS_OS_DEFAULT_TAB = 'overview';

/* ---------- wasaidizi ---------- */

/* Vitu vyote vya kikundi. `subgroups` (A/B/C) ndiyo chanzo cha ukweli;
   `items` ni nakala bapa ya utangamani kwa shell za zamani. */
export function itemsOfGroup(group) {
  if (!group) return [];
  if (Array.isArray(group.subgroups) && group.subgroups.length) {
    return group.subgroups.reduce((list, sg) => list.concat(sg.items || []), []);
  }
  return group.items || [];
}

export function allTabs() {
  return BUSINESS_OS_NAV.reduce((list, group) => {
    itemsOfGroup(group).forEach(item => { if (item.tab && list.indexOf(item.tab) === -1) list.push(item.tab); });
    return list;
  }, []);
}

export function allItems() {
  const out = [];
  BUSINESS_OS_NAV.forEach(group => itemsOfGroup(group).forEach(item => out.push({ group: group.id, item })));
  return out;
}

export function groupOfTab(tab) {
  const group = BUSINESS_OS_NAV.find(g => itemsOfGroup(g).some(i => i.tab === tab));
  return group ? group.id : null;
}

export function findItem(tab) {
  for (const group of BUSINESS_OS_NAV) {
    const hit = itemsOfGroup(group).find(i => i.tab === tab);
    if (hit) return hit;
  }
  return null;
}

export function findAction(action, arg) {
  for (const group of BUSINESS_OS_NAV) {
    const hit = itemsOfGroup(group).find(i => i.action === action && (arg === undefined || i.arg === arg));
    if (hit) return hit;
  }
  return null;
}

/* Orodha bapa ya vitendo vyote — hutumika kuhakikisha hakuna action iliyopotea. */
export function allActions() {
  const list = [];
  BUSINESS_OS_NAV.forEach(g => itemsOfGroup(g).forEach(i => { if (i.action) list.push(i.action); }));
  BUSINESS_OS_ACTIONS.forEach(a => list.push(a.action));
  list.push(BUSINESS_OS_EXIT.action);
  return list.filter((v, i, a) => a.indexOf(v) === i);
}

/* Moduli 9 kwa mpangilio — kwa majaribio na ripoti. */
export function moduleIds() {
  return BUSINESS_OS_NAV.map(g => g.id);
}

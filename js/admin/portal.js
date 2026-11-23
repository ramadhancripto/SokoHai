/* ==== js/admin/portal.js ====                                   [ADMIN PORTAL 2026-11-21]
 * SokoHai Central Admin Portal (served at /admin/, intended host admin.sokohai.com).
 *
 * Architecture: ONE backend. The portal reuses the marketplace's shared layer (js/app/00-bootstrap.js: Firebase
 * project selection, emulator wiring, callable wrapper) and the EXISTING admin tools (js/app/98-admin-control-center.js
 * views backed by the admin Cloud Functions, 130 support, 131 search/SEO). Nothing is duplicated: the portal only
 * gives them their own sign-in page and their own full-screen shell instead of a modal inside the marketplace.
 *
 * Security is enforced by the server, not by this page:
 *   - Firestore rules (isAdmin / isSuperAdmin / isSupportStaff) decide every read and write;
 *   - every admin action goes through a Cloud Function that re-checks the role and writes admin_audit_log;
 *   - the page reads the ID-token claims only to decide what to SHOW. There is no registration here — roles are
 *     granted by a Super Admin (adminSetRole), which also records an audit entry.
 * Roles: superAdmin (everything incl. roles), admin (operations), support (support requests only). */
import { skh } from '../app/00-bootstrap.js';
import '../app/98-admin-control-center.js';
import '../app/130-support-center.js';
import '../app/131-search-insights.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let ROLE = { admin: false, superAdmin: false, support: false, email: '' };
let CURRENT = '';

/* [I18N 2026-11-22] The portal follows the same language preference as the marketplace (localStorage
 * 'sokohai_language'). Its own interface is translated here; record values (titles, statuses, ids) are data and are
 * shown as stored. Views reused from the Admin Control Center keep the language of that module. */
const LS_LANG = 'sokohai_language';
let LANG = (() => { try { return localStorage.getItem(LS_LANG) === 'en' ? 'en' : 'sw'; } catch (e) { return 'sw'; } })();
const TX = {
  brand_sub: ['Administration Centre', 'Kituo cha Utawala'], login_h: ['Sign in as an administrator', 'Ingia kama msimamizi'],
  login_note: ['Administrator accounts are created by a Super Admin only. There is no registration here.', 'Akaunti za wasimamizi huundwa na Super Admin pekee. Hakuna usajili hapa.'],
  email: ['Email', 'Barua pepe'], password: ['Password', 'Nenosiri'], sign_in: ['Sign in', 'Ingia'], google: ['Sign in with Google', 'Ingia kwa Google'],
  back: ['Back to the marketplace', 'Rudi sokoni'], sign_out: ['Sign out', 'Toka'], loading: ['Loading…', 'Inapakia…'], menu: ['Menu', 'Menyu'], nav: ['Administration sections', 'Sehemu za utawala'],
  lang_other: ['Kiswahili', 'English'],
  role_super: ['Super Admin', 'Super Admin'], role_admin: ['Admin', 'Admin'], role_support: ['Support', 'Msaada'],
  no_access: ['This account has no administration access. Contact a Super Admin.', 'Akaunti hii haina ruhusa ya utawala. Wasiliana na Super Admin.'],
  bad_login: ['Wrong email or password.', 'Barua pepe au nenosiri si sahihi.'], too_many: ['Too many attempts. Wait a little and try again.', 'Majaribio mengi. Subiri kidogo kisha ujaribu tena.'],
  login_fail: ['Sign-in failed. Try again.', 'Imeshindikana kuingia. Jaribu tena.'], google_fail: ['Google sign-in did not complete.', 'Kuingia kwa Google hakukukamilika.'],
  rec_note: ['Latest real records (up to 50), read only.', 'Rekodi halisi za karibuni (hadi 50), kusoma tu.'], rec_latest: ['latest', 'za karibuni'],
  rec_denied: ['The security rules do not allow this account to read this section.', 'Sheria za usalama haziruhusu akaunti hii kusoma sehemu hii.'],
  rec_failed: ['Could not load the records. Try again.', 'Imeshindikana kupakia rekodi. Jaribu tena.'], rec_none: ['No records yet.', 'Hakuna rekodi bado.'],
  tools_missing: ['The administration tools did not load.', 'Zana za utawala hazijapakia.']
};
const tr = (k) => { const e = TX[k]; return e ? e[LANG === 'en' ? 0 : 1] : k; };
const L2 = (v) => Array.isArray(v) ? v[LANG === 'en' ? 0 : 1] : v;   // [en, sw] label or a plain string
function applyStatic() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-ap-t]').forEach(el => { el.textContent = tr(el.getAttribute('data-ap-t')); });
  document.querySelectorAll('[data-ap-t-aria]').forEach(el => { el.setAttribute('aria-label', tr(el.getAttribute('data-ap-t-aria'))); });
  document.querySelectorAll('[data-ap-lang]').forEach(el => { el.textContent = tr('lang_other'); });
}
function setLang(l) {
  LANG = l === 'en' ? 'en' : 'sw'; try { localStorage.setItem(LS_LANG, LANG); } catch (e) {}
  applyStatic(); setRoleLabel(); nav();
  const it = CURRENT && find(CURRENT); if (it && it[2].records) records(it[2].records, L2(it[1]));
}
function setRoleLabel() { const el = $('apRole'); if (el && (ROLE.admin || ROLE.support)) el.textContent = tr(ROLE.superAdmin ? 'role_super' : ROLE.admin ? 'role_admin' : 'role_support'); }

/* Sections. `cc` = a view of the existing Admin Control Center; `records` = read-only list of real documents. */
const SECTIONS = [
  { group: ['Overview', 'Muhtasari'], items: [['overview', ['System overview', 'Muhtasari wa mfumo'], { cc: 'overview' }]] },
  { group: ['People', 'Watu'], items: [['accounts', ['Accounts', 'Akaunti'], { cc: 'accounts' }], ['agents', ['Agents', 'Mawakala'], { cc: 'agents' }], ['verify', ['Verification', 'Uthibitisho'], { cc: 'verify' }], ['trust', ['Trust badges', 'Beji za uaminifu'], { cc: 'trust' }],
    ['users', ['User profiles', 'Wasifu wa watumiaji'], { records: { col: 'userCards', fields: ['displayName', 'businessName', 'region', 'verified', 'updatedAt'] } }]] },
  { group: ['Marketplace', 'Soko'], items: [['listings', ['Listings (hide/restore)', 'Matangazo (ficha/rudisha)'], { cc: 'listings' }],
    ['products', ['Products', 'Bidhaa'], { records: { col: 'products', fields: ['title', 'price', 'publicationStatus', 'availabilityStatus', 'countryCode', 'updatedAt'] } }],
    ['services', ['Services', 'Huduma'], { records: { col: 'services', fields: ['title', 'price', 'location', 'availabilityStatus', 'createdAt'] } }],
    ['drivers', ['Transport', 'Usafiri'], { records: { col: 'drivers', fields: ['driverName', 'vehicleType', 'status', 'createdAt'] } }],
    ['prices', ['Price review', 'Ukaguzi wa bei'], { cc: 'prices' }], ['auctions', ['Auctions', 'Minada'], { cc: 'auctions' }], ['groupbuy', 'Group Buy', { cc: 'groupbuy' }],
    ['live', 'Live commerce', { records: { col: 'live_sessions', fields: ['title', 'status', 'hostUid', 'startedAt'] } }]] },
  { group: ['Orders & SokoPay', 'Oda & SokoPay'], items: [['orders', ['Orders', 'Oda'], { records: { col: 'orders', fields: ['itemTitle', 'amount', 'status', 'createdAt'] } }],
    ['sokopay', ['SokoPay transactions', 'Miamala ya SokoPay'], { records: { col: 'sokopay_core_transactions', fields: ['orderId', 'amount', 'status', 'createdAt'] } }],
    ['disputes', ['Disputes', 'Migogoro'], { cc: 'disputes' }], ['withdrawals', ['Withdrawals', 'Kutoa pesa'], { cc: 'withdrawals' }], ['policy', ['Payment policy', 'Sera ya malipo'], { cc: 'policy', superOnly: true }]] },
  { group: ['Content moderation', 'Usimamizi wa maudhui'], items: [['reports', ['Listing reports', 'Ripoti za matangazo'], { records: { col: 'listing_reports', fields: ['reason', 'listingId', 'status', 'createdAt'] } }],
    ['chatreports', ['Chat reports', 'Ripoti za chat'], { records: { col: 'chatReports', fields: ['reason', 'status', 'createdAt'] } }]] },
  { group: ['Support', 'Msaada'], items: [['support', ['Support requests', 'Maombi ya msaada'], { cc: 'support', support: true }]] },
  { group: ['Growth', 'Ukuaji'], items: [['search', ['Search', 'Utafutaji'], { cc: 'search' }], ['seo', ['SEO & links', 'SEO & viungo'], { cc: 'seo' }]] },
  { group: ['Security', 'Usalama'], items: [['security', ['Security events', 'Matukio ya usalama'], { records: { col: 'security_events', fields: ['type', 'uid', 'by', 'at', 'createdAt'] } }],
    ['audit', ['Audit log', 'Kumbukumbu za ukaguzi'], { cc: 'audit' }], ['errors', ['Application errors', 'Hitilafu za programu'], { records: { col: 'client_errors', fields: ['message', 'page', 'at', 'createdAt'] } }]] }
];
const allowed = (o) => ROLE.superAdmin || (ROLE.admin && !o.superOnly) || (ROLE.support && o.support === true);

function show(el, on) { if (el) el.hidden = !on; }
function nav() {
  $('apNav').innerHTML = SECTIONS.map(g => {
    const items = g.items.filter(([, , o]) => allowed(o));
    if (!items.length) return '';
    return '<div class="ap-nav-g"><span>' + esc(L2(g.group)) + '</span>' + items.map(([k, label]) =>
      '<button type="button" data-ap="' + esc(k) + '"' + (k === CURRENT ? ' aria-current="page"' : '') + '>' + esc(L2(label)) + '</button>').join('') + '</div>';
  }).join('');
}
function find(key) { for (const g of SECTIONS) for (const it of g.items) if (it[0] === key) return it; return null; }

async function records(spec, title) {
  const main = $('apMain');
  main.innerHTML = '<h1 class="ap-h1">' + esc(title) + '</h1><p class="ap-muted">' + esc(tr('rec_note')) + '</p><div class="ap-loading">' + esc(tr('loading')) + '</div>';
  let rows = [], err = '';
  try {
    const q = skh.query(skh.collection(skh.db, spec.col), skh.limit(50));
    const snap = await skh.getDocs(q);
    snap.forEach(d => rows.push(Object.assign({ __id: d.id }, d.data())));
    rows.sort((a, b) => String(b.updatedAt || b.createdAt || b.at || '').localeCompare(String(a.updatedAt || a.createdAt || a.at || '')));
  } catch (e) { err = /permission|insufficient/i.test(String(e && (e.code || e.message))) ? tr('rec_denied') : tr('rec_failed'); }
  const val = (v) => v == null ? '' : (typeof v === 'object' ? (v.seconds ? new Date(v.seconds * 1000).toISOString() : JSON.stringify(v)) : String(v));
  main.innerHTML = '<h1 class="ap-h1">' + esc(title) + '</h1>'
    + (err ? '<div class="ap-empty ap-empty--err">' + esc(err) + '</div>'
      : !rows.length ? '<div class="ap-empty">' + esc(tr('rec_none')) + '</div>'
      : '<p class="ap-muted">' + rows.length + ' ' + esc(tr('rec_latest')) + ' · <code>' + esc(spec.col) + '</code></p><div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>ID</th>'
        + spec.fields.map(f => '<th>' + esc(f) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr><td><code>' + esc(r.__id.slice(0, 14)) + '</code></td>' + spec.fields.map(f => '<td>' + esc(val(r[f]).slice(0, 80)) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
}

async function open(key) {
  const it = find(key); if (!it || !allowed(it[2])) return;
  CURRENT = key; nav();
  const o = it[2], main = $('apMain');
  try { history.replaceState(null, '', '#' + key); } catch (e) {}
  document.body.classList.remove('ap-nav-open'); $('apMenuBtn').setAttribute('aria-expanded', 'false');
  if (o.records) return records(o.records, L2(it[1]));
  // existing Admin Control Center view, rendered inside the portal (its own modal is re-parented and shown inline)
  main.innerHTML = '';
  if (typeof window.skhOpenAdminControlCenter !== 'function') { main.innerHTML = '<div class="ap-empty ap-empty--err">' + esc(tr('tools_missing')) + '</div>'; return; }
  await window.skhOpenAdminControlCenter(o.cc);
  const cc = document.getElementById('skhAdminCC');
  if (cc) { main.appendChild(cc); cc.classList.add('ap-cc'); }
  main.focus({ preventScroll: true });
}

async function claims(user) {
  const t = await user.getIdTokenResult(true);
  const c = t.claims || {};
  const superAdmin = c.superAdmin === true;
  const admin = superAdmin || c.admin === true || c.role === 'admin';
  const support = c.role === 'support';
  return { admin, superAdmin, support, email: user.email || '' };
}

async function onUser(user) {
  show($('apBoot'), false);
  if (!user) { show($('apApp'), false); show($('apLogin'), true); return; }
  try { ROLE = await claims(user); } catch (e) { ROLE = { admin: false, superAdmin: false, support: false }; }
  if (!ROLE.admin && !ROLE.support) {
    $('apLoginMsg').textContent = tr('no_access');
    try { await skh.signOut(skh.auth); } catch (e) {}
    show($('apApp'), false); show($('apLogin'), true); return;
  }
  $('apWho').textContent = ROLE.email; setRoleLabel();
  show($('apLogin'), false); show($('apApp'), true);
  const want = (location.hash || '').slice(1);
  const first = find(want) && allowed(find(want)[2]) ? want : (ROLE.admin ? 'overview' : 'support');
  open(first);
}

function wire() {
  $('apLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('apLoginMsg'); msg.textContent = '';
    const btn = $('apSignIn'); btn.disabled = true;
    try { await skh.signInWithEmailAndPassword(skh.auth, $('apEmail').value.trim(), $('apPass').value); }
    catch (err) { msg.textContent = /wrong-password|invalid-credential|user-not-found|invalid-email/.test(String(err && err.code)) ? tr('bad_login') : /too-many/.test(String(err && err.code)) ? tr('too_many') : tr('login_fail'); }
    finally { btn.disabled = false; }
  });
  $('apGoogle').addEventListener('click', async () => {
    try { const p = new skh.GoogleAuthProvider(); await skh.signInWithPopup(skh.auth, p); } catch (e) { $('apLoginMsg').textContent = tr('google_fail'); }
  });
  $('apSignOut').addEventListener('click', () => skh.signOut(skh.auth));
  $('apNav').addEventListener('click', (e) => { const b = e.target.closest('[data-ap]'); if (b) open(b.getAttribute('data-ap')); });
  $('apMenuBtn').addEventListener('click', () => { const on = document.body.classList.toggle('ap-nav-open'); $('apMenuBtn').setAttribute('aria-expanded', String(on)); });
  document.querySelectorAll('[data-ap-lang]').forEach(b => b.addEventListener('click', () => setLang(LANG === 'en' ? 'sw' : 'en')));
  applyStatic();
  skh.onAuthStateChanged(skh.auth, onUser);
}
window.skhAdminPortal = { open, role: () => Object.assign({}, ROLE), setLang, lang: () => LANG };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

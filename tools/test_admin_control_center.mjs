#!/usr/bin/env node
/**
 * [REPAIR 2026-10 Phase 6] Admin Control Center UI contract (jsdom).
 * Loads the REAL js/app/98-admin-control-center.js against a stubbed
 * 00-bootstrap (Firestore reads + callables recorded, no network) and checks:
 * server role gate, every tab renders, actions call the right callable with a
 * reason, and nothing is sent when the reason is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
const dir = fs.mkdtempSync(path.join(root, '.tmp', 'admincc-'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const dom = new JSDOM('<!doctype html><html><body><div id="richDashboardContainer"></div></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
const calls = [];
let ROLE = { admin: true, superAdmin: false };
let promptAnswers = [];
window.skhPrompt = async () => promptAnswers.shift();
window.skhConfirm = async () => true;
const toasts = []; window.skhToast = (m, t) => toasts.push([t, m]);
const DATA = {
  'orders:paymentStatus:price_review': [{ id: 'o1', data: { itemTitle: 'Simu', amount: 1000, priceExpected: 250000, priceReviewReason: 'underpriced' } }],
  'disputes:status:open,under_review': [{ id: 'order_o2', data: { targetKind: 'order', targetId: 'o2', amount: 40000, openedByRole: 'buyer', reason: 'Bidhaa mbovu', createdAt: '2026-10-30T10:00:00Z' } }],
  'users:isApprovedAgent:true': [{ id: 'ag1', data: { uid: 'ag1', fullName: 'Wakala wa Zamani', isApprovedAgent: true } }, { id: 'ag2', data: { uid: 'ag2', fullName: 'Wakala Mpya', isApprovedAgent: true, agentApprovedBy: 'ops' } }],
  'agents:status:pending': [],
  'users:agentStatus:suspended': [{ id: 'ag3', data: { uid: 'ag3', fullName: 'Wakala Aliyesimamishwa', agentStatus: 'suspended' } }], 'agents:userId:ag1': [{ id: 'app_ag1', data: { userId: 'ag1' } }]
};
fs.writeFileSync(path.join(dir, '00-bootstrap.js'), `
const W = globalThis.window;
export const skh = {
  db: {}, skhEscape: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
  collection: (db, c) => ({ c }), doc: (db, c, id) => ({ c, id }), limit: () => null,
  where: (f, op, v) => ({ f, v: Array.isArray(v) ? v.join(',') : String(v) }),
  query: (col, w) => ({ key: col.c + ':' + (w ? w.f + ':' + w.v : '') }),
  getDocs: async (q) => { const rows = (W.__DATA[q.key] || []); return { size: rows.length, empty: !rows.length, docs: rows.map(r => ({ id: r.id, data: () => r.data })), forEach: (fn) => rows.forEach(r => fn({ id: r.id, data: () => r.data })) }; },
  getDoc: async (ref) => ({ id: ref.id, exists: () => ref.c === 'system', data: () => ({ escrow: { autoReleaseAfterDeliveryHours: 72 } }) }),
  wrapCallable: (name) => async (data) => { W.__CALLS.push({ name, data }); if (name === 'adminWhoAmI') return { data: Object.assign({ ok: true }, W.__ROLE) }; if (name === 'adminAuditQuery') return { data: { ok: true, rows: [{ action: 'ROLE_SET', actorEmail: 'owner@x', createdAt: '2026-10-30T09:00:00Z', target: { kind: 'user', uid: 'u9' }, details: { reason: 'Msaidizi' } }] } }; return { data: { ok: true } }; }
};`);
window.__DATA = DATA; window.__CALLS = calls; window.__ROLE = ROLE;
fs.copyFileSync(path.join(root, 'js/app/98-admin-control-center.js'), path.join(dir, '98-admin-control-center.js')); // copy: tests the real file without loading Firebase
window.loadAdminDashboard = async () => {};
await import(pathToFileURL(path.join(dir, '98-admin-control-center.js')).href);
const tick = (ms) => new Promise(r => setTimeout(r, ms || 20));
const body = () => (document.getElementById('skhAdminCC') || {}).innerHTML || '';

try {
  await window.loadAdminDashboard(); await tick(300);
  ok('dashboard button injected', !!document.getElementById('skhAdminCCBtn'));

  window.__ROLE = { admin: false, superAdmin: false };
  await window.skhOpenAdminControlCenter(); await tick();
  ok('non-admin (server says no) sees no tools', /Hakuna ruhusa/.test(body()) && !/Ukaguzi wa Bei/.test(body()));

  window.__ROLE = { admin: true, superAdmin: false };
  await window.skhOpenAdminControlCenter(); await tick(50);
  ok('admin sees overview with pending counts', /Kazi zinazosubiri/.test(body()) && /Oda kwenye ukaguzi wa bei/.test(body()));
  for (const t of ['accounts', 'agents', 'prices', 'disputes', 'verify', 'listings', 'policy', 'audit']) {
    await window.skhAdminCCTab(t); await tick();
    ok('tab renders: ' + t, body().length > 200 && !/Hitilafu/.test(body()));
  }
  await window.skhAdminCCTab('agents'); await tick();
  ok('legacy agent flagged for re-verification', /Wakala wa Zamani/.test(body()) && /Hakiki upya/.test(body()));
  ok('suspended agent listed with reinstate action', /Wakala Aliyesimamishwa/.test(body()) && /Rejesha uwakala/.test(body()));
  await window.skhAdminCCTab('policy'); await tick();
  ok('ordinary admin: escrow policy is read-only', /soma tu/.test(body()) && /disabled/.test(body()));

  // actions without a reason send nothing
  const before = calls.length;
  promptAnswers = ['ab'];
  await window.skhAdminCCApprovePrice('o1');
  ok('no call when reason too short', calls.length === before && toasts.some(([t]) => t === 'error'));

  promptAnswers = ['Muuzaji na mnunuzi wamethibitisha bei kwa simu'];
  await window.skhAdminCCApprovePrice('o1');
  const ap = calls.find(c => c.name === 'adminApproveOrderPrice');
  ok('approve price calls server with reason', !!ap && ap.data.orderId === 'o1' && ap.data.reason.length >= 10);

  promptAnswers = ['15000', 'Ushahidi wa picha unaonyesha kasoro nusu'];
  await window.skhAdminCCResolve('order', 'o2', 'split');
  const rs = calls.find(c => c.name === 'adminResolveDispute');
  ok('split dispute sends outcome, buyerAmount and reason', !!rs && rs.data.orderId === 'o2' && rs.data.outcome === 'split' && rs.data.buyerAmount === 15000 && /kasoro/.test(rs.data.reason));

  promptAnswers = ['Nyaraka za NIDA zimehakikiwa'];
  await window.skhAdminCCReverify('ag1');
  const rv = calls.find(c => c.name === 'adminApproveAgent');
  ok('re-verify legacy agent uses adminApproveAgent with agents doc id', !!rv && rv.data.agentDocId === 'app_ag1');

  promptAnswers = ['Udanganyifu uliothibitishwa'];
  await window.skhAdminCCAccount('u7', 'suspended');
  const su = calls.find(c => c.name === 'adminSetAccountStatus');
  ok('suspend account sends status + reason', !!su && su.data.status === 'suspended' && su.data.uid === 'u7');

  window.__ROLE = { admin: true, superAdmin: true };
  await window.skhOpenAdminControlCenter(); await tick(50); await window.skhAdminCCTab('policy'); await tick();
  ok('super admin can edit escrow policy', /Hifadhi sera/.test(body()) && !/soma tu/.test(body()));
  document.getElementById('ccPAuto').value = '48'; document.getElementById('ccPDisp').value = '';
  promptAnswers = ['Sera ya majaribio ya uzinduzi'];
  await window.skhAdminCCSavePolicy();
  const pol = calls.find(c => c.name === 'adminSetEscrowPolicy');
  ok('policy save sends numbers (empty = off) + reason', !!pol && pol.data.escrow.autoReleaseAfterDeliveryHours === 48 && pol.data.escrow.disputeWindowHours === null && pol.data.features.chatGroupOrders === false);
  await window.skhAdminCCTab('policy'); await tick();
  ok('super admin sees public-card backfill', /Jaza kadi za umma/.test(body()));
  await window.skhAdminCCBackfillCards(); await tick();
  ok('backfill calls the audited server callable', calls.some(c => c.name === 'adminBackfillUserCards'));
  await window.skhAdminCCTab('audit'); await tick();
  ok('audit tab lists server rows', /ROLE_SET/.test(body()) && /Msaidizi/.test(body()));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\nADMIN CONTROL CENTER UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

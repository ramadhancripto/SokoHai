#!/usr/bin/env node
/* P-BE-1 — Mfululizo wa kila siku (`daily[]`) kwenye posReports.
   Inathibitisha kuwa daily[] ni HESABU PEKEE kutoka rekodi zilezile:
   hakuna collection mpya, hakuna semantics iliyobadilika, na jumla zinalingana.

   Matumizi: node tools/test_reporting_daily_series.mjs
*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const script = String.raw`
const Module = require('module');
const original = Module._load;
function firestore() { return { collection: () => ({ where() { return this; }, get: async () => ({ docs: [] }) }) }; }
firestore.FieldValue = {};
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-functions/v2/https') return { onCall: (_o, h) => h, HttpsError: class HttpsError extends Error { constructor(c, m) { super(m); this.code = c; } } };
  if (request === 'firebase-admin') return { firestore };
  if (request === './business-store-authority') return { resolveBusinessStoreContext: async ({ requestedBusinessId, requestedStoreId }) => ({ businessId: requestedBusinessId, storeId: requestedStoreId, ownerUid: 'owner' }) };
  return original.call(this, request, parent, isMain);
};

const { _testing } = require('./functions/reporting-authority');
const { aggregateReport, buildDailySeries, dayKey } = _testing;
const fail = (m) => { throw new Error(m); };

const B = 'biz_1', S = 'store_1';
const period = { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' };

const sale = (id, day, total, method = 'Cash', status = 'COMPLETED') => ({
  saleId: id, businessId: B, storeId: S, cashierId: 'c1', status,
  completedAt: '2026-09-' + day + 'T10:00:00.000Z',
  totals: { total, discount: 0 },
  payment: { method, status: 'RECORDED', amount: total, cashReceived: total, change: 0 },
  items: [{ productId: 'p1', variantId: 'v1', unitId: 'piece', inventoryKey: 'p1:v1:piece', quantity: 1, lineTotal: total }]
});

/* ---------- 1. Kipindi cha siku 30: kila siku ipo ---------- */
let report = aggregateReport({
  businessId: B, storeId: S, period,
  sales: [sale('s1', '10', 100), sale('s2', '10', 50), sale('s3', '11', 200)],
  adjustments: [{ businessId: B, storeId: S, status: 'RETURNED', amount: 20, updatedAt: '2026-09-11T12:00:00.000Z' }],
  voids: [{ businessId: B, storeId: S, status: 'VOIDED', originalSaleTotal: 30, updatedAt: '2026-09-12T12:00:00.000Z' }],
  ledger: [{ businessId: B, storeId: S, type: 'expense', amount: 8, date: '2026-09-10T09:00:00.000Z' }]
});
if (!Array.isArray(report.daily)) fail('daily[] haipo');
if (report.daily.length !== 30) fail('urefu wa daily si siku 30: ' + report.daily.length);
if (report.daily[0].date !== '2026-09-01') fail('siku ya kwanza');
if (report.daily[29].date !== '2026-09-30') fail('siku ya mwisho');

const d10 = report.daily.find(r => r.date === '2026-09-10');
const d11 = report.daily.find(r => r.date === '2026-09-11');
const d12 = report.daily.find(r => r.date === '2026-09-12');
const d5 = report.daily.find(r => r.date === '2026-09-05');
if (d10.grossSales !== 150 || d10.completedSales !== 2 || d10.expenses !== 8) fail('siku ya 10');
if (d11.grossSales !== 200 || d11.returnedAmount !== 20) fail('siku ya 11');
if (d12.voidValue !== 30) fail('siku ya 12 (void)');
if (d5.grossSales !== 0 || d5.completedSales !== 0) fail('siku tupu');

/* ---------- 2. Jumla za daily = jumla za summary ---------- */
const sum = (k) => Math.round(report.daily.reduce((a, r) => a + r[k], 0) * 100) / 100;
if (sum('grossSales') !== report.summary.grossSales) fail('gross hailingani: ' + sum('grossSales') + ' vs ' + report.summary.grossSales);
if (sum('returnedAmount') !== report.summary.returnedAmount) fail('returns hailingani');
if (sum('voidValue') !== report.summary.voidValue) fail('voids hailingani');
if (sum('completedSales') !== report.summary.completedSales) fail('odas hailingani');
const netFromDaily = Math.round(report.daily.reduce((a, r) => a + (r.grossSales - r.returnedAmount - r.voidValue), 0) * 100) / 100;
if (netFromDaily !== report.summary.netSales) fail('net hailingani: ' + netFromDaily + ' vs ' + report.summary.netSales);

/* ---------- 3. Upeo wa duka/biashara hauvalii ---------- */
report = aggregateReport({
  businessId: B, storeId: S, period,
  sales: [sale('s9', '10', 100), { ...sale('s10', '10', 999), businessId: 'other' }, { ...sale('s11', '10', 777), storeId: 'other-store' }]
});
if (report.summary.grossSales !== 100) fail('scope leak kwenye summary');
if (report.daily.reduce((a, r) => a + r.grossSales, 0) !== 100) fail('scope leak kwenye daily');

/* ---------- 4. Siku moja (preset today) ---------- */
report = aggregateReport({ businessId: B, storeId: S, period: { start: '2026-09-10T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' }, sales: [sale('s1', '10', 100)] });
if (report.daily.length !== 1 || report.daily[0].date !== '2026-09-10' || report.daily[0].grossSales !== 100) fail('kipindi cha siku moja');

/* ---------- 5. Kipindi kirefu (> 370 siku) → siku zenye shughuli pekee ---------- */
const longSale = { ...sale('s1', '10', 100), completedAt: '2024-01-10T10:00:00.000Z' };
report = aggregateReport({ businessId: B, storeId: S, period: { start: '2024-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z' }, sales: [longSale] });
if (report.daily.length !== 1 || report.daily[0].date !== '2024-01-10') fail('kipindi kirefu: ' + JSON.stringify(report.daily.slice(0, 2)));

/* ---------- 6. Kipindi tupu → sifuri, hakuna NaN ---------- */
report = aggregateReport({ businessId: B, storeId: S, period });
if (report.daily.length !== 30) fail('daily ya kipindi tupu');
if (!report.daily.every(r => r.grossSales === 0 && r.netSales === 0 && Number.isFinite(r.netSales))) fail('daily tupu ina NaN');

/* ---------- 7. Saa 23:30 UTC inabaki siku ileile ---------- */
if (dayKey('2026-09-10T23:30:00.000Z') !== '2026-09-10') fail('dayKey UTC');
if (buildDailySeries({}, period).length !== 30) fail('buildDailySeries urefu');

/* ---------- 8. Semantics za awali hazijabadilika ---------- */
report = aggregateReport({
  businessId: B, storeId: S, period,
  sales: [sale('s1', '10', 100)],
  adjustments: [{ businessId: B, storeId: S, status: 'RETURNED', amount: 20, paymentStatus: 'REFUND_PENDING', updatedAt: '2026-09-11T10:00:00.000Z' }]
});
if (report.summary.grossSales !== 100 || report.summary.returnedAmount !== 20 || report.summary.netSales !== 80) fail('semantics za summary zimebadilika');
if (report.summary.refundsPending !== 20) fail('refundsPending imebadilika');

console.log('P-BE-1 daily[] behavioral checks passed');
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], { input: script, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
assert.ok(true);
console.log('REPORTING DAILY SERIES (P-BE-1): all checks passed');

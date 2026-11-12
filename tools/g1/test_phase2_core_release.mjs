// Phase 2 (P2-1): SokoPay core release must be SERVER-FIRST.
// Real js/app/55-escrow-guard.js is eval'd under JSDOM with a stubbed skh.
// Proves: escrowRelease called with linked orderId BEFORE any display patch;
// patch+toast only on server ok; honest errors; no fake success.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' :: ' + extra}`); };

function baseCore(over = {}) {
  return Object.assign({
    orderId: 'ORD-1', transactionToken: 'TT-1', orderDocId: 'ORDER1',
    paymentStatus: 'Paid', escrowStatus: 'Held', shipmentStatus: 'Delivered',
    orderStatus: 'Active', contractStatus: 'Active', amount: 10000,
  }, over);
}

function freshHarness(coreDoc, { queryDocs = [], serverRelease = { ok: true, split: { sellerEarned: 9500 } }, serverDispute = { ok: true }, guardOnce = false } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://x.test/' });
  const g = dom.window;
  const toasts = [], updates = [], serverCalls = [], guardCalls = [], confirms = [], prompts = [];
  let ran = false;
  const skh = {
    db: {}, currentUser: { uid: 'BUYER1' },
    skhEscape: (s) => String(s == null ? '' : s),
    collection: (db, c) => ({ __col: c }),
    doc: (db, c, id) => ({ __doc: `${c}/${id}` }),
    query: (c, ...conds) => ({ __q: c, conds }),
    where: (f, op, v) => ({ f, op, v }),
    limit: (n) => ({ n }),
    arrayUnion: (o) => ({ __union: o }),
    getDoc: async (ref) => {
      if (String(ref.__doc || '').startsWith('sokopay_core_transactions/')) {
        return coreDoc ? { exists: () => true, data: () => coreDoc } : { exists: () => false };
      }
      return { exists: () => false };
    },
    getDocs: async () => (queryDocs.length ? { empty: false, docs: queryDocs.map((id) => ({ id })) } : { empty: true, docs: [] }),
    updateDoc: async (ref, patch) => { updates.push({ ref: ref.__doc, patch }); return {}; },
    wrapCallable: (name) => async (payload) => {
      serverCalls.push({ name, payload });
      const canned = name === 'escrowRelease' ? serverRelease : serverDispute;
      if (canned && canned.__throw) throw new Error(canned.__throw);
      return { data: canned };
    },
  };
  g.skh = skh;
  g.skhBusy = () => {};
  g.skhToast = (msg, type) => toasts.push({ msg: String(msg), type });
  g.skhConfirm = async (body, o) => { confirms.push({ body: String(body).slice(0, 120), o }); return true; };
  g.skhPrompt = async () => { prompts.push(1); return 'Mzigo haujafika'; };
  g.skhShowErr = () => {};
  g.skhNavIcon = () => '';
  g.openSokoPayOrderDetail = () => {};
  g.confirmSokoPayDelivery = async () => {}; // orig for 55's install() to wrap
  g.skhGuard = async (key, btn, fn) => {
    guardCalls.push(key);
    if (guardOnce) { if (ran) return { deduped: true }; ran = true; }
    return fn();
  };
  const src = fs.readFileSync(new URL('../../js/app/55-escrow-guard.js', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.startsWith('import ') && !l.startsWith('export ')).join('\n');
  const runner = new g.Function('window', 'document', 'navigator', 'skh', 'skhBusy', 'skhToast', 'skhConfirm', 'skhPrompt',
    `${src}\n;return { confirm: window.confirmSokoPayDelivery, report: window.skhReportDeliveryProblem, find: window.skhFindLinkedOrderId };`);
  const fns = runner(g, g.document, g.navigator, skh, g.skhBusy, g.skhToast, g.skhConfirm, g.skhPrompt, setTimeout, clearTimeout);
  const has = (sub, type) => toasts.some((t) => t.msg.includes(sub) && (!type || t.type === type));
  return { fns, toasts, updates, serverCalls, guardCalls, confirms, has };
}

// 1-3) Happy path: server FIRST with linked orderId, then patch + truthful toast
{
  const h = freshHarness(baseCore());
  await h.fns.confirm('CORE1');
  const rel = h.serverCalls.find((c) => c.name === 'escrowRelease');
  ok(!!rel && rel.payload.orderId === 'ORDER1', 'P2 server called with linked orderId (backlink)');
  ok(h.updates.length === 1 && h.updates[0].patch.escrowStatus === 'Released', 'P2 display patch written after server ok');
  ok(h.has('9,500', 'success'), 'P2 toast shows server split amount (TSh 9,500)', JSON.stringify(h.toasts));
}
// 4) Server deny -> NO patch + truthful error
{
  const h = freshHarness(baseCore(), { serverRelease: { ok: false, error: 'disputed_by_buyer' } });
  await h.fns.confirm('CORE1');
  ok(h.updates.length === 0, 'P2 server-deny: no display patch');
  ok(h.has('mgogoro', 'error'), 'P2 server-deny: honest dispute error toast', JSON.stringify(h.toasts));
}
// 5) No linked order -> no server call, no patch, honest toast
{
  const h = freshHarness(baseCore({ orderDocId: null, transactionToken: null, orderId: null }), { queryDocs: [] });
  await h.fns.confirm('CORE1');
  ok(h.serverCalls.length === 0 && h.updates.length === 0, 'P2 no-order: no server call, no patch');
  ok(h.has('haikupatikana', 'error'), 'P2 no-order: honest toast', JSON.stringify(h.toasts));
}
// 6) Outside seller -> display-only, NO server call, honest wording, no fake Released money
{
  const h = freshHarness(baseCore({ outsideSeller: true }));
  await h.fns.confirm('CORE1');
  const p = (h.updates[0] || {}).patch || {};
  ok(h.serverCalls.length === 0, 'P2 outside-seller: no server call');
  ok(!('escrowStatus' in p) && !('paymentStatus' in p) && p.orderStatus === 'Completed', 'P2 outside-seller: no fake Released money fields');
  ok(h.has('nje', 'success'), 'P2 outside-seller: honest wording', JSON.stringify(h.toasts));
}
// 7) Blockers -> no server/patch, checklist shown
{
  const h = freshHarness(baseCore({ paymentStatus: 'pending' }));
  await h.fns.confirm('CORE1');
  ok(h.serverCalls.length === 0 && h.updates.length === 0, 'P2 blockers: no server call, no patch');
  ok(h.confirms.length === 1 && /haiwezi/.test(h.confirms[0].o.title || ''), 'P2 blockers: checklist dialog shown');
}
// 8) Fallback query by sokopayCoreId when no backlink
{
  const h = freshHarness(baseCore({ orderDocId: null }), { queryDocs: ['ORDER9'] });
  await h.fns.confirm('CORE1');
  const rel = h.serverCalls.find((c) => c.name === 'escrowRelease');
  ok(!!rel && rel.payload.orderId === 'ORDER9', 'P2 fallback query finds order by sokopayCoreId');
}
// 9) already:true -> idempotent toast, patch still applied once
{
  const h = freshHarness(baseCore(), { serverRelease: { ok: true, already: true, split: {} } });
  await h.fns.confirm('CORE1');
  ok(h.has('awali', 'success') && h.updates.length === 1, 'P2 already: idempotent toast + single patch', JSON.stringify(h.toasts));
}
// 10-11) reportProblem: real dispute + combined-truth toasts
{
  const h = freshHarness(baseCore());
  await h.fns.report('CORE1');
  const dsp = h.serverCalls.find((c) => c.name === 'disputeOpen');
  ok(!!dsp && dsp.payload.orderId === 'ORDER1' && /Mzigo/.test(dsp.payload.reason), 'P2 report: disputeOpen called with order+reason');
  ok(h.has('imezuiliwa na server', 'info'), 'P2 report ok: freeze toast', JSON.stringify(h.toasts));
}
{
  const h = freshHarness(baseCore(), { serverDispute: { ok: false, error: 'boom' } });
  await h.fns.report('CORE1');
  ok(h.updates.length === 1, 'P2 report fail: display record still written');
  ok(h.has('support', 'error'), 'P2 report fail: honest error toast', JSON.stringify(h.toasts));
}
// 12) skhGuard idempotency key used
{
  const h = freshHarness(baseCore());
  await h.fns.confirm('CORE1');
  ok(h.guardCalls.length === 1 && h.guardCalls[0] === 'escrow_CORE1', 'P2 skhGuard escrow_<id> used');
}
// 13) double-click -> single run when guard dedupes
{
  const h = freshHarness(baseCore(), { guardOnce: true });
  await h.fns.confirm('CORE1');
  await h.fns.confirm('CORE1');
  ok(h.guardCalls.length === 2 && h.serverCalls.length === 1 && h.updates.length === 1, 'P2 double-submit: single server call + patch');
}
// 14) patch attribution: recipient + timeline union
{
  const h = freshHarness(baseCore());
  await h.fns.confirm('CORE1');
  const p = h.updates[0].patch;
  ok(p.recipientConfirmedBy === 'BUYER1' && p.timeline && p.timeline.__union && /Server imeachia/.test(p.timeline.__union.description), 'P2 patch attribution + server timeline');
}
// 15) server throw (network down) -> no patch, honest unavailable toast
{
  const h = freshHarness(baseCore(), { serverRelease: { __throw: 'unavailable' } });
  await h.fns.confirm('CORE1');
  ok(h.updates.length === 0 && h.has('haipatikani', 'error'), 'P2 server-throw: no patch + unavailable toast', JSON.stringify(h.toasts));
}

console.log(`\nPHASE2 CORE-RELEASE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

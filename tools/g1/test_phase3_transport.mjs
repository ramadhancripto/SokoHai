// Phase 3 (P3-1): skhTxStartTransit/skhTxDeliver must HONOR {ok:false} from
// server-backed custody fns — no success toast / sysMsg when server rejects.
// Real js/app/52-transport-inbox.js is eval'd under JSDOM with stubbed skh.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' :: ' + extra}`); };

function freshHarness() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="skhTxPanel" data-ride="RIDE1"></div></body></html>`, { url: 'https://x.test/' });
  const toasts = [], updates = [], adds = [];
  const calls = { start: null, complete: null };
  const skh = {
    currentUser: { uid: 'DRV1' }, chatCore: {}, // no convId -> sysMsg no-op
    skhEscape: (s) => String(s == null ? '' : s),
    doc: (db, c, id) => ({ __doc: `${c}/${id}` }),
    collection: (db, p) => ({ __col: p }),
    updateDoc: async (ref, patch) => { updates.push({ ref, patch }); return {}; },
    addDoc: async (col, data) => { adds.push({ col, data }); return { id: 'M1' }; },
  };
  const g = dom.window;
  g.skh = skh; g.skhBusy = () => {};
  g.skhToast = (msg, type) => toasts.push({ msg: String(msg), type });
  g.skhConfirm = async () => true; g.skhPrompt = async () => 'CODE1';
  g.skhCustodyReadToken = async () => null;
  g.skhCustodyStartTransit = async () => calls.start;
  g.skhCustodyCompleteDelivery = async () => calls.complete;
  const src = fs.readFileSync(new URL('../../js/app/52-transport-inbox.js', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.startsWith('import ') && !l.startsWith('export ')).join('\n');
  const runner = new dom.window.Function('window', 'document', 'navigator', 'skh', 'skhBusy', 'skhToast', 'skhConfirm', 'skhPrompt',
    'setTimeout', 'clearTimeout', `${src}\n;return { start: window.skhTxStartTransit, deliver: window.skhTxDeliver };`);
  const fns = runner(g, g.document, g.navigator, skh, g.skhBusy, g.skhToast, g.skhConfirm, g.skhPrompt, setTimeout, clearTimeout);
  g.skhTxRender = async () => {}; // neutralize post-success re-render
  const has = (sub, type) => toasts.some((t) => t.msg.includes(sub) && (!type || t.type === type));
  return { fns, toasts, updates, adds, calls, has, g, skh };
}

// 1) startTransit: server rejects -> NO success toast, error toast shown
{
  const h = freshHarness(); h.calls.start = { ok: false, error: 'bad_stage' };
  await h.fns.start();
  ok(!h.has('Safari imeanza', 'success'), 'P3 startTransit reject: no fake success toast', JSON.stringify(h.toasts));
  ok(h.has('Imeshindikana kuanza safari', 'error'), 'P3 startTransit reject: honest error toast');
  ok(h.updates.length === 0 && h.adds.length === 0, 'P3 startTransit reject: no client write/sysMsg');
}
// 2) startTransit: server ok -> success toast, still no client write
{
  const h = freshHarness(); h.calls.start = { ok: true, status: 'in_transit', server: true };
  await h.fns.start();
  ok(h.has('Safari imeanza', 'success'), 'P3 startTransit ok: success toast');
  ok(h.updates.length === 0, 'P3 startTransit ok: no client status write (server owns custody)');
}
// 3) deliver: server rejects (bad token) -> NO success toast/sysMsg, honest error
{
  const h = freshHarness(); h.calls.complete = { ok: false, error: 'bad_token' };
  await h.fns.deliver();
  ok(!h.has('Umethibitisha kufikisha', 'success'), 'P3 deliver reject: no fake success toast', JSON.stringify(h.toasts));
  ok(h.has('Imeshindikana kuthibitisha', 'error'), 'P3 deliver reject: honest error toast');
  ok(h.adds.length === 0 && h.updates.length === 0, 'P3 deliver reject: no sysMsg/client write');
}
// 4) deliver: server ok -> success toast, no client write
{
  const h = freshHarness(); h.calls.complete = { ok: true, status: 'completed', server: true };
  await h.fns.deliver();
  ok(h.has('Umethibitisha kufikisha', 'success'), 'P3 deliver ok: success toast');
  ok(h.updates.length === 0, 'P3 deliver ok: no client status write (server owns custody)');
}
// 5) deliver: custody bridge missing -> legacy client write is DENIED by rules
// (emulated by throwing permission-denied) -> honest error, no fake success.
{
  const h = freshHarness();
  delete h.g.skhCustodyCompleteDelivery;
  h.skh.updateDoc = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
  await h.fns.deliver();
  ok(!h.has('Umethibitisha kufikisha', 'success'), 'P3 deliver no-bridge: no fake success', JSON.stringify(h.toasts));
  ok(h.has('Imeshindikana kuthibitisha', 'error'), 'P3 deliver no-bridge: honest error toast');
  ok(typeof h.fns.deliver === 'function' && typeof h.fns.start === 'function', 'P3 both actions registered');
}

console.log(`\nPHASE3 TRANSPORT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// P5-C1: requestWithdrawal lazima iwe SERVER-FIRST (sio fake alert).
// Real js/app/04-orders-escrow.js (sehemu ya withdrawal pekee) ina-eval
// chini ya JSDOM na skh iliyo-stub. Inathibitisha: server inaitwa na
// args sahihi; success alert TU baada ya server ok; makosa ni honest;
// validation kabla ya server; double-submit guard.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' :: ' + extra}`); };

function loadWithdrawalSrc() {
  const src = fs.readFileSync(new URL('../../js/app/04-orders-escrow.js', import.meta.url), 'utf8');
  const start = src.indexOf('window.skhWithdrawalRequest');
  const endMarker = 'window.openEscrowModal';
  const end = src.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) throw new Error('P5-C1 anchors missing in 04-orders-escrow.js');
  return src.slice(start, end);
}

function freshHarness({ balance = 20000, prompts = [], server = { ok: true } } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://x.test/' });
  const g = dom.window;
  const alerts = [], serverCalls = [];
  let refreshed = 0;
  const promptQueue = prompts.slice();
  const skh = {
    currentUserData: { walletBalance: balance },
    requireAuth: () => true,
    wrapCallable: (name) => async (payload) => {
      serverCalls.push({ name, payload });
      if (server && server.__throw) throw new Error(server.__throw);
      if (server && server.__hang) await new Promise(() => {});
      return { data: server };
    },
  };
  g.skhPrompt = async () => promptQueue.shift() ?? null;
  g.alert = (m) => alerts.push(String(m));
  g.loadAndRenderDashboard = () => { refreshed++; };
  const src = loadWithdrawalSrc();
  const runner = new g.Function('window', 'document', 'skh', 'skhPrompt', 'alert',
    `${src}\n;return { req: window.requestWithdrawal };`);
  const fns = runner(g, g.document, skh, g.skhPrompt, g.alert);
  return { fns, alerts, serverCalls, refreshed: () => refreshed, g };
}

// C1: happy path — server kwanza na args sahihi, kisha success alert + refresh
{
  const h = freshHarness({ prompts: ['8000', '0712345678'], server: { ok: true, requestId: 'wdr_X', amount: 8000, status: 'pending' } });
  await h.fns.req();
  const c = h.serverCalls.find((x) => x.name === 'withdrawalRequest');
  ok(!!c, 'C1 server withdrawalRequest inaitwa');
  ok(!!c && c.payload.amountTSh === 8000 && c.payload.account === '0712345678' && typeof c.payload.requestKey === 'string' && c.payload.requestKey.length > 4, 'C1 args sahihi (amount/account/requestKey)', JSON.stringify(c && c.payload));
  ok(h.alerts.some((a) => a.includes('8,000') && a.includes('pending')), 'C1 success alert ina kiasi halisi + pending', JSON.stringify(h.alerts));
  ok(h.refreshed() === 1, 'C1 dashboard refresh baada ya ok');
}
// C2: server reject -> honest error, hakuna success
{
  const h = freshHarness({ prompts: ['9000', '0712345678'], server: { __throw: 'INSUFFICIENT_BALANCE: Salio halitoshi.' } });
  await h.fns.req();
  ok(h.serverCalls.length === 1, 'C2 server ilijaribiwa mara 1');
  ok(!h.alerts.some((a) => a.includes('limetumwa')), 'C2 hakuna success alert ya uongo');
  ok(h.alerts.some((a) => a.includes('halikutumwa') || a.includes('INSUFFICIENT')), 'C2 honest error', JSON.stringify(h.alerts));
  ok(h.refreshed() === 0, 'C2 hakuna refresh kwenye fail');
}
// C3: validation — kiasi chini ya 5000 hakifikii server
{
  const h = freshHarness({ prompts: ['1000'], server: { ok: true } });
  await h.fns.req();
  ok(h.serverCalls.length === 0, 'C3 server haijaitwa');
  ok(h.alerts.some((a) => a.includes('si sahihi')), 'C3 validation alert', JSON.stringify(h.alerts));
}
// C4: balance < 5000 — early exit, hata prompt haipo
{
  const h = freshHarness({ balance: 3000, prompts: ['5000', '0711'], server: { ok: true } });
  await h.fns.req();
  ok(h.serverCalls.length === 0, 'C4 server haijaitwa');
  ok(h.alerts.some((a) => a.includes('5,000')), 'C4 min-balance alert', JSON.stringify(h.alerts));
}
// C5: double-submit guard — server mara moja
{
  const h = freshHarness({ prompts: ['6000', '0712345678', '6000', '0712345678'], server: { __hang: true } });
  const p1 = h.fns.req();
  await new Promise((r) => setTimeout(r, 50));
  await h.fns.req();
  ok(h.serverCalls.length === 1, 'C5 server mara moja licha ya clicks 2', 'calls=' + h.serverCalls.length);
  ok(h.alerts.length === 0, 'C5 hakuna alert kabla ya server kujibu');
  p1.catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
}
// C6: cancel kwenye amount — hakuna server call
{
  const h = freshHarness({ prompts: [null], server: { ok: true } });
  await h.fns.req();
  ok(h.serverCalls.length === 0, 'C6 cancel: server haijaitwa');
  ok(h.alerts.length === 0, 'C6 cancel: kimya (hakuna fake feedback)');
}

console.log(`\nPHASE5 CLIENT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

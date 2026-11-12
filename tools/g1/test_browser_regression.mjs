#!/usr/bin/env node
/**
 * [LAUNCH HATUA 3] Browser regression: app boots without fatal errors and all
 * LAUNCH-FIX entry points behave (validators, cron-off, fail-closed escrow).
 * Needs: app server (tools/dev_server.mjs — set SKH_URL), playwright chromium.
 */
import { chromium } from 'playwright';

const URL = process.env.SKH_URL || 'http://127.0.0.1:8080/';
let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label} ${extra}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);

const boot = await page.evaluate(() => ({
  hasSkh: typeof window.skh !== 'undefined',
  hasConfirmEscrow: typeof window.confirmEscrowOrder === 'function',
  hasConfirmLink: typeof window.confirmSokoPayLinkDirect === 'function',
  hasSubmitEdit: typeof window.submitEditForm === 'function',
  hasMarkShipped: typeof window.markShipped === 'function',
  hasAcceptReq: typeof window.acceptHubServiceRequest === 'function',
  hasCompleteTask: typeof window.completeServiceTaskPro === 'function',
  hasChecks: typeof window.skhOrderChecks !== 'undefined',
  cronState: (window.SOKOHAI_CONFIG && window.SOKOHAI_CONFIG.CRON_LEGACY_ENABLED) ? 'ENABLED?' : 'off-or-unset',
}));
ok('skh booted', boot.hasSkh);
ok('confirmEscrowOrder present', boot.hasConfirmEscrow);
ok('confirmSokoPayLinkDirect present', boot.hasConfirmLink);
ok('submitEditForm present', boot.hasSubmitEdit);
ok('markShipped present', boot.hasMarkShipped);
ok('acceptHubServiceRequest present', boot.hasAcceptReq);
ok('completeServiceTaskPro present', boot.hasCompleteTask);
ok('skhOrderChecks present', boot.hasChecks);
ok('cron legacy flag off by default', boot.cronState === 'off-or-unset', JSON.stringify(boot.cronState));

const v = await page.evaluate(() => {
  const c = window.skhOrderChecks || {};
  return {
    newOk: c.newOrderError ? c.newOrderError({ buyerId: 'a', sellerId: 'b', amount: 100, status: 'pending' }, 'a') : 'MISSING',
    newBadAmt: c.newOrderError ? c.newOrderError({ buyerId: 'a', sellerId: 'b', amount: 0 }, 'a') : 'MISSING',
    newBadBuyer: c.newOrderError ? c.newOrderError({ buyerId: 'x', sellerId: 'b', amount: 5 }, 'a') : 'MISSING',
    svcOk: c.serviceOrderError ? c.serviceOrderError({ buyerId: 'a', sellerId: 'b', amount: 9, itemId: 'r1' }, 'b') : 'MISSING',
    svcBad: c.serviceOrderError ? c.serviceOrderError({ buyerId: 'b', sellerId: 'b', amount: 9, itemId: 'r1' }, 'b') : 'MISSING',
    shipOk: c.shipError ? c.shipError({ sellerId: 'b', status: 'held', paymentVerified: true }, 'b') : 'MISSING',
    shipUnpaid: c.shipError ? c.shipError({ sellerId: 'b', status: 'held', paymentVerified: false }, 'b') : 'MISSING',
    shipStranger: c.shipError ? c.shipError({ sellerId: 'b', status: 'held', paymentVerified: true }, 'eve') : 'MISSING',
  };
});
ok('newOrder accepts valid', v.newOk === null, JSON.stringify(v.newOk));
ok('newOrder rejects 0 amount', typeof v.newBadAmt === 'string');
ok('newOrder rejects wrong buyer', typeof v.newBadBuyer === 'string');
ok('serviceOrder accepts valid', v.svcOk === null, JSON.stringify(v.svcOk));
ok('serviceOrder rejects self-buyer', typeof v.svcBad === 'string');
ok('ship accepts paid held (seller)', v.shipOk === null, JSON.stringify(v.shipOk));
ok('ship rejects unpaid', typeof v.shipUnpaid === 'string');
ok('ship rejects stranger', typeof v.shipStranger === 'string');

const cron = await page.evaluate(async () => {
  if (typeof window.runSokoPayTimeLockChronJob !== 'function') return 'MISSING-FN';
  try { const r = await window.runSokoPayTimeLockChronJob(); return 'returned:' + JSON.stringify(r); }
  catch (e) { return 'threw:' + String(e && e.message).slice(0, 120); }
});
ok('cron no-ops when disabled', /returned/.test(cron) && !/threw/.test(cron), cron);

const esc = await page.evaluate(async () => {
  window.__skhAlerts = [];
  window.alert = m => window.__skhAlerts.push(String(m));
  window.skhConfirm = async () => true;
  try { await window.confirmSokoPayLinkDirect('probe-no-such-link', 'seller_x', 1000, 0); }
  catch (e) { window.__skhAlerts.push('THREW:' + e.message); }
  return window.__skhAlerts.join(' ~ ').slice(0, 400);
});
ok('link-release fails closed (no silent success)', !/completed safely/i.test(esc), esc.slice(0, 160));

const mine = pageErrors.filter(e => /04-orders-escrow|12-sys-modes|16-pos-admin|21-sokopay|14-map-onboarding|00-bootstrap|03-dashboard/.test(e));
ok('no pageerrors from patched files', mine.length === 0, mine.slice(0, 2).join(' | ').slice(0, 300));
console.log(`--- pageerrors(total)=${pageErrors.length} consoleErrors(total)=${consoleErrors.length}`);
if (pageErrors.length) console.log('pageerrors[0..3]:', pageErrors.slice(0, 4).join('\n  '));

await browser.close();
console.log(`\nBROWSER REGRESSION: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

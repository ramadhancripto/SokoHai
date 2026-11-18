// Local fixture only: real browser modules, stubbed Firestore/callables. No production writes.
// Run with node tools/product_preview_server.mjs, then node tools/test_stock_comments_repairs_browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:4174/');
await page.waitForFunction(() => window.previewReady);
const results = await page.evaluate(async () => {
  const alerts = [];
  window.alert = message => alerts.push(String(message));
  window.skhFnErrText = e => /internal/i.test(e.message) ? 'Huduma ya server haipatikani kwa sasa.' : e.message;
  const skh = window.skh;
  let requests = [];
  let callMode = 'ok';
  skh.wrapCallable = name => async data => {
    requests.push({ name, data });
    if (callMode === 'internal') { const e = new Error('INTERNAL'); e.code = 'functions/internal'; throw e; }
    return { data: name === 'inventoryAdjust' ? { resultingStock: 9 } : { ok: true, id: 'c1' } };
  };
  await import('/js/app/30-seller-products.js');
  window.skhRenderMyProducts = async () => {};
  window.skhPrompt = async () => '9';
  await window.skhMPStock('p1', 4);
  const stock = { request: requests[0], message: alerts.at(-1) };
  requests = []; alerts.length = 0;
  window.skhPrompt = async () => '';
  await window.skhMPStock('p1', 4);
  const blank = { calls: requests.length, message: alerts.at(-1) };
  alerts.length = 0;
  window.skhPrompt = async () => '9'; callMode = 'internal';
  await window.skhMPStock('p1', 4);
  const stockFailure = alerts.at(-1);
  requests = []; alerts.length = 0;
  callMode = 'ok'; skh.currentOpenProduct = { id: 'p1', title: 'Test', userId: 'preview-seller' };
  let directWrites = 0;
  const originalAdd = skh.addDoc;
  skh.addDoc = async (...args) => { directWrites++; return originalAdd(...args); };
  await import('/js/app/35-comments.js');
  await window.skhCommentsOpen(skh.currentOpenProduct, { open: true });
  const input = () => document.getElementById('skhCommentInput');
  input().value = 'Habari'; await window.skhCommentsSubmit();
  const serverComments = requests.filter(x => x.name === 'commentsPublish').length;
  callMode = 'internal'; input().value = 'Je ipo'; await window.skhCommentsSubmit();
  return { stock, blank, stockFailure, serverComments, directWrites, commentFailure: alerts.at(-1), retained: input().value, disabled: input().disabled };
});
assert.equal(results.stock.request.name, 'inventoryAdjust');
assert.equal(results.stock.request.data.delta, 5);
assert.equal(results.stock.request.data.productId, 'p1');
assert.match(results.stock.message, /9/);
assert.equal(results.blank.calls, 0);
assert.ok(results.blank.message);
assert.doesNotMatch(results.stockFailure, /internal/i);
assert.match(results.stockFailure, /Angalia stock/);
assert.equal(results.serverComments, 1);
assert.equal(results.directWrites, 0); // INTERNAL response is ambiguous: do not duplicate or bypass server.
assert.doesNotMatch(results.commentFailure, /internal/i);
assert.equal(results.retained, 'Je ipo');
assert.equal(results.disabled, false);
assert.deepEqual(errors, []);
console.log('PASS: audited stock adjustment, blank validation, safe errors, server-first comment and retained input (mock cloud).');
await browser.close();

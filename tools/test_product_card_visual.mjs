#!/usr/bin/env node
/* [R16] Product card visual + accessibility contract.
 * package.json ("test" and "test:product-card") already called tools/test_product_card_visual.mjs
 * on origin/main, but the file was never committed, so `npm test` stopped there. This file
 * implements that contract from the owner's approved decisions:
 *   D6 — the product-page order button is a compact cart ICON (no visible text) that is still a real
 *        <button> with the accessible name "Weka oda", a hidden decorative icon and a working click.
 *   D7 — no seller name / rating on the FRONT of product cards (seller info stays on the detail page);
 *        product name, price, stock/condition and location stay on the card.
 *   Card #1 image is never cropped (object-fit: contain) and the card is a keyboard-reachable link.
 * Browser behaviour (keyboard Enter adds to cart) is verified in tools/e2e-emulator/s9.cjs step 29. */
import fs from 'node:fs';
const r = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const t = (n, v) => { if (v) { pass++; console.log('PASS ' + n); } else { fail++; console.error('FAIL ' + n); } };

const show = r('js/app/39-product-showcase.js');
const boot = r('js/app/00-bootstrap.js');
const css = r('css/70-product-card.css');
const huruCss = r('css/71-sokohuru-card-correction.css');
const head = r('html/00-head.html');
const polish = r('css/72-pro-polish.css');
const pdCss = r('css/52-product-card-details.css');

const orderBtn = (show.match(/<button[^>]*class="pm-bar-btn pm-bar-order[^"]*"[^>]*>/) || [''])[0];
t('D6 order button exists on the product page', !!orderBtn);
t('D6 order button is type="button"', /type="button"/.test(orderBtn));
t('D6 accessible name aria-label="Weka oda"', /aria-label="Weka oda"/i.test(orderBtn));
t('D6 tooltip/title present for mouse users', /title="Weka Oda"/i.test(orderBtn));
t('D6 click calls addToCart(false)', /onclick="addToCart\(false\)"/.test(orderBtn));
t('D6 compact icon design kept (pm-bar-icon)', /pm-bar-icon/.test(orderBtn));
t('D6 decorative icon hidden from screen readers', /pm-bar-order pm-bar-icon[\s\S]{0,260}aria-hidden="true"/.test(show));
t('D6 order button has a visible style', /#pmActionArea \.pm-bar-order\s*\{/.test(pdCss));

const hs = boot.indexOf('skh.SokoHuruCard = function');
const huru = boot.slice(hs, boot.indexOf('\n};', hs) + 3); // the card function only
const legacy = boot.slice(boot.indexOf('skh.ProductPostCard = function'), boot.indexOf('skh.SokoHuruCard = function'));
t('D7 card #1 (SokoHuruCard) shows no seller line', huru.length > 100 && !/cardSellerLine|cardSellerMini|skh-seller-mini/.test(huru));
t('D7 legacy ProductPostCard omits seller identity on the front', !/cardSellerLine\(|cardSellerMini/.test(legacy));
t('D7 legacy ProductPostCard places rating in a dedicated footer', /const cardRating = skh\.cardRating\(data\)/.test(legacy) && /class="skh-card-foot"/.test(legacy));
t('Product cards do not render a cart/order control in card actions', !/mk\('order', 'skh-act--order'/.test(boot.slice(boot.indexOf('skh.cardActions = function'), boot.indexOf('skh.cardDiscountBadge = function'))));
t('SokoHuru front card includes location + right-side rating only when data exists', /const location = skh\.cardPinLocation\(data, col\)/.test(huru) && /skh-huru-r3/.test(huru));
t('SokoHuru front card excludes Like, cart and share controls', !/cardHeartIcon\(data\)|skh-card-actions|skh-huru-cart/.test(huru));
t('SokoHuru badge sizing overrides legacy centered/rotated pill', /\.skh-huru \.skh-img > \.skh-out-pill[\s\S]*?transform: none !important/.test(huruCss));
t('SokoHuru category/verified badges are scoped within image', /\.skh-huru \.skh-img > \.skh-badge/.test(huruCss) && /\.skh-huru \.skh-img > \.skh-verified-pill/.test(huruCss));
t('SokoHuru correction loads after the conflicting pro-polish layer', head.indexOf('css/71-sokohuru-card-correction.css') > head.indexOf('css/72-pro-polish.css'));
t('conflicting pro-polish collapse rules are explicitly overridden', /\.skh-huru-body\s*\{[\s\S]*?display: grid !important/.test(huruCss) && /\.skh-huru-r2\s*\{[\s\S]*?display: block !important/.test(huruCss));
t('D7 card keeps name + price', /skh-huru-name/.test(huru) && /skh-huru-price|cardPriceHtml/.test(huru));
t('D7 seller info stays on the product detail page', /openSellerProfile|pm-seller|sellerName/.test(show));
t('card image is not cropped (object-fit: contain)', /\.skh-huru \.skh-img img\s*\{[^}]*object-fit:\s*contain/.test(css));
t('card opens the product (whole card is the link)', /openProduct/.test(huru) || /cardOpenAttrs/.test(huru));
console.log(`\nPRODUCT CARD VISUAL: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

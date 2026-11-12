#!/usr/bin/env node
/* [2026-11-06] Huduma: bei inaonyeshwa kulingana na pricingModel (saa/siku/kazi/kadirio),
 * sawa kwenye kadi na ukurasa wa huduma; fomu inaruhusu "kadirio" bila bei. */
import fs from 'node:fs';
import { psServicePriceLabel, psServicePriceRequired } from '../js/app/39-showcase-logic.js';
let passed = 0, failed = 0;
const t = (n, f) => { try { f(); passed++; console.log('PASS ' + n); } catch (e) { failed++; console.log('FAIL ' + n + ' — ' + e.message); } };
const eq = (a, b) => { if (a !== b) throw new Error(JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };
t('hourly', () => eq(psServicePriceLabel({ price: 5000, pricingModel: 'hourly' }), 'Kwa saa TSh 5,000'));
t('per_day', () => eq(psServicePriceLabel({ price: 40000, pricingModel: 'per_day' }), 'Kwa siku TSh 40,000'));
t('per_job', () => eq(psServicePriceLabel({ price: 80000, pricingModel: 'per_job' }), 'Kwa kazi TSh 80,000'));
t('per_unit', () => eq(psServicePriceLabel({ price: 1500, pricingModel: 'per_unit' }), 'Kwa kipimo TSh 1,500'));
t('fixed shows plain amount', () => eq(psServicePriceLabel({ price: 80000, pricingModel: 'fixed' }), 'TSh 80,000'));
t('starting', () => eq(psServicePriceLabel({ price: 80000, pricingModel: 'starting' }), 'Kuanzia TSh 80,000'));
t('quotation never shows a price', () => eq(psServicePriceLabel({ price: 80000, pricingModel: 'quotation_required' }), 'Kadirio linahitajika'));
t('range', () => eq(psServicePriceLabel({ pricingModel: 'range', minPrice: 10000, maxPrice: 30000 }), 'TSh 10,000–30,000'));
t('legacy doc without model keeps "Kuanzia"', () => eq(psServicePriceLabel({ price: 20000 }), 'Kuanzia TSh 20,000'));
t('no price → Maelewano', () => eq(psServicePriceLabel({ price: 0, pricingModel: 'negotiable' }), 'Maelewano'));
t('price required except quotation/negotiable', () => { eq(psServicePriceRequired('hourly'), true); eq(psServicePriceRequired('quotation_required'), false); eq(psServicePriceRequired('negotiable'), false); });
const html = fs.readFileSync(new URL('../html/10-form-agent.html', import.meta.url), 'utf8');
t('service price input is not HTML-required (quotation allowed)', () => { const m = html.match(/<input[^>]*id="servHubPrice"[^>]*>/); if (!m || /\srequired[\s>]/.test(m[0])) throw new Error('still required'); });
const roles = fs.readFileSync(new URL('../js/app/19-roles.js', import.meta.url), 'utf8');
t('form validation honours pricing model', () => { if (!/priceRequired && price <= 0/.test(roles)) throw new Error('missing'); });
const show = fs.readFileSync(new URL('../js/app/39-product-showcase.js', import.meta.url), 'utf8');
t('detail page uses the shared label', () => { if (!/priceText = psServicePriceLabel\(p\)/.test(show)) throw new Error('missing'); });
console.log('\nSERVICE PRICING MODEL: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// Measures the REAL seller form (served by tools/product_preview_server.mjs on :4174,
// mock cloud, no Firebase) for each sales mode: visible fields, visible required
// fields, required fields that start empty (= what a seller must type), and sections.
// Usage: node tools/product_preview_server.mjs & node tools/measure_seller_form.mjs [out.json] [shotsDir]
import fs from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] || null;
const shots = process.argv[3] || null;
const MODES = ['hybrid', 'offline_only', 'online_only', 'manage_only'];
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
const b = await chromium.launch();
const result = {};
try {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const p = await b.newPage({ viewport: size });
    p.setDefaultTimeout(8000);
    for (const mode of MODES) {
      await p.goto('http://127.0.0.1:4174');
      await p.waitForFunction(() => window.previewReady);
      await p.evaluate(async () => { try { await import('/js/app/14-map-onboarding.js'); } catch (e) { window.__onbErr = String(e); } window.previewSeller(); });
      await p.evaluate(m => {
        window.skhProductBuilderReset && window.skhProductBuilderReset();
        const s = document.getElementById('prodVisibility');
        if (![...s.options].some(o => o.value === m)) { window.__modeMissing = m; return; }
        s.value = m; s.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.toggleProductFormFields) window.toggleProductFormFields();
      }, mode);
      const m = await p.evaluate(() => {
        const form = document.getElementById('sellerForm');
        const visible = el => { if (!el.getClientRects().length) return false; for (let n = el; n && n !== form; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; if (n.tagName === 'DETAILS' && !n.open && n !== el && !el.closest('summary')) return false; } return true; };
        const ctrls = [...form.querySelectorAll('input,select,textarea')].filter(e => e.type !== 'hidden' && e.type !== 'file' && visible(e));
        const req = ctrls.filter(e => e.required);
        const mustType = req.filter(e => !String(e.value || '').trim());
        const labels = mustType.map(e => e.id);
        const headings = [...form.querySelectorAll('h3,h4,summary,label[style*="uppercase"],b')].filter(visible).length;
        return { visibleFields: ctrls.length, visibleRequired: req.length, requiredEmpty: mustType.length, requiredEmptyIds: labels, visibleHeadings: headings, missing: window.__modeMissing || null, pageHeight: Math.round(form.scrollHeight) };
      });
      await p.evaluate(() => { window.__modeMissing = null; });
      result[vp + ':' + mode] = m;
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        // Grow the viewport to the form's height so the whole (scrolling) form is captured.
        const h = await p.evaluate(() => document.getElementById('sellerForm').scrollHeight + 260);
        await p.setViewportSize({ width: size.width, height: Math.min(h, 6000) });
        await p.evaluate(() => {
          document.getElementById('previewNavigation')?.remove();
          const mm = document.getElementById('mainMenu'); if (mm) mm.style.display = 'none';
          const f = document.getElementById('sellerForm');
          const host = f.parentElement;
          host.style.cssText = 'display:block;position:absolute;left:0;top:0;width:100%;height:auto;overflow:visible;background:#fff;z-index:2147483000;padding:0';
          f.style.margin = '0 auto';
          window.scrollTo(0, 0);
        });
        await p.locator('#sellerForm').screenshot({ path: `${shots}/seller-form-${vp}-${mode}.png` });
        await p.setViewportSize(size);
      }
    }
    await p.close();
  }
} finally { await b.close(); }
console.log(JSON.stringify(result, null, 1));
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));

#!/usr/bin/env node
/**
 * SokoHai asset check — hakikisha picha za kategoria zipo.
 *
 *   node tools/check_assets.mjs
 *
 * Inaangalia: assets/img/categories/*.webp (49 picha), assets/img/sokohai-logo.png
 * na CSS/JS mpya zilizoongezwa na Job 13. Ikikosa faili, inaandika jina lake
 * kamili ili uweze kuweka folda sahihi kwenye repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SLUGS = ['vyakula','kilimo','mifugo','afya','mavazi','vito','elektroniki','samani','ujenzi','magari','vitabu','michezo','vichezeo','muziki','sanaa','dini','zawadi','pet','vifungashio','ulinzi','jumla','maagizo','kale','mchanganyiko','asili','svc-home-personal','svc-construction','svc-cleaning','svc-event','svc-tech','svc-industrial','svc-agri','svc-creative','svc-software','svc-marketing','svc-writing','svc-media','svc-ai','svc-virtual','svc-coaching','svc-website','svc-support','svc-food','svc-rental','tr-passenger','tr-product','tr-cargo','tr-emergency'];

const files = SLUGS.map(s => 'assets/img/categories/' + s + '.webp')
  .concat(['assets/img/sokohai-logo.png',
           'css/57-home-brand-header.css',
           'css/58-category-photo-strip.css',
           'css/59-nav-balance.css',
           'js/app/82-home-header-actions.js',
           'js/app/83-category-photos.js',
           'js/app/84-location-fast.js',
           'js/app/99-ads-marketplace.js']);

let missing = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const ok = fs.existsSync(abs) && fs.statSync(abs).isFile();
  if (!ok) { missing++; console.log('MISSING  ' + rel); }
}

const rel2 = 'index.html';
const html = fs.existsSync(path.join(ROOT, rel2)) ? fs.readFileSync(path.join(ROOT, rel2), 'utf8') : '';
const wired = ['59-nav-balance.css', '83-category-photos.js', '84-location-fast.js', 'categoryPhotoStrip']
  .filter(k => !html.includes(k));

console.log('');
console.log('Faili zilizokaguliwa: ' + files.length + ' | hazipo: ' + missing);
if (wired.length) console.log('index.html haijaunganisha: ' + wired.join(', '));
console.log(missing === 0 && wired.length === 0
  ? 'OK — picha na modules zote zipo na zimeunganishwa.'
  : 'KOSA — angalia orodha ya MISSING juu, kisha weka folda "assets/img/categories/" kwenye mzizi wa app.');
process.exit(missing === 0 && wired.length === 0 ? 0 : 1);

#!/usr/bin/env node
/* [R-20 2026-11-20] Eight original 4:3 category scene illustrations (SokoHai artwork, made in this repository,
 * no third-party or stock material, no text baked in). They replace the 128x128 icon tiles that were shown,
 * cropped, in the 4:3 photo frames for the three canonical categories and five service groups that have no
 * clean photo (CAT-23, CAT-24, CAT-39 and five services). Same palette as the approved icon family
 * (tools/build_category_illustrations.mjs). The main subject stays inside the centre 300x300, so the 1:1
 * category-modal tiles (object-fit: cover) crop only background.
 * Run: node tools/build_category_scenes.mjs   (writes assets/img/categories/illustrations/*.svg) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'img', 'categories', 'illustrations');

const G = { g1: '#3FD0A3', g2: '#11866A', g3: '#0B5F4B', gl: '#BFEFDD', y1: '#F7DA8A', y2: '#C8922A', k: '#0F2F28', w: '#FFFFFF', s: '#E7F3EE' };
function scene(id, title, sky, body) {
  // sky: [top, bottom] background colours; floor band + soft shadow under the subject
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300" role="img" aria-label="${title}">` +
    `<title>${title}</title><defs>` +
    `<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
    `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G.g1}"/><stop offset="1" stop-color="${G.g2}"/></linearGradient>` +
    `<linearGradient id="${id}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G.y1}"/><stop offset="1" stop-color="${G.y2}"/></linearGradient>` +
    `<radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0B4A3A" stop-opacity=".22"/><stop offset="1" stop-color="#0B4A3A" stop-opacity="0"/></radialGradient>` +
    `</defs><rect width="400" height="300" fill="url(#${id}b)"/>` +
    `<circle cx="340" cy="60" r="90" fill="#fff" opacity=".35"/><circle cx="40" cy="250" r="110" fill="#fff" opacity=".18"/>` +
    `<rect y="236" width="400" height="64" fill="#fff" opacity=".45"/><ellipse cx="200" cy="246" rx="140" ry="14" fill="url(#${id}s)"/>` +
    body.replace(/#G/g, `url(#${id}g)`).replace(/#Y/g, `url(#${id}y)`) + `</svg>\n`;
}
export const SCENES = {
  // CAT-23 Ajira & Kazi: notice board with job cards, briefcase
  'cat-23-ajira-kazi': scene('a', 'Ajira na Kazi', ['#E3F6EF', '#C9EBDD'],
    `<rect x="92" y="58" width="216" height="150" rx="12" fill="#B98A4A"/><rect x="102" y="68" width="196" height="130" rx="8" fill="#E9CFA2"/>` +
    `<rect x="116" y="82" width="74" height="52" rx="6" fill="#fff" transform="rotate(-4 153 108)"/><circle cx="153" cy="84" r="5" fill="#E2574C"/>` +
    `<rect x="126" y="100" width="44" height="6" rx="3" fill="${G.g2}" transform="rotate(-4 153 108)"/><rect x="126" y="112" width="54" height="5" rx="2.5" fill="#B9D3C9" transform="rotate(-4 153 108)"/>` +
    `<rect x="208" y="80" width="76" height="58" rx="6" fill="#fff" transform="rotate(3 246 109)"/><circle cx="246" cy="82" r="5" fill="${G.y2}"/>` +
    `<circle cx="226" cy="106" r="9" fill="#G"/><rect x="240" y="100" width="34" height="5" rx="2.5" fill="${G.g2}"/><rect x="240" y="111" width="28" height="5" rx="2.5" fill="#B9D3C9"/>` +
    `<rect x="132" y="146" width="60" height="40" rx="6" fill="#fff"/><rect x="142" y="158" width="40" height="5" rx="2.5" fill="${G.y2}"/><rect x="142" y="169" width="30" height="5" rx="2.5" fill="#B9D3C9"/><circle cx="162" cy="148" r="4.5" fill="${G.g2}"/>` +
    `<rect x="210" y="150" width="70" height="36" rx="6" fill="#fff"/><path d="M222 168 l8 8 l16 -16" stroke="${G.g2}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="250" y="200" width="78" height="52" rx="9" fill="#G"/><rect x="274" y="190" width="30" height="14" rx="5" fill="none" stroke="${G.g3}" stroke-width="5"/><rect x="250" y="220" width="78" height="6" fill="${G.g3}" opacity=".5"/><rect x="284" y="216" width="10" height="14" rx="2" fill="#Y"/>`),
  // CAT-24 Hoteli, Malazi na Utalii: room with a bed and a window on a mountain, suitcase
  'cat-24-hotel-malazi-utalii': scene('h', 'Hoteli, Malazi na Utalii', ['#FFF4DF', '#F6E2BE'],
    `<rect x="214" y="44" width="110" height="88" rx="8" fill="#fff"/><rect x="222" y="52" width="94" height="72" rx="4" fill="#BFE6F5"/>` +
    `<path d="M222 124 L258 82 L276 98 L292 80 L316 108 L316 124 Z" fill="#7FA3B5"/><path d="M286 86 L292 80 L298 87 L292 90 Z" fill="#fff"/><circle cx="244" cy="70" r="9" fill="#Y"/>` +
    `<rect x="268" y="52" width="3" height="72" fill="#fff"/><rect x="222" y="86" width="94" height="3" fill="#fff" opacity=".8"/>` +
    `<rect x="70" y="128" width="16" height="114" rx="5" fill="${G.g3}"/><rect x="80" y="170" width="214" height="50" rx="12" fill="#G"/><rect x="80" y="160" width="200" height="24" rx="10" fill="#fff"/>` +
    `<rect x="92" y="146" width="62" height="26" rx="12" fill="#F3F7F5"/><rect x="88" y="214" width="10" height="28" rx="3" fill="${G.g3}"/><rect x="280" y="214" width="10" height="28" rx="3" fill="${G.g3}"/>` +
    `<rect x="300" y="176" width="52" height="64" rx="9" fill="#Y"/><rect x="316" y="166" width="20" height="14" rx="5" fill="none" stroke="#9C6E17" stroke-width="5"/><rect x="300" y="198" width="52" height="5" fill="#9C6E17" opacity=".5"/><circle cx="310" cy="242" r="4" fill="${G.k}"/><circle cx="342" cy="242" r="4" fill="${G.k}"/>` +
    `<path d="M168 112 l6 -14 l6 14 l-15 -9 h18 Z" fill="${G.y2}"/>`),
  // CAT-39 Used / Second-hand / Refurbished: clothes rail (mitumba) and a renewed phone with a circular arrow
  'cat-39-used-second-hand-refurbished': scene('u', 'Bidhaa Zilizotumika na Zilizokarabatiwa', ['#E6F4F1', '#CFE7E1'],
    `<rect x="70" y="70" width="8" height="172" rx="3" fill="${G.k}"/><rect x="214" y="70" width="8" height="172" rx="3" fill="${G.k}"/><rect x="66" y="66" width="160" height="8" rx="4" fill="${G.k}"/>` +
    `<path d="M94 74 v10 M134 74 v10 M176 74 v10" stroke="${G.k}" stroke-width="3"/>` +
    `<path d="M80 92 l14 -8 l14 8 l10 16 l-8 6 l-4 -6 v62 h-24 v-62 l-4 6 l-8 -6 Z" fill="#E2574C"/>` +
    `<path d="M120 92 l14 -8 l14 8 l10 16 l-8 6 l-4 -6 v74 h-24 v-74 l-4 6 l-8 -6 Z" fill="#Y"/>` +
    `<path d="M162 92 l14 -8 l14 8 l10 16 l-8 6 l-4 -6 v58 h-24 v-58 l-4 6 l-8 -6 Z" fill="#5B8DEF"/>` +
    `<rect x="252" y="96" width="76" height="132" rx="14" fill="${G.k}"/><rect x="259" y="106" width="62" height="108" rx="6" fill="#E7F3EE"/>` +
    `<path d="M310 156 a20 20 0 1 1 -6 -14" fill="none" stroke="${G.g2}" stroke-width="7" stroke-linecap="round"/><path d="M296 128 l12 12 l-16 4 Z" fill="${G.g2}"/>` +
    `<rect x="230" y="190" width="40" height="24" rx="5" fill="#fff" transform="rotate(-12 250 202)"/><circle cx="236" cy="198" r="3" fill="${G.y2}"/>`),
  // Construction & Handyman: brick wall in progress, trowel, hard hat, toolbox
  'svc-construction-handyman': scene('c', 'Ujenzi na Ufundi', ['#FFF1E2', '#F2D9BC'],
    `<g fill="#C9673F">` + [0, 1, 2, 3, 4].map(r => [0, 1, 2, 3].filter(c => !(r === 0 && c > 1)).map(c => `<rect x="${90 + c * 52 + (r % 2 ? 26 : 0)}" y="${210 - r * 26}" width="48" height="22" rx="3"/>`).join('')).join('') + `</g>` +
    `<path d="M238 98 l46 -10 l6 24 l-46 10 Z" fill="#B9C3C9"/><rect x="286" y="78" width="10" height="44" rx="4" fill="#Y" transform="rotate(-12 291 100)"/>` +
    `<path d="M100 100 a34 30 0 0 1 68 0 Z" fill="#Y"/><rect x="92" y="98" width="84" height="10" rx="5" fill="${G.y2}"/><rect x="128" y="70" width="12" height="30" rx="5" fill="#fff" opacity=".5"/>` +
    `<rect x="268" y="196" width="92" height="46" rx="8" fill="#G"/><path d="M294 196 v-12 h40 v12" fill="none" stroke="${G.g3}" stroke-width="6"/><rect x="268" y="212" width="92" height="6" fill="${G.g3}" opacity=".5"/>`),
  // Writing & Translation: open notebook, pen, two speech bubbles with different scripts (shapes only)
  'svc-writing-translation': scene('t', 'Uandishi na Tafsiri', ['#EEF0FB', '#D9DEF5'],
    `<path d="M80 120 q60 -14 120 6 v116 q-60 -18 -120 -6 Z" fill="#fff"/><path d="M200 126 q60 -20 120 -6 v116 q-60 -12 -120 6 Z" fill="#F3F7F5"/><path d="M200 126 v116" stroke="#B9D3C9" stroke-width="3"/>` +
    [0, 1, 2, 3, 4].map(i => `<rect x="96" y="${142 + i * 18}" width="${84 - (i % 2) * 18}" height="5" rx="2.5" fill="#B9D3C9"/><rect x="218" y="${140 + i * 18}" width="${84 - ((i + 1) % 2) * 22}" height="5" rx="2.5" fill="#B9D3C9"/>`).join('') +
    `<rect x="276" y="96" width="12" height="104" rx="5" fill="#Y" transform="rotate(28 282 148)"/><path d="M249 197 l10 4 l-12 10 Z" fill="${G.k}"/>` +
    `<rect x="82" y="40" width="96" height="58" rx="16" fill="#G"/><path d="M110 98 l-10 16 l26 -16 Z" fill="${G.g2}"/><text x="130" y="80" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="700" fill="#fff">A</text>` +
    `<rect x="222" y="34" width="96" height="58" rx="16" fill="#5B6FD8"/><path d="M290 92 l12 16 l-28 -16 Z" fill="#4659C4"/><path d="M252 76 q18 -30 36 0 M258 66 h24" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    `<path d="M186 66 h26 m-8 -8 l8 8 l-8 8" stroke="${G.k}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  // Online Coaching: laptop with a video call, coach and learner tiles, growth line
  'svc-online-coaching': scene('o', 'Mafunzo ya Mtandaoni', ['#E4F1FB', '#C8E1F3'],
    `<rect x="96" y="62" width="208" height="140" rx="12" fill="${G.k}"/><rect x="106" y="72" width="188" height="120" rx="6" fill="#F3F7F5"/>` +
    `<rect x="114" y="80" width="118" height="104" rx="6" fill="#DCEFE8"/><circle cx="173" cy="118" r="18" fill="#8D5A3B"/><path d="M141 176 q32 -46 64 0 Z" fill="#G"/>` +
    `<rect x="240" y="80" width="46" height="48" rx="6" fill="#FCE9D2"/><circle cx="263" cy="98" r="9" fill="#5A3A28"/><path d="M247 124 q16 -24 32 0 Z" fill="#Y"/>` +
    `<rect x="240" y="136" width="46" height="48" rx="6" fill="#fff"/><path d="M246 174 l10 -12 l10 6 l14 -18" stroke="${G.g2}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M70 202 h260 l-16 26 h-228 Z" fill="#9DB4BE"/><rect x="176" y="204" width="48" height="6" rx="3" fill="#7A929C"/>`),
  // Website Services: browser window with layout blocks, code brackets and a cursor
  'svc-website-services': scene('w', 'Huduma za Tovuti', ['#E9F7F2', '#CDEBDF'],
    `<rect x="72" y="50" width="256" height="182" rx="14" fill="#fff"/><rect x="72" y="50" width="256" height="30" rx="14" fill="${G.k}"/><rect x="72" y="66" width="256" height="14" fill="${G.k}"/>` +
    `<circle cx="92" cy="65" r="5" fill="#E2574C"/><circle cx="108" cy="65" r="5" fill="${G.y1}"/><circle cx="124" cy="65" r="5" fill="${G.g1}"/><rect x="144" y="59" width="150" height="12" rx="6" fill="#2F5D52"/>` +
    `<rect x="88" y="94" width="224" height="46" rx="8" fill="#G"/><rect x="102" y="108" width="90" height="8" rx="4" fill="#fff"/><rect x="102" y="122" width="60" height="6" rx="3" fill="#fff" opacity=".7"/>` +
    `<rect x="88" y="150" width="68" height="62" rx="8" fill="#Y"/><rect x="166" y="150" width="68" height="62" rx="8" fill="#E7F3EE"/><rect x="244" y="150" width="68" height="62" rx="8" fill="#E7F3EE"/>` +
    `<path d="M186 172 l-10 9 l10 9 M214 172 l10 9 l-10 9 M204 168 l-8 26" stroke="${G.g2}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M282 176 l0 44 l11 -10 l9 20 l8 -4 l-9 -19 l15 -1 Z" fill="${G.k}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`),
  // Rental Services: house with a key tag and an event canopy with chairs
  'svc-rental-services': scene('r', 'Huduma za Kukodisha', ['#F1EEFB', '#DFD8F2'],
    `<path d="M70 132 l64 -54 l64 54 Z" fill="${G.g3}"/><rect x="84" y="130" width="100" height="98" rx="4" fill="#fff"/><rect x="120" y="176" width="28" height="52" rx="3" fill="#Y"/>` +
    `<rect x="96" y="146" width="20" height="20" rx="3" fill="#BFE6F5"/><rect x="152" y="146" width="20" height="20" rx="3" fill="#BFE6F5"/>` +
    `<path d="M214 118 l46 -34 l46 34 Z" fill="#G"/><path d="M214 118 q11.5 12 23 0 q11.5 12 23 0 q11.5 12 23 0 q11.5 12 23 0" fill="${G.g2}"/>` +
    `<rect x="218" y="118" width="5" height="110" fill="${G.k}"/><rect x="297" y="118" width="5" height="110" fill="${G.k}"/>` +
    `<g fill="${G.y2}"><rect x="232" y="186" width="20" height="5" rx="2"/><rect x="232" y="168" width="4" height="40" rx="2"/><rect x="248" y="190" width="4" height="18"/>` +
    `<rect x="268" y="186" width="20" height="5" rx="2"/><rect x="284" y="168" width="4" height="40" rx="2"/><rect x="268" y="190" width="4" height="18"/></g>` +
    `<g transform="translate(-16 0)"><circle cx="316" cy="198" r="16" fill="none" stroke="#Y" stroke-width="7"/><path d="M330 206 l34 18 m-12 -6 l-4 8 m-6 -12 l-4 8" stroke="${G.y2}" stroke-width="7" stroke-linecap="round"/>` +
    `<rect x="300" y="160" width="34" height="20" rx="4" fill="#fff" transform="rotate(-10 317 170)"/><circle cx="306" cy="168" r="3" fill="${G.g2}"/></g>`)
};
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [slug, svg] of Object.entries(SCENES)) { fs.writeFileSync(path.join(OUT, slug + '.svg'), svg); console.log(`  ${slug}.svg ${Buffer.byteLength(svg)} bytes`); }
}

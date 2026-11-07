#!/usr/bin/env node
/**
 * [REMEDIATION 2026-11 R13] SokoHai category illustrations — ONE family for the whole system.
 *
 * Generates assets/img/category-icons/*.svg (3D "clay" style: soft top light, side shading,
 * ground shadow; SokoHai green / gold / white on a light-green tile) + manifest.json.
 * Every product category (canonical CAT-xx), service section, transport section, market mode
 * and a set of sub-category subjects gets its OWN drawing — no picture is reused for two
 * different categories. Seller product photos are never touched.
 *
 *   node tools/build_category_illustrations.mjs          (write)
 *   node tools/build_category_illustrations.mjs --check  (fail if files drift from this source)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/img/category-icons');

/* ---------------- palette + shared defs ---------------- */
const DEFS = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3FBF8"/><stop offset="1" stop-color="#DDF2EA"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD0A3"/><stop offset="1" stop-color="#11866A"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#169C7A"/><stop offset="1" stop-color="#0B5F4B"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FE7C9"/><stop offset="1" stop-color="#3CBF96"/></linearGradient>
<linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7DA8A"/><stop offset="1" stop-color="#C8922A"/></linearGradient>
<linearGradient id="yd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9A640"/><stop offset="1" stop-color="#9C6E17"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCEDE6"/></linearGradient>
<linearGradient id="wd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4F1EC"/><stop offset="1" stop-color="#B9D3C9"/></linearGradient>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F5D52"/><stop offset="1" stop-color="#0F2F28"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFF3E2"/><stop offset=".55" stop-color="#4CC7A0"/><stop offset="1" stop-color="#1B8F70"/></linearGradient>
<radialGradient id="sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0B4A3A" stop-opacity=".28"/><stop offset="1" stop-color="#0B4A3A" stop-opacity="0"/></radialGradient>
<radialGradient id="hl" cx=".3" cy=".25" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;
const TILE = `<rect x="4" y="4" width="120" height="120" rx="30" fill="url(#bg)"/><rect x="4.5" y="4.5" width="119" height="119" rx="29.5" fill="none" stroke="#C7E7DA"/><path d="M14 34 A28 28 0 0 1 34 12 H70" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;
const shadow = (cx = 64, cy = 104, rx = 34) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.round(rx / 4.2)}" fill="url(#sh)"/>`;
const shine = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#fff" opacity=".45"/>`;
// isometric-ish block: front face + right side + top
function block(x, y, w, h, d, front = 'g', side = 'gd', top = 'gl', r = 4) {
  return `<path d="M${x + w} ${y} l${d} ${-d * 0.6} v${h} l${-d} ${d * 0.6}z" fill="url(#${side})"/>`
    + `<path d="M${x} ${y} l${d} ${-d * 0.6} h${w} l${-d} ${d * 0.6}z" fill="url(#${top})"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${front})"/>`;
}
// sub-category subject: same family, round white badge + gold ring (reads as a sub-level, never as the parent tile)
const svgSub = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img">${DEFS}<circle cx="64" cy="64" r="60" fill="#fff"/><circle cx="64" cy="64" r="58" fill="none" stroke="url(#y)" stroke-width="3"/><g transform="translate(64 66) scale(.82) translate(-64 -64)">${solidStrokes(body)}</g></svg>\n`;
// gradients on strokes of straight lines have a zero-size bounding box and vanish: strokes use solid tones
const STROKE = { g: '#169C7A', gd: '#0B5F4B', gl: '#3CBF96', y: '#D4A73C', yd: '#B07E1E', k: '#163F36', w: '#FFFFFF', wd: '#B9D3C9', s: '#2FB58C' };
const solidStrokes = b => b.replace(/stroke="url\(#(\w+)\)"/g, (m, id) => 'stroke="' + (STROKE[id] || '#169C7A') + '"');
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img">${DEFS}${TILE}${solidStrokes(body)}</svg>\n`;

/* ---------------- glyph library (one drawing each) ---------------- */
const G = {
  // ----- products -----
  food: shadow() + `<path d="M28 70 h72 a36 30 0 0 1 -72 0z" fill="url(#w)"/><path d="M28 70 h72 a36 30 0 0 1 -72 0z" fill="none" stroke="#B9D3C9" stroke-width="2"/>`
    + `<circle cx="50" cy="62" r="13" fill="url(#y)"/><circle cx="72" cy="58" r="15" fill="url(#g)"/><circle cx="86" cy="66" r="9" fill="url(#yd)"/><path d="M70 43 q6 -10 14 -6" stroke="#0B5F4B" stroke-width="3" fill="none" stroke-linecap="round"/>`
    + shine(44, 54, 8, 4) + shine(66, 49, 9, 4),
  agri_inputs: shadow() + block(36, 52, 44, 46, 12, 'y', 'yd', 'w', 6) + `<rect x="44" y="64" width="28" height="18" rx="4" fill="url(#w)"/><path d="M58 66 q-8 6 0 14 q8 -8 0 -14z" fill="url(#g)"/><path d="M90 40 q10 14 0 26 q-10 -12 0 -26z" fill="url(#g)"/><rect x="88.5" y="60" width="3" height="22" rx="1.5" fill="#0B5F4B"/>`,
  crops: shadow() + `<path d="M34 98 q-2 -30 14 -38 h32 q16 8 14 38z" fill="url(#y)"/><path d="M46 60 q18 -8 36 0 l-4 6 q-14 -5 -28 0z" fill="url(#yd)"/>`
    + `<path d="M48 76 h32" stroke="#9C6E17" stroke-width="2"/><circle cx="54" cy="52" r="5" fill="url(#y)"/><circle cx="64" cy="48" r="5" fill="url(#y)"/><circle cx="74" cy="52" r="5" fill="url(#y)"/><circle cx="59" cy="44" r="4" fill="url(#yd)"/><circle cx="69" cy="44" r="4" fill="url(#yd)"/>` + shine(40, 70, 6, 14),
  livestock: shadow() + `<rect x="30" y="56" width="58" height="30" rx="14" fill="url(#w)"/><ellipse cx="48" cy="68" rx="8" ry="6" fill="url(#k)" opacity=".85"/><ellipse cx="74" cy="62" rx="6" ry="5" fill="url(#k)" opacity=".85"/>`
    + `<rect x="36" y="82" width="7" height="18" rx="3" fill="url(#wd)"/><rect x="74" y="82" width="7" height="18" rx="3" fill="url(#wd)"/><rect x="80" y="44" width="24" height="24" rx="10" fill="url(#w)"/><path d="M82 46 l-6 -6 M102 46 l6 -6" stroke="url(#y)" stroke-width="5" stroke-linecap="round"/>`
    + `<rect x="86" y="58" width="14" height="8" rx="4" fill="#F4C9B5"/><circle cx="88" cy="53" r="2" fill="#0F2F28"/><circle cx="97" cy="53" r="2" fill="#0F2F28"/>`,
  fish: shadow() + `<path d="M24 66 q30 -30 66 0 q-36 30 -66 0z" fill="url(#g)"/><path d="M88 66 l18 -14 v28z" fill="url(#gd)"/><path d="M40 60 q20 -14 40 0" fill="none" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`
    + `<circle cx="38" cy="64" r="4" fill="#fff"/><circle cx="38" cy="64" r="2" fill="#0F2F28"/><path d="M56 60 q4 6 0 12 M66 60 q4 6 0 12" stroke="#0B5F4B" stroke-width="2" fill="none"/><path d="M30 92 q10 -6 20 0 t20 0 t20 0" stroke="url(#y)" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  timber: shadow() + `<rect x="26" y="70" width="64" height="18" rx="9" fill="url(#y)"/><ellipse cx="90" cy="79" rx="8" ry="9" fill="#F7DA8A" stroke="#C8922A" stroke-width="2"/><circle cx="90" cy="79" r="3" fill="none" stroke="#C8922A" stroke-width="1.5"/>`
    + `<rect x="34" y="52" width="58" height="18" rx="9" fill="url(#yd)"/><ellipse cx="92" cy="61" rx="8" ry="9" fill="#F7DA8A" stroke="#9C6E17" stroke-width="2"/><path d="M44 38 l10 -16 l10 16z M40 46 l14 -20 l14 20z" fill="url(#g)"/><rect x="52.5" y="44" width="3" height="10" fill="#0B5F4B"/>`,
  beauty: shadow() + `<rect x="34" y="50" width="26" height="48" rx="8" fill="url(#w)"/><rect x="40" y="38" width="14" height="14" rx="4" fill="url(#y)"/><rect x="38" y="64" width="18" height="16" rx="3" fill="url(#gl)"/>`
    + `<rect x="68" y="62" width="16" height="36" rx="5" fill="url(#y)"/><path d="M70 62 v-14 q6 -8 12 0 v14z" fill="url(#g)"/><circle cx="92" cy="90" r="9" fill="url(#gl)"/><circle cx="92" cy="90" r="5" fill="url(#w)"/>` + shine(38, 54, 5, 22),
  furniture: shadow() + `<rect x="26" y="58" width="76" height="26" rx="10" fill="url(#g)"/><rect x="34" y="44" width="60" height="22" rx="9" fill="url(#gl)"/><rect x="20" y="56" width="16" height="32" rx="7" fill="url(#gd)"/><rect x="92" y="56" width="16" height="32" rx="7" fill="url(#gd)"/>`
    + `<rect x="30" y="86" width="6" height="12" rx="2" fill="url(#yd)"/><rect x="92" y="86" width="6" height="12" rx="2" fill="url(#yd)"/><rect x="44" y="50" width="16" height="10" rx="4" fill="url(#y)"/>` + shine(38, 47, 24, 4),
  hardware: shadow() + `<path d="M30 76 q0 -32 34 -32 q34 0 34 32z" fill="url(#y)"/><rect x="24" y="74" width="80" height="10" rx="5" fill="url(#yd)"/><rect x="58" y="36" width="12" height="40" rx="5" fill="url(#y)"/>`
    + `<rect x="40" y="88" width="50" height="8" rx="4" fill="url(#k)" transform="rotate(-18 65 92)"/><rect x="80" y="82" width="12" height="18" rx="3" fill="url(#gd)" transform="rotate(-18 65 92)"/>` + shine(40, 52, 14, 5),
  electronics: shadow() + `<rect x="22" y="36" width="84" height="54" rx="8" fill="url(#k)"/><rect x="27" y="41" width="74" height="44" rx="4" fill="url(#s)"/><path d="M27 70 q20 -18 40 -4 t34 -10 v29 h-74z" fill="#fff" opacity=".25"/>`
    + `<rect x="54" y="90" width="20" height="8" fill="url(#wd)"/><rect x="42" y="96" width="44" height="6" rx="3" fill="url(#w)"/>` + shine(31, 45, 26, 4),
  phones: shadow() + `<rect x="40" y="22" width="44" height="80" rx="11" fill="url(#k)"/><rect x="44" y="28" width="36" height="66" rx="7" fill="url(#s)"/><rect x="56" y="25" width="12" height="3" rx="1.5" fill="#0F2F28"/>`
    + `<path d="M44 74 q18 -16 36 -4 v24 h-36z" fill="#fff" opacity=".25"/><circle cx="62" cy="54" r="9" fill="url(#y)"/><path d="M58 54 l3 3 l6 -7" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>` + shine(47, 31, 4, 26),
  computers: shadow() + `<rect x="30" y="34" width="68" height="44" rx="6" fill="url(#k)"/><rect x="34" y="38" width="60" height="36" rx="3" fill="url(#s)"/><path d="M20 80 h88 l-6 12 h-76z" fill="url(#w)"/><rect x="54" y="82" width="20" height="4" rx="2" fill="url(#wd)"/>`
    + `<path d="M44 56 l-6 6 l6 6 M84 56 l6 6 l-6 6 M68 52 l-8 20" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  vehicles: shadow(64, 100, 40) + `<path d="M22 80 v-10 q0 -8 8 -10 l12 -14 q4 -4 10 -4 h26 q6 0 10 4 l12 14 q8 2 8 10 v10z" fill="url(#g)"/><path d="M46 50 h34 l8 12 h-50z" fill="url(#s)"/><rect x="22" y="74" width="84" height="10" rx="5" fill="url(#gd)"/>`
    + `<circle cx="42" cy="86" r="10" fill="url(#k)"/><circle cx="42" cy="86" r="4" fill="url(#w)"/><circle cx="86" cy="86" r="10" fill="url(#k)"/><circle cx="86" cy="86" r="4" fill="url(#w)"/><rect x="98" y="66" width="8" height="5" rx="2" fill="url(#y)"/>`,
  parts: shadow() + `<g transform="translate(64 64)"><circle r="26" fill="url(#y)"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="-6" y="-34" width="12" height="12" rx="3" fill="url(#y)" transform="rotate(${a})"/>`).join('')}<circle r="11" fill="url(#bg)"/><circle r="11" fill="none" stroke="#9C6E17" stroke-width="2"/></g>`
    + `<rect x="78" y="76" width="30" height="10" rx="5" fill="url(#k)" transform="rotate(35 93 81)"/>`,
  logistics: shadow(64, 100, 42) + block(20, 50, 52, 36, 10, 'g', 'gd', 'gl', 4) + `<path d="M72 60 h18 l12 14 v14 h-30z" fill="url(#w)"/><path d="M76 64 h12 l7 9 h-19z" fill="url(#s)"/>`
    + `<circle cx="38" cy="90" r="9" fill="url(#k)"/><circle cx="38" cy="90" r="3.5" fill="url(#w)"/><circle cx="88" cy="90" r="9" fill="url(#k)"/><circle cx="88" cy="90" r="3.5" fill="url(#w)"/><rect x="30" y="60" width="24" height="12" rx="3" fill="url(#y)"/>`,
  health: shadow() + `<path d="M64 98 q-40 -24 -40 -48 a20 20 0 0 1 40 -6 a20 20 0 0 1 40 6 q0 24 -40 48z" fill="url(#g)"/><rect x="57" y="48" width="14" height="38" rx="3" fill="url(#w)"/><rect x="45" y="60" width="38" height="14" rx="3" fill="url(#w)"/>` + shine(32, 42, 12, 6),
  arts: shadow() + `<path d="M64 26 q38 0 38 32 q0 14 -14 14 h-8 q-8 0 -8 8 q0 12 -10 14 q-36 0 -36 -34 q0 -34 38 -34z" fill="url(#w)"/>`
    + `<circle cx="46" cy="48" r="7" fill="url(#g)"/><circle cx="66" cy="40" r="7" fill="url(#y)"/><circle cx="84" cy="52" r="7" fill="url(#gd)"/><circle cx="42" cy="70" r="7" fill="url(#yd)"/><rect x="74" y="66" width="8" height="40" rx="4" fill="url(#yd)" transform="rotate(30 78 86)"/><path d="M70 64 l10 -6 l4 8z" fill="url(#k)"/>`,
  traditional: shadow() + `<path d="M40 40 h48 l-6 54 q-18 8 -36 0z" fill="url(#y)"/><ellipse cx="64" cy="40" rx="26" ry="8" fill="url(#w)"/><ellipse cx="64" cy="40" rx="20" ry="5" fill="#E9D6A8"/>`
    + `<path d="M44 56 h40 M45 72 h38" stroke="#0B5F4B" stroke-width="4"/><path d="M48 64 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M50 94 l-6 10 M78 94 l6 10" stroke="url(#yd)" stroke-width="5" stroke-linecap="round"/>`,
  celebration: shadow() + block(34, 62, 44, 36, 12, 'g', 'gd', 'gl', 5) + `<rect x="52" y="54" width="10" height="44" fill="url(#y)"/><path d="M57 54 q-18 -18 -22 -6 q4 10 22 6 q18 -18 22 -6 q-4 10 -22 6z" fill="url(#y)"/>`
    + `<circle cx="96" cy="34" r="10" fill="url(#y)"/><path d="M96 44 q-4 10 2 20" stroke="#9C6E17" stroke-width="1.5" fill="none"/><circle cx="26" cy="40" r="3" fill="url(#g)"/><circle cx="104" cy="70" r="3" fill="url(#g)"/>`,
  baby: shadow() + `<rect x="46" y="44" width="32" height="54" rx="12" fill="url(#w)"/><rect x="48" y="36" width="28" height="12" rx="4" fill="url(#g)"/><path d="M56 36 q6 -18 12 0z" fill="url(#y)"/>`
    + `<path d="M48 66 h28 M48 76 h28 M48 86 h28" stroke="#B9D3C9" stroke-width="2"/><rect x="48" y="60" width="28" height="36" rx="10" fill="url(#gl)" opacity=".45"/><circle cx="94" cy="80" r="12" fill="url(#y)"/><circle cx="90" cy="78" r="2" fill="#0F2F28"/><circle cx="98" cy="78" r="2" fill="#0F2F28"/><path d="M90 84 q4 3 8 0" stroke="#0F2F28" stroke-width="2" fill="none"/>`,
  pets: shadow() + `<ellipse cx="64" cy="76" rx="22" ry="18" fill="url(#y)"/><ellipse cx="40" cy="52" rx="9" ry="11" fill="url(#y)"/><ellipse cx="56" cy="40" rx="9" ry="11" fill="url(#y)"/><ellipse cx="74" cy="40" rx="9" ry="11" fill="url(#y)"/><ellipse cx="90" cy="52" rx="9" ry="11" fill="url(#y)"/>`
    + shine(52, 66, 14, 5) + `<path d="M88 92 l12 -6 v12z" fill="url(#g)"/>`,
  stationery: shadow() + `<rect x="30" y="34" width="50" height="64" rx="6" fill="url(#w)"/><rect x="30" y="34" width="10" height="64" rx="4" fill="url(#g)"/><path d="M48 50 h24 M48 60 h24 M48 70 h18" stroke="#B9D3C9" stroke-width="3" stroke-linecap="round"/>`
    + `<rect x="80" y="30" width="12" height="60" rx="3" fill="url(#y)" transform="rotate(18 86 60)"/><path d="M74 88 l8 12 l4 -14z" fill="#F4C9B5" transform="rotate(18 86 60)"/>`,
  machinery: shadow() + block(26, 58, 54, 40, 12, 'w', 'wd', 'w', 5) + `<rect x="34" y="66" width="38" height="12" rx="3" fill="url(#s)"/><circle cx="44" cy="88" r="5" fill="url(#y)"/><circle cx="60" cy="88" r="5" fill="url(#g)"/>`
    + `<rect x="80" y="30" width="14" height="40" rx="3" fill="url(#gd)"/><rect x="74" y="26" width="26" height="8" rx="3" fill="url(#g)"/><circle cx="96" cy="78" r="12" fill="url(#y)"/><circle cx="96" cy="78" r="4" fill="url(#bg)"/>`,
  energy: shadow() + `<path d="M24 74 l14 -30 h56 l-14 30z" fill="url(#k)"/><path d="M30 70 l11 -22 h48 l-11 22z" fill="url(#s)"/><path d="M52 48 l-6 22 M68 48 l-6 22 M36 59 h48" stroke="#fff" stroke-width="2" opacity=".7"/>`
    + `<rect x="54" y="74" width="8" height="22" fill="url(#wd)"/><rect x="42" y="94" width="32" height="6" rx="3" fill="url(#w)"/><path d="M96 26 l-12 22 h10 l-6 20 l18 -26 h-10 l6 -16z" fill="url(#y)"/>`,
  water: shadow() + `<rect x="34" y="50" width="48" height="48" rx="10" fill="url(#w)"/><ellipse cx="58" cy="50" rx="24" ry="7" fill="url(#wd)"/><path d="M34 66 h48 M34 80 h48" stroke="#B9D3C9" stroke-width="3"/>`
    + `<path d="M92 34 q14 20 0 32 q-14 -12 0 -32z" fill="url(#g)"/><path d="M88 54 q4 4 8 0" stroke="#fff" stroke-width="2" fill="none"/><rect x="80" y="76" width="16" height="6" rx="3" fill="url(#gd)"/>`,
  security: shadow() + `<path d="M64 24 l34 12 v22 q0 30 -34 42 q-34 -12 -34 -42 v-22z" fill="url(#g)"/><path d="M64 32 l26 9 v17 q0 23 -26 33z" fill="url(#gl)" opacity=".6"/>`
    + `<rect x="50" y="58" width="28" height="22" rx="4" fill="url(#y)"/><path d="M56 58 v-6 a8 8 0 0 1 16 0 v6" stroke="url(#w)" stroke-width="4" fill="none"/><circle cx="64" cy="68" r="3" fill="#9C6E17"/>`,
  marketing: shadow() + `<path d="M28 58 h14 l40 -22 v56 l-40 -22 h-14z" fill="url(#g)"/><rect x="24" y="56" width="20" height="18" rx="4" fill="url(#gd)"/><path d="M38 72 l6 20 h10 l-6 -20z" fill="url(#w)"/>`
    + `<path d="M90 50 q8 14 0 28 M98 42 q14 22 0 44" stroke="url(#y)" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  digital: shadow() + `<rect x="26" y="32" width="76" height="60" rx="10" fill="url(#w)"/><rect x="26" y="32" width="76" height="14" rx="7" fill="url(#g)"/><circle cx="36" cy="39" r="3" fill="#fff"/><circle cx="46" cy="39" r="3" fill="#fff"/>`
    + `<rect x="34" y="54" width="26" height="30" rx="5" fill="url(#gl)"/><rect x="66" y="54" width="28" height="6" rx="3" fill="url(#wd)"/><rect x="66" y="66" width="22" height="6" rx="3" fill="url(#wd)"/><rect x="66" y="78" width="28" height="6" rx="3" fill="url(#y)"/>`,
  property: shadow() + `<path d="M26 62 l38 -32 l38 32z" fill="url(#y)"/><rect x="34" y="60" width="60" height="38" rx="3" fill="url(#w)"/><rect x="56" y="74" width="16" height="24" rx="2" fill="url(#g)"/>`
    + `<rect x="40" y="68" width="12" height="10" rx="2" fill="url(#s)"/><rect x="76" y="68" width="12" height="10" rx="2" fill="url(#s)"/><rect x="78" y="34" width="8" height="16" fill="url(#yd)"/>`,
  minerals: shadow() + `<path d="M30 84 l12 -30 l20 -10 l22 8 l14 30 l-20 14 h-32z" fill="url(#k)" opacity=".9"/><path d="M42 54 l20 -10 l8 22 l-24 4z" fill="#3F6E62"/>`
    + `<path d="M64 46 l14 -10 l14 10 l-14 20z" fill="url(#g)"/><path d="M64 46 h28 M78 36 v30" stroke="#fff" stroke-width="1.5" opacity=".6"/><path d="M46 80 l10 -8 l10 8 l-10 12z" fill="url(#y)"/>`,
  used: shadow() + `<path d="M64 30 a32 32 0 1 1 -30 21" stroke="url(#g)" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M28 34 l8 20 l18 -10z" fill="url(#g)"/>`
    + `<rect x="50" y="54" width="28" height="22" rx="4" fill="url(#y)"/><path d="M58 64 l4 4 l8 -8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  wholesale: shadow(64, 102, 40) + block(24, 72, 30, 26, 8, 'y', 'yd', 'w') + block(56, 72, 30, 26, 8, 'y', 'yd', 'w') + block(40, 46, 30, 26, 8, 'g', 'gd', 'gl')
    + `<path d="M24 84 h30 M56 84 h30" stroke="#9C6E17" stroke-width="2"/>`,
  crossborder: shadow(64, 100, 42) + `<path d="M18 80 h92 l-12 18 h-68z" fill="url(#g)"/>` + block(26, 58, 22, 22, 6, 'y', 'yd', 'w', 2) + block(50, 58, 22, 22, 6, 'w', 'wd', 'w', 2) + block(38, 36, 22, 22, 6, 'gl', 'gd', 'w', 2)
    + `<circle cx="92" cy="44" r="14" fill="url(#s)"/><path d="M78 44 h28 M92 30 q-8 14 0 28 q8 -14 0 -28" stroke="#fff" stroke-width="2" fill="none"/>`,
  other: shadow() + `<rect x="30" y="30" width="30" height="30" rx="9" fill="url(#g)"/><rect x="68" y="30" width="30" height="30" rx="9" fill="url(#y)"/><rect x="30" y="68" width="30" height="30" rx="9" fill="url(#y)"/><rect x="68" y="68" width="30" height="30" rx="9" fill="url(#g)"/>`
    + shine(35, 35, 12, 4) + shine(73, 73, 12, 4),
  // ----- services (canonical domains + legacy sections) -----
  home_services: shadow() + `<path d="M30 60 l34 -28 l34 28 v38 h-68z" fill="url(#w)"/><path d="M24 62 l40 -34 l40 34" stroke="url(#g)" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<rect x="54" y="72" width="20" height="26" rx="3" fill="url(#g)"/><path d="M84 52 l12 -12 l6 6 l-12 12z" fill="url(#y)"/><rect x="72" y="62" width="18" height="6" rx="3" fill="url(#yd)" transform="rotate(-45 81 65)"/>`,
  repair: shadow() + `<path d="M84 26 a18 18 0 0 0 -22 22 l-32 32 a7 7 0 0 0 10 10 l32 -32 a18 18 0 0 0 22 -22 l-10 10 l-10 -2 l-2 -10z" fill="url(#y)"/>`
    + `<rect x="38" y="40" width="10" height="44" rx="3" fill="url(#g)" transform="rotate(45 43 62)"/><rect x="72" y="72" width="22" height="14" rx="4" fill="url(#gd)" transform="rotate(45 83 79)"/>`,
  education: shadow() + `<path d="M16 54 l48 -22 l48 22 l-48 22z" fill="url(#k)"/><path d="M36 64 v18 q28 16 56 0 v-18 l-28 12z" fill="url(#g)"/><path d="M104 58 v24" stroke="url(#y)" stroke-width="4"/><circle cx="104" cy="86" r="5" fill="url(#y)"/>`,
  professional: shadow() + `<rect x="26" y="50" width="76" height="46" rx="8" fill="url(#k)"/><rect x="26" y="50" width="76" height="20" rx="8" fill="#2F5D52"/><path d="M50 50 v-8 q0 -6 6 -6 h16 q6 0 6 6 v8" stroke="url(#k)" stroke-width="6" fill="none"/>`
    + `<rect x="56" y="64" width="16" height="12" rx="3" fill="url(#y)"/>` + shine(32, 54, 26, 4),
  finance: shadow() + `<ellipse cx="54" cy="88" rx="24" ry="8" fill="url(#yd)"/><rect x="30" y="74" width="48" height="14" fill="url(#y)"/><ellipse cx="54" cy="74" rx="24" ry="8" fill="url(#y)"/><ellipse cx="54" cy="64" rx="24" ry="8" fill="url(#yd)"/><rect x="30" y="56" width="48" height="8" fill="url(#y)"/><ellipse cx="54" cy="56" rx="24" ry="8" fill="url(#y)"/>`
    + `<path d="M84 40 q16 -16 26 6 h-26z" fill="url(#g)"/><path d="M97 46 v30 q0 6 -6 6" stroke="url(#gd)" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  jobs: shadow() + `<rect x="34" y="34" width="60" height="64" rx="10" fill="url(#w)"/><rect x="52" y="28" width="24" height="12" rx="5" fill="url(#y)"/><circle cx="64" cy="58" r="11" fill="url(#g)"/>`
    + `<path d="M46 88 q18 -22 36 0" fill="url(#g)"/><path d="M58 58 l4 4 l8 -8" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  hotel: shadow() + `<rect x="22" y="66" width="84" height="22" rx="6" fill="url(#g)"/><rect x="22" y="48" width="10" height="46" rx="4" fill="url(#gd)"/><rect x="36" y="54" width="22" height="14" rx="6" fill="url(#w)"/><rect x="58" y="56" width="48" height="12" rx="6" fill="url(#gl)"/>`
    + `<path d="M96 30 l3 6 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1z" fill="url(#y)"/><rect x="26" y="88" width="6" height="10" fill="url(#gd)"/><rect x="96" y="88" width="6" height="10" fill="url(#gd)"/>`,
  restaurant: shadow() + `<ellipse cx="64" cy="76" rx="38" ry="14" fill="url(#wd)"/><ellipse cx="64" cy="72" rx="34" ry="11" fill="url(#w)"/><path d="M36 70 q28 -44 56 0z" fill="url(#y)"/><circle cx="64" cy="30" r="5" fill="url(#yd)"/>`
    + `<path d="M28 98 v-26 M24 72 v8 q4 4 8 0 v-8 M100 98 v-28 q8 -4 4 -12" stroke="url(#k)" stroke-width="3.5" fill="none" stroke-linecap="round"/>` + shine(48, 50, 12, 5),
  entertainment: shadow() + `<circle cx="50" cy="64" r="24" fill="url(#w)"/><path d="M50 40 l8 12 l-8 10 l-8 -10z M28 58 l14 4 l0 14 l-12 -4z M72 58 l-14 4 l0 14 l12 -4z M38 86 l12 -10 l12 10 l-6 6 h-12z" fill="url(#k)"/>`
    + `<path d="M84 34 v38" stroke="url(#g)" stroke-width="4"/><ellipse cx="80" cy="74" rx="8" ry="6" fill="url(#g)"/><path d="M84 34 q14 4 16 16" stroke="url(#g)" stroke-width="4" fill="none"/><circle cx="102" cy="92" r="6" fill="url(#y)"/>`,
  cleaning: shadow() + `<path d="M58 22 l8 0 l4 48 h-16z" fill="url(#y)"/><path d="M44 70 h40 l8 30 h-56z" fill="url(#g)"/><path d="M50 74 l-4 26 M60 74 l-2 26 M70 74 l2 26 M80 74 l4 26" stroke="#0B5F4B" stroke-width="2"/>`
    + `<circle cx="96" cy="44" r="7" fill="url(#w)" stroke="#B9D3C9"/><circle cx="104" cy="58" r="4" fill="url(#w)" stroke="#B9D3C9"/><circle cx="32" cy="50" r="5" fill="url(#w)" stroke="#B9D3C9"/>`,
  tech_repair: shadow() + `<rect x="40" y="30" width="34" height="62" rx="8" fill="url(#k)"/><rect x="44" y="36" width="26" height="48" rx="4" fill="url(#s)"/><path d="M50 46 l14 22 M64 46 l-14 22" stroke="#fff" stroke-width="2" opacity=".6"/>`
    + `<rect x="74" y="54" width="30" height="8" rx="4" fill="url(#y)" transform="rotate(-40 89 58)"/><path d="M98 38 a8 8 0 1 1 -4 12" stroke="url(#y)" stroke-width="5" fill="none"/>`,
  industrial: shadow() + `<path d="M20 98 v-36 l20 -12 v12 l20 -12 v12 l20 -12 v48z" fill="url(#w)"/><rect x="82" y="34" width="14" height="64" fill="url(#gd)"/><rect x="80" y="30" width="18" height="6" rx="2" fill="url(#g)"/>`
    + `<rect x="28" y="72" width="10" height="10" fill="url(#y)"/><rect x="46" y="72" width="10" height="10" fill="url(#y)"/><rect x="64" y="72" width="10" height="10" fill="url(#y)"/><circle cx="96" cy="22" r="6" fill="#DCEDE6"/><circle cx="104" cy="16" r="4" fill="#DCEDE6"/>`,
  agri_support: shadow(64, 100, 40) + `<rect x="34" y="54" width="44" height="26" rx="6" fill="url(#g)"/><rect x="50" y="38" width="22" height="20" rx="4" fill="url(#s)"/><circle cx="44" cy="84" r="14" fill="url(#k)"/><circle cx="44" cy="84" r="6" fill="url(#y)"/><circle cx="88" cy="88" r="9" fill="url(#k)"/><circle cx="88" cy="88" r="4" fill="url(#y)"/>`
    + `<rect x="76" y="66" width="20" height="12" rx="3" fill="url(#gd)"/><path d="M98 40 q8 10 0 20 q-8 -10 0 -20z" fill="url(#y)"/>`,
  creative: shadow() + `<rect x="30" y="32" width="56" height="56" rx="8" fill="url(#w)"/><path d="M36 80 l14 -20 l10 12 l8 -8 l12 16z" fill="url(#g)"/><circle cx="70" cy="46" r="6" fill="url(#y)"/>`
    + `<path d="M98 26 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3z" fill="url(#y)"/><path d="M94 70 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="url(#g)"/>`,
  software: shadow() + `<rect x="24" y="34" width="80" height="58" rx="10" fill="url(#k)"/><rect x="24" y="34" width="80" height="12" rx="6" fill="#2F5D52"/><circle cx="34" cy="40" r="2.5" fill="url(#y)"/><circle cx="42" cy="40" r="2.5" fill="url(#g)"/>`
    + `<path d="M46 58 l-10 10 l10 10 M82 58 l10 10 l-10 10" stroke="url(#g)" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 54 l-12 30" stroke="url(#y)" stroke-width="5" stroke-linecap="round"/>`,
  digital_marketing: shadow() + `<rect x="26" y="34" width="76" height="56" rx="8" fill="url(#w)"/><rect x="36" y="70" width="10" height="12" rx="2" fill="url(#gl)"/><rect x="52" y="60" width="10" height="22" rx="2" fill="url(#g)"/><rect x="68" y="50" width="10" height="32" rx="2" fill="url(#gd)"/>`
    + `<path d="M34 62 l18 -12 l14 8 l26 -18" stroke="url(#y)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M84 38 h10 v10" stroke="url(#y)" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  writing: shadow() + `<rect x="28" y="36" width="50" height="62" rx="6" fill="url(#w)"/><path d="M38 52 h30 M38 62 h30 M38 72 h22" stroke="#B9D3C9" stroke-width="3" stroke-linecap="round"/>`
    + `<path d="M98 30 l10 10 l-34 34 l-14 4 l4 -14z" fill="url(#y)"/><path d="M98 30 l10 10 l-6 6 l-10 -10z" fill="url(#g)"/><text x="40" y="92" font-family="Inter,Arial" font-weight="800" font-size="14" fill="#11866A">A→Z</text>`,
  media: shadow() + `<rect x="24" y="44" width="58" height="44" rx="10" fill="url(#k)"/><circle cx="53" cy="66" r="15" fill="url(#s)"/><circle cx="53" cy="66" r="7" fill="url(#k)"/><circle cx="50" cy="63" r="2.5" fill="#fff"/>`
    + `<path d="M82 56 l22 -12 v44 l-22 -12z" fill="url(#g)"/><rect x="34" y="36" width="20" height="10" rx="3" fill="url(#y)"/>`,
  ai: shadow() + `<rect x="34" y="40" width="60" height="50" rx="16" fill="url(#w)"/><rect x="42" y="50" width="44" height="26" rx="10" fill="url(#k)"/><circle cx="54" cy="63" r="5" fill="url(#g)"/><circle cx="74" cy="63" r="5" fill="url(#g)"/>`
    + `<path d="M64 40 v-12" stroke="url(#y)" stroke-width="4"/><circle cx="64" cy="26" r="5" fill="url(#y)"/><rect x="26" y="56" width="8" height="18" rx="4" fill="url(#gd)"/><rect x="94" y="56" width="8" height="18" rx="4" fill="url(#gd)"/><path d="M56 82 h16" stroke="url(#y)" stroke-width="3" stroke-linecap="round"/>`,
  virtual_business: shadow() + `<rect x="24" y="40" width="58" height="42" rx="6" fill="url(#k)"/><rect x="28" y="44" width="50" height="34" rx="3" fill="url(#s)"/><rect x="40" y="82" width="26" height="6" fill="url(#wd)"/>`
    + `<path d="M72 60 h34 l-4 30 h-26z" fill="url(#y)"/><path d="M78 60 q0 -12 11 -12 q11 0 11 12" stroke="url(#yd)" stroke-width="4" fill="none"/>`,
  coaching: shadow() + `<rect x="22" y="30" width="62" height="44" rx="6" fill="url(#w)"/><rect x="22" y="30" width="62" height="44" rx="6" fill="none" stroke="#B9D3C9" stroke-width="2"/><path d="M32 62 l12 -12 l10 8 l18 -18" stroke="url(#g)" stroke-width="4" fill="none" stroke-linecap="round"/>`
    + `<rect x="50" y="74" width="6" height="22" fill="url(#wd)"/><circle cx="96" cy="58" r="10" fill="url(#y)"/><path d="M82 98 q14 -30 28 0z" fill="url(#g)"/><path d="M84 60 l-12 -6" stroke="url(#yd)" stroke-width="3" stroke-linecap="round"/>`,
  website: shadow() + `<rect x="22" y="30" width="84" height="64" rx="10" fill="url(#w)"/><rect x="22" y="30" width="84" height="14" rx="7" fill="url(#gd)"/><rect x="40" y="35" width="56" height="5" rx="2.5" fill="#fff" opacity=".7"/>`
    + `<rect x="30" y="52" width="68" height="16" rx="4" fill="url(#gl)"/><rect x="30" y="74" width="30" height="12" rx="4" fill="url(#y)"/><rect x="66" y="74" width="32" height="12" rx="4" fill="url(#wd)"/>`,
  remote_support: shadow() + `<path d="M34 66 v-6 a30 30 0 0 1 60 0 v6" stroke="url(#k)" stroke-width="7" fill="none"/><rect x="26" y="62" width="18" height="28" rx="8" fill="url(#g)"/><rect x="84" y="62" width="18" height="28" rx="8" fill="url(#g)"/>`
    + `<path d="M93 90 q0 10 -20 10" stroke="url(#k)" stroke-width="4" fill="none"/><rect x="60" y="94" width="16" height="10" rx="5" fill="url(#y)"/>`,
  food_services: shadow() + `<path d="M34 56 q30 -40 60 0z" fill="url(#w)"/><rect x="30" y="56" width="68" height="8" rx="4" fill="url(#wd)"/><circle cx="64" cy="30" r="5" fill="url(#y)"/>`
    + `<path d="M40 70 h48 l-6 26 h-36z" fill="url(#g)"/><path d="M52 64 q4 -6 0 -12 M64 64 q4 -6 0 -12 M76 64 q4 -6 0 -12" stroke="#B9D3C9" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  rental: shadow() + `<path d="M24 66 l40 -32 l40 32z" fill="url(#g)"/><path d="M30 66 h68 v6 h-68z" fill="url(#gd)"/><path d="M40 72 v24 M88 72 v24" stroke="url(#k)" stroke-width="4"/>`
    + `<rect x="50" y="78" width="28" height="6" rx="3" fill="url(#y)"/><rect x="52" y="84" width="4" height="12" fill="url(#yd)"/><rect x="72" y="84" width="4" height="12" fill="url(#yd)"/><rect x="58" y="70" width="12" height="8" rx="2" fill="url(#w)"/>`,
  // ----- transport -----
  passenger: shadow(64, 100, 42) + `<rect x="22" y="40" width="84" height="48" rx="12" fill="url(#g)"/><rect x="28" y="46" width="22" height="18" rx="4" fill="url(#s)"/><rect x="54" y="46" width="22" height="18" rx="4" fill="url(#s)"/><rect x="80" y="46" width="20" height="18" rx="4" fill="url(#s)"/>`
    + `<rect x="22" y="72" width="84" height="6" fill="url(#y)"/><circle cx="40" cy="90" r="9" fill="url(#k)"/><circle cx="40" cy="90" r="3.5" fill="url(#w)"/><circle cx="88" cy="90" r="9" fill="url(#k)"/><circle cx="88" cy="90" r="3.5" fill="url(#w)"/>`,
  parcel: shadow() + block(30, 52, 52, 44, 14, 'y', 'yd', 'w', 4) + `<path d="M52 52 l14 -8 v44 h-14z" fill="#E9C26A" opacity=".8"/><rect x="40" y="70" width="24" height="12" rx="2" fill="url(#w)"/><path d="M44 74 h16 M44 78 h10" stroke="#B9D3C9" stroke-width="2"/>`
    + `<path d="M98 30 q10 0 10 10 q0 10 -10 20 q-10 -10 -10 -20 q0 -10 10 -10z" fill="url(#g)"/><circle cx="98" cy="40" r="4" fill="#fff"/>`,
  cargo: shadow(64, 102, 46) + `<rect x="14" y="44" width="62" height="42" rx="4" fill="url(#w)"/><path d="M24 50 v30 M34 50 v30 M44 50 v30 M54 50 v30 M64 50 v30" stroke="#B9D3C9" stroke-width="2"/>`
    + `<path d="M76 56 h18 l14 16 v14 h-32z" fill="url(#g)"/><path d="M80 60 h12 l8 10 h-20z" fill="url(#s)"/><circle cx="32" cy="90" r="9" fill="url(#k)"/><circle cx="56" cy="90" r="9" fill="url(#k)"/><circle cx="94" cy="90" r="9" fill="url(#k)"/><circle cx="32" cy="90" r="3.5" fill="url(#y)"/><circle cx="56" cy="90" r="3.5" fill="url(#y)"/><circle cx="94" cy="90" r="3.5" fill="url(#y)"/>`,
  emergency: shadow(64, 100, 42) + `<rect x="18" y="46" width="66" height="40" rx="6" fill="url(#w)"/><path d="M84 56 h14 l12 14 v16 h-26z" fill="url(#w)"/><path d="M88 60 h8 l8 10 h-16z" fill="url(#s)"/>`
    + `<rect x="44" y="54" width="12" height="26" rx="2" fill="url(#g)"/><rect x="37" y="61" width="26" height="12" rx="2" fill="url(#g)"/><rect x="40" y="36" width="20" height="10" rx="4" fill="url(#y)"/><path d="M50 28 v6 M38 32 l4 4 M62 32 l-4 4" stroke="url(#yd)" stroke-width="3" stroke-linecap="round"/>`
    + `<circle cx="36" cy="90" r="9" fill="url(#k)"/><circle cx="96" cy="90" r="9" fill="url(#k)"/><circle cx="36" cy="90" r="3.5" fill="url(#w)"/><circle cx="96" cy="90" r="3.5" fill="url(#w)"/>`,
  // ----- market modes -----
  mode_free_market: shadow() + `<path d="M24 52 h80 l-6 -18 h-68z" fill="url(#g)"/><path d="M24 52 q10 10 20 0 q10 10 20 0 q10 10 20 0 q10 10 20 0" fill="url(#y)"/><rect x="30" y="58" width="68" height="40" rx="4" fill="url(#w)"/><rect x="54" y="70" width="20" height="28" rx="3" fill="url(#g)"/><rect x="36" y="66" width="12" height="12" rx="2" fill="url(#s)"/><rect x="80" y="66" width="12" height="12" rx="2" fill="url(#s)"/>`,
  mode_auction: shadow() + `<rect x="30" y="34" width="44" height="18" rx="6" fill="url(#y)" transform="rotate(-35 52 43)"/><rect x="48" y="50" width="10" height="44" rx="4" fill="url(#yd)" transform="rotate(-35 52 43)"/>`
    + `<rect x="62" y="84" width="40" height="12" rx="4" fill="url(#g)"/><rect x="58" y="94" width="48" height="6" rx="3" fill="url(#gd)"/><path d="M92 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" fill="url(#y)"/>`,
  mode_price_drop: shadow() + `<path d="M30 40 h40 l26 26 l-26 26 h-40z" fill="url(#g)" transform="rotate(-8 64 66)"/><circle cx="40" cy="56" r="5" fill="#fff" transform="rotate(-8 64 66)"/>`
    + `<path d="M50 62 l12 12 l20 -24" stroke="#fff" stroke-width="0" fill="none"/><path d="M92 26 v34 m-10 -10 l10 12 l10 -12" stroke="url(#y)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="44" y="78" font-family="Inter,Arial" font-weight="900" font-size="18" fill="#fff" transform="rotate(-8 64 66)">-%</text>`,
  mode_wholesale: shadow(64, 102, 40) + block(30, 76, 64, 22, 8, 'yd', 'yd', 'y', 3) + block(34, 56, 26, 20, 7, 'g', 'gd', 'gl') + block(64, 56, 26, 20, 7, 'g', 'gd', 'gl') + block(48, 36, 26, 20, 7, 'y', 'yd', 'w'),
  mode_group_buy: shadow() + `<circle cx="64" cy="44" r="13" fill="url(#y)"/><path d="M40 92 q0 -30 24 -30 q24 0 24 30z" fill="url(#g)"/><circle cx="36" cy="56" r="10" fill="url(#gl)"/><path d="M18 96 q0 -24 18 -24 q12 0 16 10" fill="url(#gl)"/><circle cx="92" cy="56" r="10" fill="url(#gl)"/><path d="M110 96 q0 -24 -18 -24 q-12 0 -16 10" fill="url(#gl)"/>`,
  mode_live: shadow() + `<rect x="22" y="38" width="62" height="48" rx="12" fill="url(#k)"/><circle cx="53" cy="62" r="14" fill="url(#s)"/><circle cx="53" cy="62" r="6" fill="url(#k)"/><path d="M84 54 l22 -12 v40 l-22 -12z" fill="url(#g)"/>`
    + `<rect x="28" y="28" width="34" height="14" rx="7" fill="#E5484D"/><text x="34" y="39" font-family="Inter,Arial" font-weight="900" font-size="10" fill="#fff">LIVE</text>`,
};

/* ---------------- what gets which drawing ---------------- */
const CATEGORY_GLYPH = {
  'CAT-01': 'food', 'CAT-02': 'agri_inputs', 'CAT-03': 'crops', 'CAT-04': 'livestock', 'CAT-05': 'fish', 'CAT-06': 'timber',
  'CAT-07': null /* apparel, below */, 'CAT-08': 'beauty', 'CAT-09': 'furniture', 'CAT-10': 'hardware', 'CAT-11': 'electronics',
  'CAT-12': 'phones', 'CAT-13': 'computers', 'CAT-14': 'vehicles', 'CAT-15': 'parts', 'CAT-16': 'logistics',
  'CAT-17': 'home_services', 'CAT-18': 'repair', 'CAT-19': 'health', 'CAT-20': 'education', 'CAT-21': 'professional',
  'CAT-22': 'finance', 'CAT-23': 'jobs', 'CAT-24': 'hotel', 'CAT-25': 'restaurant', 'CAT-26': 'entertainment',
  'CAT-27': 'arts', 'CAT-28': 'traditional', 'CAT-29': 'celebration', 'CAT-30': 'baby', 'CAT-31': 'pets',
  'CAT-32': 'stationery', 'CAT-33': 'machinery', 'CAT-34': 'energy', 'CAT-35': 'water', 'CAT-36': 'security',
  'CAT-37': 'marketing', 'CAT-38': 'digital', 'CAT-39': 'used', 'CAT-40': 'wholesale', 'CAT-41': 'crossborder',
  'CAT-42': 'property', 'CAT-43': 'minerals', 'CAT-44': 'other'
};
G.apparel = shadow() + `<path d="M44 30 l-24 14 l10 20 l10 -4 v42 h48 v-42 l10 4 l10 -20 l-24 -14 q-10 10 -20 0z" fill="url(#g)"/><path d="M54 30 q10 12 20 0" stroke="url(#y)" stroke-width="4" fill="none"/>`
  + `<path d="M64 44 v54" stroke="#0B5F4B" stroke-width="2" opacity=".5"/><circle cx="64" cy="56" r="2.5" fill="url(#y)"/><circle cx="64" cy="70" r="2.5" fill="url(#y)"/><circle cx="64" cy="84" r="2.5" fill="url(#y)"/>` + shine(46, 50, 5, 20);
CATEGORY_GLYPH['CAT-07'] = 'apparel';

G.home_personal = shadow() + `<path d="M28 58 l30 -24 l30 24 v40 h-60z" fill="url(#gl)"/><rect x="50" y="74" width="16" height="24" rx="3" fill="url(#gd)"/>`
  + `<circle cx="84" cy="80" r="9" fill="none" stroke="url(#y)" stroke-width="5"/><circle cx="100" cy="80" r="9" fill="none" stroke="url(#y)" stroke-width="5"/><path d="M88 72 l14 -32 M96 72 l-14 -32" stroke="url(#k)" stroke-width="5" stroke-linecap="round"/>`;
const SERVICE_GLYPH = {
  'Home & Personal': 'home_personal', 'Construction & Handyman': 'hardware_service', 'Cleaning & Maintenance': 'cleaning',
  'Event & Entertainment': 'event', 'Tech & Repair': 'tech_repair', 'Industrial Support': 'industrial',
  'Agriculture Support': 'agri_support', 'Creative Freelancing': 'creative', 'Software & IT': 'software',
  'Digital Marketing': 'digital_marketing', 'Writing & Translation': 'writing', 'Media Production': 'media',
  'AI Services': 'ai', 'Virtual Business': 'virtual_business', 'Online Coaching': 'coaching',
  'Website Services': 'website', 'Remote Support': 'remote_support', 'Food Services': 'food_services', 'Rental Services': 'rental'
};
G.hardware_service = shadow() + `<rect x="34" y="40" width="60" height="58" rx="6" fill="url(#w)"/><path d="M34 54 h60 M34 68 h60 M34 82 h60 M54 40 v14 M74 54 v14 M54 68 v14 M74 82 v16" stroke="#B9D3C9" stroke-width="2.5"/>`
  + `<rect x="64" y="26" width="10" height="44" rx="4" fill="url(#yd)" transform="rotate(35 69 48)"/><rect x="54" y="20" width="30" height="14" rx="4" fill="url(#k)" transform="rotate(35 69 48)"/>`;
G.event = shadow() + `<path d="M24 98 l14 -60 l16 60z" fill="url(#g)"/><path d="M30 72 h18 M27 86 h24" stroke="url(#y)" stroke-width="4"/><circle cx="84" cy="44" r="14" fill="url(#y)"/><path d="M84 58 q-4 14 4 30" stroke="#9C6E17" stroke-width="2" fill="none"/>`
  + `<circle cx="100" cy="64" r="10" fill="url(#gl)"/><path d="M100 74 q2 10 -4 22" stroke="#0B5F4B" stroke-width="2" fill="none"/><circle cx="66" cy="30" r="3" fill="url(#g)"/><circle cx="106" cy="32" r="3" fill="url(#y)"/>`;


/* The 12 legacy labels still awaiting the owner's mapping decision get their own drawings too
   (the mapping itself is NOT changed here). */
G.pharmacy = shadow() + `<rect x="38" y="40" width="40" height="58" rx="8" fill="url(#w)"/><rect x="36" y="30" width="44" height="14" rx="5" fill="url(#g)"/><rect x="50" y="58" width="16" height="28" rx="2" fill="url(#g)"/><rect x="44" y="64" width="28" height="16" rx="2" fill="url(#g)"/>`
  + `<rect x="80" y="70" width="26" height="12" rx="6" fill="url(#y)" transform="rotate(-30 93 76)"/><path d="M93 70 v12" stroke="#fff" stroke-width="2" transform="rotate(-30 93 76)"/>`;
G.luxury = shadow() + `<circle cx="58" cy="66" r="22" fill="url(#y)"/><circle cx="58" cy="66" r="16" fill="url(#w)"/><path d="M58 56 v10 l7 5" stroke="url(#k)" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="50" y="34" width="16" height="12" rx="3" fill="url(#yd)"/><rect x="50" y="86" width="16" height="12" rx="3" fill="url(#yd)"/>`
  + `<path d="M92 38 l8 -8 h8 l8 8 l-12 14z" fill="url(#g)" transform="translate(-12 0)"/>`;
G.books = shadow() + `<rect x="28" y="78" width="70" height="14" rx="3" fill="url(#g)"/><rect x="32" y="64" width="64" height="14" rx="3" fill="url(#y)"/><rect x="26" y="50" width="68" height="14" rx="3" fill="url(#gd)"/><path d="M32 82 h60 M36 68 h56" stroke="#fff" stroke-width="2" opacity=".6"/>`
  + `<path d="M74 50 v-20 l10 6 l10 -6 v20" fill="url(#y)"/>`;
G.sports = shadow() + `<circle cx="50" cy="62" r="22" fill="url(#w)"/><path d="M50 40 a22 22 0 0 1 0 44 M30 54 q20 8 40 0 M30 70 q20 -8 40 0" stroke="url(#g)" stroke-width="3" fill="none"/>`
  + `<rect x="72" y="80" width="34" height="8" rx="4" fill="url(#k)"/><rect x="68" y="72" width="8" height="24" rx="3" fill="url(#y)"/><rect x="102" y="72" width="8" height="24" rx="3" fill="url(#y)"/>`;
G.toys = shadow() + block(28, 70, 26, 26, 8, 'g', 'gd', 'gl', 4) + block(56, 70, 26, 26, 8, 'y', 'yd', 'w', 4) + block(42, 44, 26, 26, 8, 'w', 'wd', 'w', 4)
  + `<text x="49" y="64" font-family="Inter,Arial" font-weight="900" font-size="16" fill="#11866A">A</text><circle cx="98" cy="50" r="10" fill="url(#y)"/>`;
G.music = shadow() + `<path d="M70 30 v46" stroke="url(#k)" stroke-width="5"/><path d="M70 30 l24 -6 v12 l-24 6z" fill="url(#y)"/><ellipse cx="56" cy="80" rx="18" ry="16" fill="url(#g)"/><ellipse cx="56" cy="80" rx="6" ry="5" fill="url(#k)"/>`
  + `<circle cx="96" cy="70" r="6" fill="url(#y)"/><path d="M101 70 v-20" stroke="url(#yd)" stroke-width="3"/>`;
G.easel = shadow() + `<path d="M44 98 l20 -64 l20 64 M64 34 v64" stroke="url(#yd)" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="36" y="40" width="56" height="40" rx="4" fill="url(#w)"/><path d="M42 74 l14 -16 l10 10 l8 -8 l14 14z" fill="url(#g)"/><circle cx="80" cy="50" r="5" fill="url(#y)"/>`;
G.religion = shadow() + `<path d="M64 26 q14 10 14 26 v42 h-28 v-42 q0 -16 14 -26z" fill="url(#gl)"/><path d="M64 26 q14 10 14 26 v42 h-28 v-42 q0 -16 14 -26z" fill="none" stroke="#11866A" stroke-width="2"/><path d="M50 52 h28" stroke="url(#g)" stroke-width="4"/><rect x="58" y="70" width="12" height="24" rx="6" fill="url(#g)"/>`
  + `<circle cx="64" cy="22" r="4" fill="url(#y)"/><path d="M34 98 h60" stroke="url(#yd)" stroke-width="6" stroke-linecap="round"/>`;
G.giftbag = shadow() + `<path d="M34 50 h60 l-6 48 h-48z" fill="url(#y)"/><path d="M50 50 q0 -18 14 -18 q14 0 14 18" stroke="url(#gd)" stroke-width="5" fill="none"/><path d="M58 62 q-10 -10 -14 0 q4 8 14 0 q10 -10 14 0 q-4 8 -14 0z" fill="url(#g)"/><rect x="58" y="62" width="12" height="36" fill="url(#g)" opacity=".85"/>`;
G.packaging = shadow() + block(28, 58, 56, 40, 12, 'y', 'yd', 'w', 3) + `<rect x="50" y="58" width="12" height="40" fill="#fff" opacity=".7"/><path d="M50 58 l12 -7 h0 v0" stroke="#fff"/>`
  + `<rect x="80" y="30" width="28" height="22" rx="4" fill="url(#k)"/><rect x="84" y="24" width="20" height="8" rx="2" fill="url(#w)"/><rect x="84" y="46" width="20" height="12" rx="2" fill="url(#w)"/>`;
G.antiques = shadow() + `<path d="M52 30 h24 v8 q12 10 12 28 q0 22 -24 30 q-24 -8 -24 -30 q0 -18 12 -28z" fill="url(#y)"/><path d="M44 62 h40" stroke="url(#g)" stroke-width="5"/><path d="M48 74 q16 8 32 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/><rect x="50" y="26" width="28" height="6" rx="3" fill="url(#yd)"/>`;
G.basket = shadow() + `<path d="M24 58 h80 l-10 40 h-60z" fill="url(#g)"/><path d="M40 58 l14 -26 M88 58 l-14 -26" stroke="url(#k)" stroke-width="5" stroke-linecap="round"/><path d="M30 70 h68 M32 82 h64" stroke="#0B5F4B" stroke-width="2.5"/>`
  + `<circle cx="48" cy="54" r="8" fill="url(#y)"/><rect x="60" y="42" width="12" height="16" rx="3" fill="url(#w)"/><circle cx="82" cy="52" r="7" fill="url(#gl)"/>`;
const LEGACY_GLYPH = {
  'Afya na Pharmacy (Health)': 'pharmacy', 'Vito na Saa (Luxury)': 'luxury', 'Vitabu na Elimu (Education)': 'books',
  'Michezo na Mazoezi (Sports)': 'sports', 'Vichezeo na Michezo (Toys)': 'toys', 'Sauti na Muziki (Music)': 'music',
  'Sanaa na Ubunifu (Arts)': 'easel', 'Dini na Utamaduni (Religion)': 'religion', 'Zawadi na Sherehe (Gifts)': 'giftbag',
  'Vifungashio na Printi (Packaging)': 'packaging', 'Vitu vya Kale na Thamani (Antiques)': 'antiques', 'Mchanganyiko (General Merchandise)': 'basket'
};

const TRANSPORT_GLYPH = { 'Passenger': 'passenger', 'Product': 'parcel', 'Cargo': 'cargo', 'Emergency': 'emergency' };
const MODE_GLYPH = { free_market: 'mode_free_market', auction: 'mode_auction', price_drop: 'mode_price_drop', wholesale: 'mode_wholesale', group_buy: 'mode_group_buy', live: 'mode_live' };

/* Sub-category subjects: a sub-category gets its own drawing only when its name clearly names a
   subject below (keyword match). Others stay text chips — never another category's picture. */
const SUB_SUBJECTS = [
  ['phones', /\b(simu|smartphones?|phones?|mobiles?)\b/i], ['computers', /\b(laptops?|computers?|kompyuta|desktops?|pcs?)\b/i],
  ['electronics', /\b(tv|tvs|television|display|screens?)\b/i], ['apparel', /\b(shirt|nguo|wear|clothing|mavazi|dress)/i],
  ['furniture', /\b(sofa|furniture|samani|kiti|chairs?)\b/i], ['fish', /\b(fish|samaki|seafood|dagaa)\b/i],
  ['livestock', /\b(cattle|ng'ombe|cows?|goats?|mbuzi|livestock)\b/i], ['crops', /\b(grains?|nafaka|maharage|beans|mahindi|maize|rice|mchele)\b/i],
  ['energy', /\b(solar|sola|inverter|batter(y|ies)|umeme)\b/i], ['water', /\b(water|maji|tank|pumps?)\b/i],
  ['beauty', /\b(cosmetic|vipodozi|beauty|hair|perfume|skin)\b/i], ['stationery', /\b(stationery|books?|vitabu|office)\b/i],
  ['parts', /\b(spare|vipuri|parts?|tyres?|tires?)\b/i], ['vehicles', /\b(cars?|magari|motorcycles?|pikipiki|bajaji)\b/i],
  ['pets', /\b(pets?|dogs?|cats?|mbwa|paka)\b/i], ['baby', /\b(baby|mtoto|watoto|kids?|toys?)\b/i],
  ['hardware', /\b(tools?|cement|saruji|paint|rangi|plumbing|nails?)\b/i], ['security', /\b(cctv|alarm|safe|locks?|security)\b/i],
  ['timber', /\b(timber|mbao|wood|logs?)\b/i], ['minerals', /\b(gem|madini|minerals?|stones?|mawe|tanzanite)\b/i],
  ['health', /\b(medic|dawa|pharma|health|afya|medical)\b/i], ['food', /\b(fruit|matunda|vegetables?|mboga|produce)\b/i],
  ['restaurant', /\b(drinks?|vinywaji|beverages?|juice)\b/i], ['celebration', /\b(wedding|harusi|party|sherehe|decor)\b/i],
  ['property', /\b(plots?|viwanja|houses?|nyumba|land|ardhi|rent)\b/i], ['machinery', /\b(machine|mashine|generator|industrial)\b/i]
];

/* ---------------- naming ---------------- */
const slug = s => String(s).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

async function main() {
  const identity = (await import('../shared/category-identity.mjs')).default;
  const files = {};       // file -> svg
  const manifest = { version: 1, style: 'sokohai-3d-clay', categories: {}, services: {}, transport: {}, modes: {}, legacy: {}, subjects: {}, fallback: 'cat-44-other-haipo-hapa.svg' };
  for (const c of identity.categories) {
    const glyph = CATEGORY_GLYPH[c.id]; if (!glyph || !G[glyph]) throw Error('no drawing for ' + c.id);
    const file = c.id.toLowerCase() + '-' + slug(c.displayName) + '.svg';
    files[file] = svg(G[glyph]); manifest.categories[c.id] = file;
  }
  manifest.fallback = manifest.categories['CAT-44'];
  for (const [name, glyph] of Object.entries(SERVICE_GLYPH)) { const file = 'svc-' + slug(name) + '.svg'; if (!G[glyph]) throw Error('no drawing ' + glyph); files[file] = svg(G[glyph]); manifest.services[name] = file; }
  for (const [name, glyph] of Object.entries(LEGACY_GLYPH)) { const file = 'legacy-' + slug(name) + '.svg'; if (!G[glyph]) throw Error('no drawing ' + glyph); files[file] = svg(G[glyph]); manifest.legacy[name] = file; }
  for (const [name, glyph] of Object.entries(TRANSPORT_GLYPH)) { const file = 'tr-' + slug(name) + '.svg'; files[file] = svg(G[glyph]); manifest.transport[name] = file; }
  for (const [name, glyph] of Object.entries(MODE_GLYPH)) { const file = 'mode-' + slug(name) + '.svg'; files[file] = svg(G[glyph]); manifest.modes[name] = file; }
  for (const [subject] of SUB_SUBJECTS) { const file = 'sub-' + subject.replace(/_/g, '-') + '.svg'; files[file] = svgSub(G[subject]); manifest.subjects[subject] = file; }
  manifest.subjectRules = SUB_SUBJECTS.map(([s, re]) => [s, re.source, re.flags]);

  // one drawing per category/service/transport/mode: the same SVG must not appear twice across those groups
  const owners = {};
  for (const grp of ['categories', 'legacy', 'services', 'transport', 'modes']) for (const [k, f] of Object.entries(manifest[grp])) {
    const body = files[f]; if (owners[body]) throw Error(`duplicate drawing: ${grp}:${k} = ${owners[body]}`); owners[body] = grp + ':' + k;
  }
  files['manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  const js = '/* GENERATED by tools/build_category_illustrations.mjs — do not edit. */\nwindow.SKH_CATEGORY_ICONS = ' + JSON.stringify(manifest) + ';\n';
  const jsPath = path.join(ROOT, 'js/app/86-category-icons-manifest.js');

  if (process.argv.includes('--check')) {
    let bad = [];
    for (const [f, body] of Object.entries(files)) { const p = path.join(OUT, f); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== body) bad.push(f); }
    if (!fs.existsSync(jsPath) || fs.readFileSync(jsPath, 'utf8') !== js) bad.push('js/app/86-category-icons-manifest.js');
    if (bad.length) { console.error('Illustration drift: ' + bad.slice(0, 5).join(', ') + ' — run node tools/build_category_illustrations.mjs'); process.exit(1); }
    console.log(`PASS category illustrations in sync (${Object.keys(files).length - 1} svg + manifest)`); return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), body);
  fs.writeFileSync(jsPath, js);
  const total = Object.keys(files).length - 1, bytes = Object.values(files).reduce((a, b) => a + Buffer.byteLength(b), 0);
  console.log(`wrote ${total} illustrations (${Math.round(bytes / 1024)} KB total, avg ${Math.round(bytes / total / 1024 * 10) / 10} KB) + manifest`);
}
main().catch(e => { console.error(e); process.exit(1); });

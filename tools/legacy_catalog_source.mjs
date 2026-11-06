// [REMEDIATION 2026-11 R4] Read-only extraction of the legacy buyer catalogues
// (skh.advancedCategories / skh.serviceDataMap in 00-bootstrap.js) so tests and the
// taxonomy quality report can compare them with the canonical taxonomy without a
// browser. Nothing is modified.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function grab(file, name) {
    const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const i = s.indexOf('skh.' + name + ' = ');
    if (i < 0) throw new Error('not found: skh.' + name);
    const j = s.indexOf('{', i);
    let d = 0, k = j;
    for (; k < s.length; k++) {
        const c = s[k];
        if (c === '{') d++;
        else if (c === '}') { d--; if (!d) break; }
        else if (c === '"' || c === "'" || c === '`') { const q = c; k++; while (s[k] !== q) { if (s[k] === '\\') k++; k++; } }
    }
    return (0, eval)('(' + s.slice(j, k + 1) + ')');
}
export function legacyAdvancedCategories() { return grab('js/app/00-bootstrap.js', 'advancedCategories'); }
export function legacyServiceDataMap() { return grab('js/app/00-bootstrap.js', 'serviceDataMap'); }

// Contract: a seller's TRANSPORT listing can actually be linked to an ad.
//
// Background — the mismatch this test locks down:
//   · `functions/creative.js` resolved `transport` to the `delivery` collection;
//   · the live Usafiri feed stores transport listings in `drivers`
//     (functions/index.js re-types `transport -> drivers`), and `delivery` is empty.
//   Result before the fix: a transport ad could be created in the UI and then be
//   rejected by `canonicalEntity` with "Linked destination no longer exists.",
//   because the document it looked for was never in `delivery`.
//
// This is a STATIC contract (no firebase-admin, no network): it pins the mapping
// and the first-wins resolution order, and pins that the studio asks for the same
// collections the server resolves.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

const server = read('functions/creative.js');
const studio = read('js/app/101-marketplace-ads-studio.js');

// --- server side ---------------------------------------------------------------
check('server resolves transport to `drivers` (the live feed collection)', /transport:\s*\[\s*'delivery'\s*,\s*'drivers'\s*\]/.test(server.replace(/\s+/g, ' ')) ||
  /transport:\s*\[[^\]]*'drivers'[^\]]*\]/.test(server), server.match(/transport:\s*\[[^\]]*\]/)?.[0]);
check('server keeps `delivery` as a first-wins legacy alias', /transport:\s*\[\s*'delivery'\s*,\s*'drivers'\s*\]/.test(server.replace(/\s+/g, ' ')),
  'order matters: historical documents win, then the live collection');
check('canonicalEntity walks the collection list instead of assuming one', /for \(const collection of collections\)/.test(server));
check('canonicalEntity still fails closed when nothing matches', /if \(!snap\) throw new HttpsError\('not-found'/.test(server));
check('ownership check is unchanged (server-side, not only UI)', /if \(!adminUser && !owners\.includes\(uid\)\) throw new HttpsError\('permission-denied'/.test(server));
check('no destructive migration was added', !/\.delete\(\)|batch\(\)\.delete|collection\([^)]*\)\.doc\([^)]*\)\.delete/.test(server));

// --- studio side ---------------------------------------------------------------
check('studio queries the same collections in the same order', /collections:\s*\['drivers',\s*'delivery'\]/.test(studio) ||
  /collections:\s*\[[^\]]*'drivers'[^\]]*'delivery'[^\]]*\]/.test(studio), studio.match(/collections:\s*\[[^\]]*\]/g)?.slice(0, 3).join(' '));
check('studio no longer hard-codes `delivery` as the transport collection alone', !/collection:\s*'delivery'/.test(studio));
check('studio records which collection a listing came from', /__collection/.test(studio));
check('studio links transport ads as entityType `transport`', /creative\.destination = \{ type: d\.type/.test(studio));

// --- the paired function contract ----------------------------------------------
// creativePublish requires destination.id === linked entity id; the studio sets both
// from the same listing, so the pairing cannot drift.
check('studio sets destination and linkedEntity from the same listing id',
  /creative\.destination = \{ type: d\.type, id: String\(listing\.id\) \};[\s\S]{0,120}creative\.linkedEntity = \{ type: d\.type, id: String\(listing\.id\) \};/.test(studio));

const failed = checks.filter(c => !c.ok);
checks.forEach(c => console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  [' + String(c.detail).slice(0, 90) + ']' : '')));
console.log(`\nTRANSPORT AD LINK CONTRACT: ${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

import assert from 'node:assert/strict';

const base = String(process.argv[2] || process.env.SOKOHAI_LIVE_URL || 'https://sokohaicom.netlify.app').replace(/\/$/, '');
const oldMarkers = [
  "id: 'productDelivery'",
  'Uwasilishaji (hiari)',
  'Mahali pa kupeleka (hiari)',
  'Siku unayopendelea kupokea (hiari)',
  "showBanner('Anza mazungumzo kwanza.')",
  'document.body.appendChild(host.firstChild)'
];

async function read(path) {
  const url = base + path + (path.includes('?') ? '&' : '?') + 'verify=' + Date.now();
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  return { url: res.url, status: res.status, type: res.headers.get('content-type') || '', text: await res.text() };
}

function pass(name) { console.log('✅ ' + name); }
function clean(name, text) {
  for (const marker of oldMarkers) assert(!text.includes(marker), `${name}: stale marker found: ${marker}`);
  pass(name + ' haina old negotiation markers');
}

console.log('--- LIVE NEGOTIATION DEPLOY CONTRACT ---');
console.log('Target:', base);

const index = await read('/');
assert.equal(index.status, 200, 'root index status');
assert(index.text.includes('id="chatNegotiationHost"'), 'root index haina #chatNegotiationHost');
pass('root index ina Chat negotiation host');

const logic = await read('/js/app/38-nego-form-logic.js');
assert.equal(logic.status, 200, 'logic status');
assert(/javascript|text\/plain/.test(logic.type), `logic content-type si JS: ${logic.type}`);
clean('live 38-nego-form-logic.js', logic.text);
assert(!logic.text.includes("key: 'deliveryLocation'"), 'Product deliveryLocation bado iko live');
pass('live Product schema haina delivery/pickup fields');

const form = await read('/js/app/38-negotiation-form.js');
assert.equal(form.status, 200, 'form status');
assert(/javascript|text\/plain/.test(form.type), `form content-type si JS: ${form.type}`);
clean('live 38-negotiation-form.js', form.text);
assert(form.text.includes("document.getElementById('chatNegotiationHost')"), 'live form haitumii Chat host');
assert(form.text.includes("setSubmitPhase('PREPARING_CONVERSATION')"), 'live submit state machine haipo');
pass('live form iko Chat host na ina automatic conversation preparation');

const retired = await read('/fonts/js/app/38-negotiation-form.js');
clean('retired /fonts/ path', retired.text);
assert(!retired.text.includes('function lastNegotiationCard()'), 'retired /fonts/ bado inatoa stale app');
pass('/fonts/ haiwezi tena kutoa negotiation implementation ya zamani');

console.log('ALL LIVE NEGOTIATION DEPLOY CHECKS PASSED');

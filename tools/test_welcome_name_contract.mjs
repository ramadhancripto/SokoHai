/**
 * Welcome modal identity contract.
 * Regression guard: #welcomeName must show the ACCOUNT NAME, never the bare
 * i18n label "MTUMIAJI" — the bug was data-i18n="onboard_user" being re-applied
 * by LMS.apply() after the name had been written.
 */
import { chromium } from 'playwright';
const R = { checks: [], errors: [] };
const check = (n, ok, d = '') => { R.checks.push({ n, ok: !!ok, d }); };
const b = await chromium.launch();

const signedIn = (profile) => `(() => {
  const profile = ${JSON.stringify(profile)};
  let t = setInterval(() => {
    if (!window.skh) return; clearInterval(t);
    let cur = { uid: 'u-test', email: profile.email || 'user@example.com', displayName: profile.displayName || null };
    Object.defineProperty(window.skh, 'currentUser', { configurable: true, get(){ return cur; }, set(v){ if (v) cur = v; } });
    window.skh.currentUserData = Object.assign({}, profile);
    window.skh.__authResolved = true;
  }, 15);
})();`;

async function open(inject) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => R.errors.push(String(e.message).slice(0, 140)));
  if (inject) await p.addInitScript(inject);
  await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  return { ctx, p };
}
const nameOf = p => p.evaluate(() => (document.getElementById('welcomeName') || {}).textContent || '');

{ // guest
  const { ctx, p } = await open(null);
  const t = await nameOf(p);
  check('guest never sees the bare "MTUMIAJI" label', !/^\s*mtumiaji\s*$/i.test(t), t);
  const prot = await p.evaluate(() => {
    const el = document.getElementById('welcomeName');
    return { i18n: el.hasAttribute('data-i18n'), noI18n: el.hasAttribute('data-no-i18n') };
  });
  check('identity element is excluded from i18n', prot.i18n === false && prot.noI18n === true, JSON.stringify(prot));
  await ctx.close();
}

{ // registered seller — full name
  const { ctx, p } = await open(signedIn({ fullName: 'Amina Hassan', email: 'amina@example.com' }));
  check('registered name is shown', /Amina Hassan/i.test(await nameOf(p)), await nameOf(p));
  await ctx.close();
}

{ // language round-trip
  const { ctx, p } = await open(signedIn({ fullName: 'Juma Mwenda', email: 'j@example.com' }));
  await p.evaluate(() => window.setSokoHaiLanguage && window.setSokoHaiLanguage('en'));
  await p.waitForTimeout(1900);
  const en = await nameOf(p);
  await p.evaluate(() => window.setSokoHaiLanguage && window.setSokoHaiLanguage('sw'));
  await p.waitForTimeout(1700);
  const sw = await nameOf(p);
  check('name survives EN/SW language switches', /Juma Mwenda/i.test(en) && /Juma Mwenda/i.test(sw), `${en} | ${sw}`);
  await ctx.close();
}

{ // seller with no personal name → store name
  const { ctx, p } = await open(signedIn({ storeName: 'Duka la Bahari', email: 'shop@example.com' }));
  check('falls back to store name', /Duka la Bahari/i.test(await nameOf(p)), await nameOf(p));
  await ctx.close();
}

{ // late auth-ready must refresh an open welcome
  const { ctx, p } = await open(null);
  await p.evaluate(() => {
    window.skh.currentUser = { uid: 'late', displayName: 'Neema Joseph', email: 'n@example.com' };
    window.skh.currentUserData = { fullName: 'Neema Joseph' };
    document.dispatchEvent(new CustomEvent('skh:auth-ready', { detail: { user: window.skh.currentUser } }));
  });
  await p.waitForTimeout(1600);
  check('late login refreshes the open welcome name', /Neema Joseph/i.test(await nameOf(p)), await nameOf(p));
  await ctx.close();
}

{ // unrelated DOM churn must not clobber it
  const { ctx, p } = await open(signedIn({ fullName: 'Halima Said', email: 'h@example.com' }));
  await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div>Karibu Kwenye</div>'));
  await p.waitForTimeout(1500);
  check('DOM churn does not clobber the name', /Halima Said/i.test(await nameOf(p)), await nameOf(p));
  await ctx.close();
}

await b.close();
const failed = R.checks.filter(c => !c.ok);
console.log(`${R.checks.length - failed.length}/${R.checks.length} checks passed`);
failed.forEach(f => console.log('  FAIL:', f.n, '→', f.d));
if (R.errors.length) console.log('page errors:', R.errors.slice(0, 5));
process.exit(failed.length ? 1 : 0);

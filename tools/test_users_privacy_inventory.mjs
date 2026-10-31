#!/usr/bin/env node
/**
 * [REPAIR 2026-10 C4] Inventory guard for reads of the private `users` collection.
 *
 * users/{id} is readable only by its owner, an admin, or the agent who manages
 * that offline member (firestore.rules). Other people are read from the
 * server-maintained `userCards` projection via skh.getUserCard(uid).
 *
 * This test lists EVERY browser line that reads `users` and requires each one to
 * be classified below. A new, unclassified read (for example someone reading a
 * seller's profile for display) fails the build instead of failing silently in
 * production with "permission-denied".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// file -> reason. Lines are matched by content so line numbers can move.
const CLASSIFIED = [
  // Own profile (signed-in user reads/writes their own document)
  ['js/app/00-bootstrap.js', /mine \? 'users' : 'userCards'/, 'helper: own doc or public card'],
  ['js/app/04-orders-escrow.js', /onSnapshot\(skh\.doc\(skh\.db, "users", user\.uid\)/, 'own profile listener'],
  ['js/app/08-app-state.js', /"users", user\.uid\)\)/, 'own profile on login'],
  ['js/app/60-identity-layer.js', /'users', wantUid/, 'own profile (guarded: wantUid === currentUser.uid)'],
  ['js/app/63-audit-fixes.js', /'users', uid\)\)\.then/, 'own profile (uid = currentUser.uid)'],
  ['js/app/64-my-profile.js', /'users', uid\)/, 'own profile edit'],
  ['js/app/67-payment-accounts.js', /'users', uid\(\)\)/, 'own payment accounts'],
  ['js/app/69-chat-groups.js', /'users', (me|uid\(\))\)/, 'own wallet/account type'],
  ['js/app/73-group-soga.js', /'users', uid\(\)\)/, 'own wallet'],
  ['js/17-pesapal-return.js', /where\('uid', '==', window\.currentUser\.uid\)/, 'own cart reset'],
  // Agent reading members it manages (rules: managedByAgentUid/createdByAgentId)
  ['js/app/31-agent-assist.js', /where\('memberId', '==', (candidate|code)\)/, 'agent: own members / uniqueness probe (denied -> fallback id)'],
  ['js/app/31-agent-assist.js', /'users', out\[i\]\.uid/, 'agent: own members list'],
  ['js/app/59-agent-monitor.js', /'users', (memberUid|uidStr)\)/, 'agent: own members'],
  ['js/app/13-community.js', /where\("managedByAgentUid", "==", skh\.currentUser\.uid\)/, 'agent: own offline members'],
  // Admin only screens (rules: isAdmin)
  ['js/app/98-admin-control-center.js', /collection\(skh\.db, 'users'\)|'users', q\)/, 'admin control center'],
  // Legacy client money paths: only run when WALLET_VIA_SERVER / CRON_VIA_SERVER are false
  ['js/app/04-orders-escrow.js', /where\("(uid|myAgentCode)", "==", (sellerId|driverId|sellerAgentCode)\)/, 'legacy release (WALLET_VIA_SERVER=false only)'],
  ['js/app/14-map-onboarding.js', /where\("uid", "==", sellerId\)/, 'legacy cron (CRON_VIA_SERVER=false only)'],
  ['js/app/21-sokopay.js', /where\("uid", "==", sellerId\)/, 'legacy link release (WALLET_VIA_SERVER=false only)'],
];
const READ = /(getDocs?|onSnapshot)\(|query\(|collection\([^)]*['"]users['"]/;

let pass = 0, fail = 0;
const unclassified = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) {
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (!/['"]users['"]/.test(line) || !READ.test(line)) return;
        if (/(updateDoc|setDoc)\(\s*\w+\.doc\(/.test(line) && !/get|query|onSnapshot/.test(line.replace(/updateDoc|setDoc/g, ''))) return; // pure writes are checked by rules tests
        const ok = CLASSIFIED.some(([file, re]) => file === rel && re.test(line));
        if (!ok) unclassified.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 140));
      });
    }
  }
}
walk(path.join(ROOT, 'js'));
if (unclassified.length) { fail++; console.log('FAIL unclassified reads of private users/{id}:\n  ' + unclassified.join('\n  ')); }
else { pass++; console.log('PASS every browser read of users/{id} is own / agent / admin / gated legacy'); }

const cfg = fs.readFileSync(path.join(ROOT, 'js/00-config.js'), 'utf8');
if (/WALLET_VIA_SERVER:\s*true/.test(cfg) && /CRON_VIA_SERVER:\s*true/.test(cfg)) { pass++; console.log('PASS legacy client money paths are disabled in config'); }
else { fail++; console.log('FAIL WALLET_VIA_SERVER / CRON_VIA_SERVER must stay true'); }

const helper = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
if (/skh\.getUserCard = async function/.test(helper)) { pass++; console.log('PASS public card helper present'); } else { fail++; console.log('FAIL helper missing'); }

console.log(`\nUSERS PRIVACY INVENTORY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

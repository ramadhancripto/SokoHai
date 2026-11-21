import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = p => fs.readFileSync(path.join(root, p), 'utf8');

const auth = r('css/06-auth-polish.css');
const market = r('css/07-market-polish.css');
const social = r('css/15-chat-comments.css');
const sell = r('html/09-admin-sell.html');
const forms = r('js/app/05-forms.js');

let p = 0, f = 0;

const c = (n, v) => {
  if (v) {
    p++;
    console.log('PASS', n);
  } else {
    f++;
    console.error('FAIL', n);
  }
};

// [AUTH-UI 2026-11-21] owner-approved redesign: the thin top strip and the empty green logo circle were replaced by
// a full light page (gold/green waves as decoration) and the approved app icon. Same intent, new design tokens.
c(
  'auth primary action is green only',
  auth.includes('background: linear-gradient(135deg, #1cb68d 0%, #12946f 100%)')
);

c(
  'auth screen is a light page (no dark backdrop) with the owner-approved hero artwork',
  auth.includes('linear-gradient(180deg, #f4fbf8 0%, #ffffff 42%, #eef8f4 100%)') && !/rgba\(2, 13, 28/.test(auth)
    && r('html/04-modal-auth.html').includes('src="assets/img/auth/auth-hero.webp"')
);

c(
  'auth strip does not spend premium gold',
  !auth.includes('var(--skh-gold, #d4af37) 100%')
);

c(
  'market language selected state is green',
  market.includes('background: #18A982')
);




c(
  'seller form gallery action is green',
  sell.includes('background:#18A982; color:white')
);

c(
  'seller form utility camera action is neutral not black',
  sell.includes('background:#526962; color:white')
);

c(
  'form runtime save action is green',
  forms.includes("btnSave.style.background = '#18A982'")
);

console.log(`\nWHITE SYSTEM FORMS: ${p} passed, ${f} failed`);

if (f) process.exit(1);
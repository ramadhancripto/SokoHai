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

c(
  'auth accent strip is green only',
  auth.includes('linear-gradient(90deg, #18A982 0%, #35B892 100%)')
);

c(
  'auth logo surface is soft green',
  auth.includes('background: #EAF8F2 !important')
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
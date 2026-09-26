import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = p => fs.readFileSync(path.join(root, p), 'utf8');

const nav = r('css/29-nav-dict.css');
const group = r('js/app/73-group-soga.js');
const groups = r('js/app/69-chat-groups.js');
const go = r('js/app/74-group-order-system.js');

const nego = r('css/17-negotiation-form.css');
const late = r('css/27-visual-audit-fixes.css');
const profile = r('css/28-my-profile.css');

const logistics = r('css/23-logistics-market.css');
const delivery = r('css/22-delivery-choice.css');
const dash = r('js/app/10-dashboard-tabs.js');
const admin = r('js/app/16-pos-admin-jobs.js');
const social = r('html/06-modals-social.html');
const socialjs = r('js/app/28-buyer-engagement.js');

let p = 0;
let f = 0;

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
  'Discover and Group shared sheet header is light',
  nav.includes('.skh-sheet-head') &&
  nav.includes('background: #F1FBF7')
);

c(
  'shared sheet controls are white-green',
  nav.includes('background: #fff; color: #17604E')
);

c(
  'group message area keeps WhatsApp light surface',
  group.includes('id="gsgMsgs"') &&
  group.includes('background:#efe7dd')
);

c(
  'group header avatar uses soft blue identity',
  group.includes(
    'background:#EAF3FA;border:1px solid #CFDFEB;color:#39779B'
  )
);

c(
  'group send actions are green',
  group.includes('data-act="gsg-send"') &&
  group.includes('background:#18A982')
);

c(
  'group creation actions are green',
  groups.includes('background:#18A982')
);

c(
  'group order actions are green',
  go.includes('background:#18A982')
);

c(
  'negotiation header is light green',
  nego.includes('.nf-head {') &&
  nego.includes('background: #F1FBF7')
);

c(
  'late negotiation heading color matches light header',
  late.includes(
    'color: #18352D;                      /* dark text on the light green header */'
  )
);

c(
  'profile fallback cover is light',
  profile.includes(
    'background: linear-gradient(135deg, #EAF8F2, #F0F7FA)'
  )
);

c(
  'profile primary action is green',
  profile.includes('.mp-btn-brand { background: #18A982')
);



c(
  'transport information hero is light blue',
  logistics.includes('background: #F0F7FA') &&
  logistics.includes('color: #39779B')
);

c(
  'delivery chooser header is light',
  delivery.includes('.skh-dpick-head {') &&
  delivery.includes('background: #F0F7FA')
);

c(
  'post-payment delivery header is light',
  delivery.includes('.skh-dpost-head { background:#F0F7FA')
);

c(
  'driver live dashboard banner is white',
  dash.includes('id="driverLiveBanner" style="background:#fff')
);

c(
  'admin control panel no longer uses dark block',
  admin.includes('PLATFORM CONTROL PANEL') &&
  !admin.includes('background: linear-gradient(135deg, #1e293b, #0f172a)')
);

c(
  'Buyer Dashboard static header is white-first',
  social.includes('class="byd-head"') &&
  social.includes('Buyer Dashboard')
);

c(
  'Buyer Dashboard selected tab is green',
  socialjs.includes("b.classList.toggle('active'") &&
  fs.readFileSync(
    path.join(root, 'css/35-buyer-dashboard.css'),
    'utf8'
  ).includes('.byd-tab.active{background:#18A982')
);

console.log(`\nWHITE SYSTEM MODULE CONTRACT: ${p} passed, ${f} failed`);

if (f) process.exit(1);
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = p => fs.readFileSync(path.join(root, p), 'utf8');

const pay = r('js/app/21-sokopay.js');
const payhtml = r('html/14-haipay.html');
const paymob = r('css/11-haipay-mobile.css');

const token = r('css/19-token-box.css');
const req = r('css/20-request-inbox.css');
const cart = r('js/app/23-smart-cart.js');

const roles = r('js/app/19-roles.js');
const agent = r('js/app/31-agent-assist.js');
const hub = r('js/app/17-hub.js');

const notif = r('js/app/07-product.js');
const notifcss = r('css/13-ui-polish.css');
const buyer = r('html/18-buyer-view.html');
const orders = r('html/03-modals-core.html');
const market = r('html/05-modals-market.html');

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
  'SokoPay inner primary actions are green',
  pay.includes('background:#18A982')
);

c(
  'SokoPay governance map no longer uses black panel',
  !pay.includes('background:#001122; color:white; padding:20px')
);

c(
  'SokoPay fragment has no dark action backgrounds',
  !/(?:background:\s*#0f172a|background:#001122|background:\s*#00509d)/.test(payhtml)
);

c(
  'SokoPay mobile bar is white',
  paymob.includes('background: #FFFFFF !important')
);

c(
  'SokoPay mobile active pill is soft green',
  paymob.includes('background: #EAF8F2 !important') &&
  paymob.includes('box-shadow: inset 0 -3px 0 #18A982')
);

c(
  'Token Box sheet is white',
  /\.tb-sheet[\s\S]*background:\s*#FFFFFF/.test(token)
);

c(
  'Token Box active tab is green',
  token.includes('background: #18A982; border-color: #18A982')
);

c(
  'Token code strip is soft green',
  token.includes('.tb-code-row') &&
  token.includes('background: #EAF8F2')
);

c(
  'Token primary action is green',
  /\.tb-btn-primary[\s\S]*background:\s*#18A982/.test(token)
);

c(
  'Request Inbox sheet is white',
  /\.ri-sheet[\s\S]*background:\s*#FFFFFF/.test(req)
);

c(
  'Request Inbox header icon is soft blue',
  req.includes('background: #F0F7FA') &&
  req.includes('color: #39779B')
);

c(
  'Request Inbox active tab is green',
  req.includes('background: #18A982; border-color: #18A982')
);

c(
  'Cart header is light green',
  cart.includes('.scart-head { background:#F1FBF7')
);

c(
  'Cart total is soft green not dark',
  cart.includes('.scart-total { background:#EAF8F2')
);

c(
  'Buyer order header is light',
  cart.includes('.spbuyer-head { background:#F1FBF7')
);

c(
  'Logistics cart headers are light blue',
  cart.includes('.lgx-head { background:#F0F7FA')
);

c(
  'Smart cart injected CSS has no legacy dark header backgrounds',
  !/(?:background:linear-gradient\(135deg,#0f172a|background:linear-gradient\(135deg,#001122)/.test(cart)
);

c(
  'Logistics role sidebar is white',
  roles.includes('class="ct-sidebar" style="background:#fff')
);

c(
  'Service provider sidebar dark theme removed',
  !roles.includes('background:#071625')
);

c(
  'Agent assist dark hero removed',
  !agent.includes('linear-gradient(135deg,#1268A8,#0f172a)')
);

c(
  'Agent primary actions are green',
  agent.includes('background:#18A982; color:#fff')
);

c(
  'Hub charts use green blue gold system palette',
  hub.includes("['#18A982', '#4D91AA', '#D8B83A']")
);

c(
  'Unread notification uses light green row',
  notif.includes('background:#F1FBF7;border:1px solid #D9EEE5')
);

c(
  'Notification icons have semantic type classes',
  notif.includes('skh-notif-ico type-${skh.skhEscape(ntype')
);

c(
  'Notification semantic CSS includes green blue and gold',
  notifcss.includes('.skh-notif-ico.type-order') &&
  notifcss.includes('.skh-notif-ico.type-delivery') &&
  notifcss.includes('.skh-notif-ico.type-negotiation')
);

c(
  'KPI palette has no purple identity',
  !buyer.includes('#8b5cf6')
);

c(
  'Pending KPI no longer uses danger red',
  !buyer.includes('border-left: 4px solid #ef4444')
);

c(
  'Buyer order launch actions are green',
  orders.includes('background:#18A982')
);

c(
  'Checkout payment action is green',
  market.includes('id="btnPay"') &&
  market.includes('background:#18A982')
);

console.log(`\nWHITE SYSTEM CHECKPOINT 2: ${p} passed, ${f} failed`);

if (f) process.exit(1);
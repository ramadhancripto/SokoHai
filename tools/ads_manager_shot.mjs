import { chromium } from 'playwright';
const b = await chromium.launch();
const out = {};
for (const vp of [{w:1440,h:950,tag:'desktop'},{w:390,h:844,tag:'mobile'}]) {
  const ctx = await b.newContext({ viewport:{width:vp.w,height:vp.h}, locale:'sw-TZ' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(5000);
  const g = p.locator('button:has-text("ENDELEA NDANI")').first();
  if (await g.count()) await g.click().catch(()=>{});
  await p.waitForTimeout(1200);
  await p.evaluate(async () => {
    const host = document.createElement('div');
    host.id='shotHost'; host.style.cssText='position:fixed;inset:0;z-index:99999;background:#F8FBFA;overflow:auto;padding:14px';
    host.innerHTML='<div class="skh-ads-panel" style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px"><div class="adm-ad-topnav"><div><h3 class="adm-ad-topnav-title">Matangazo</h3><p class="adm-ad-topnav-sub">Unda, simamia na fuatilia matangazo.</p></div><div class="adm-ad-actions"><button class="adm-ad-btn">Media Library</button><button class="adm-ad-btn primary">+ Tengeneza Tangazo</button></div></div><div class="adm-ad-tabs"><button class="adm-ad-tab active">Zinaendelea</button><button class="adm-ad-tab">Zilizopangwa</button><button class="adm-ad-tab">Zilizosimama</button><button class="adm-ad-tab">Rasimu</button><button class="adm-ad-tab">Zilizokamilika</button><button class="adm-ad-tab">Zilizopitwa na muda</button><button class="adm-ad-tab">Kumbukumbu</button><button class="adm-ad-tab">Kampeni</button><button class="adm-ad-tab">Takwimu</button></div><div id="adminAnnouncementListBox"></div></div>';
    document.body.appendChild(host);
    await window.renderAnnouncementManagerList();
  });
  await p.waitForTimeout(3000);
  await p.screenshot({ path:`audit-shots/40-ad-manager-${vp.tag}.png` });
  out[vp.tag] = await p.evaluate(() => ({ rows: document.querySelectorAll('#adminAnnouncementListBox .adm-ad-row').length }));
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out));

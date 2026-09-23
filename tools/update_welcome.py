with open('html/03-modals-core.html', 'r', encoding='utf-8') as f:
    c = f.read()

start_tag = '<!-- WELCOME ALERT MODAL -->'
end_tag = '<!-- MAP MODAL -->'

start_idx = c.find(start_tag)
end_idx = c.find(end_tag)

new_welcome = '''<!-- WELCOME ALERT MODAL -->
<div id="welcomeModal" class="overlay-menu" style="z-index: 9000; background:rgba(16, 42, 67, 0.92); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);">
    <div style="background:#ffffff; border-radius:24px; padding:0 0 28px 0; width:90%; max-width:380px; text-align:center; box-shadow: 0 25px 70px rgba(16, 42, 67, 0.45); overflow:hidden; animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); border:1px solid #e5ecec;">
        <div style="background: linear-gradient(135deg, #102a43 0%, #1268A8 50%, #18A982 100%); height: 110px; position:relative; border-bottom: 4px solid #D4AF37;">
            <div style="position:absolute; bottom:-38px; left:50%; transform:translateX(-50%); width: 76px; height: 76px; background: #ffffff; border-radius: 50%; border: 3.5px solid #D4AF37; display:flex; align-items:center; justify-content:center; box-shadow: 0 8px 24px rgba(16,42,67,0.22); overflow:hidden;">
                <svg width="46" height="46" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skhWelcomeSGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#1268A8"/>
                      <stop offset="50%" stop-color="#18A982"/>
                      <stop offset="100%" stop-color="#0E7A5F"/>
                    </linearGradient>
                  </defs>
                  <path d="M34 14 C31 9 24 7 18 9 C11 11.5 10 18.5 17 22 C23.5 25 31 27 34.5 31.5 C38 36.5 35 43.5 27 45 C19 46.5 11 44 8 38" stroke="url(#skhWelcomeSGrad)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="36" cy="11" r="3.2" fill="#D4AF37"/>
                </svg>
            </div>
        </div>
        <div style="padding: 48px 22px 0;">
            <h3 data-i18n="onboard_welcome" style="color:#64748b; margin:0 0 6px; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Karibu Kwenye</h3>
            <h2 class="skh-wordmark-host" style="margin:0 0 6px;"><span data-skh-wm="190"></span></h2>
            <div style="margin:10px 0 16px;">
                <span style="display:inline-block; font-size:13px; color:#526962; font-weight:600;">Karibu sana,</span>
                <h2 id="welcomeName" data-i18n="onboard_user" style="color:#0E7A5F; margin:2px 0 0; font-size:21px; font-weight:900; text-transform:capitalize; word-break:break-word;">Mwanachama</h2>
            </div>
            <p data-i18n="onboard_tag" style="font-size:13.5px; color:#475569; margin:0 0 22px; line-height:1.55;">Tafuta bidhaa, huduma, usafiri, wasiliana na fanya miamala salama kupitia SokoHai.</p>
            <button onclick="unlockSystem(); if(typeof closeWelcome==='function')closeWelcome();" data-i18n="onboard_cta" style="width:100%; padding:14px 18px; background:linear-gradient(90deg, #0E7A5F, #18A982); color:#ffffff; border:none; border-radius:14px; font-weight:900; font-size:15px; cursor:pointer; box-shadow: 0 6px 18px rgba(14, 122, 95, 0.35); transition:0.2s; text-transform:uppercase; letter-spacing:0.8px;">ENDELEA NDANI</button>
        </div>
    </div>
</div>

'''

c_new = c[:start_idx] + new_welcome + c[end_idx:]
with open('html/03-modals-core.html', 'w', encoding='utf-8') as f:
    f.write(c_new)
print('Updated 03-modals-core.html successfully')

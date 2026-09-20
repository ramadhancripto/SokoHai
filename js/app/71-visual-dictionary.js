/* ================================================================
 * 71-visual-dictionary.js — [R19 KAMUSI 2026-09-17]
 * SokoHai VISUAL LANGUAGE DICTIONARY (§1–§20):
 *   - Registry ya kati (iconDictionary) — SINGLE SOURCE OF TRUTH:
 *     { id, symbol, nameSw, nameEn, descSw, descEn, category, contexts[],
 *       action, exampleSw, exampleEn }
 *   - Inaungana na LANGUAGE BUTTON iliyopo: language-center modal hupata
 *     tabs: [Lugha] (asilia, haijavunjwa) + [Kamusi] (hii).
 *   - Searchable KISWAHILI + ENGLISH (name/desc/contexts).
 *   - Categories: general/navigation/roles/communication/commerce/payments/
 *     transport/security/status/content/system.
 *   - Validation: window.skhIconDictValidate() → dup ids, missing fields.
 *   - Hakuna maelezo ya kubahatsha: meanings zinashikilia implementation
 *     halisi (statuses za chat ✓✓, escrow, tokens, badges…).
 * ACCESSIBILITY (§16): registry inaonyesha pia pdf/aria labels za icons —
 * lakini dictionary ndiyo EDUCATION, si replacement ya aria-labels.
 * ================================================================ */
import { skh } from './00-bootstrap.js';

(function () {
    if (window.__skhDictBoot) return;
    window.__skhDictBoot = true;

    function lang() { try { return (window.SokoHaiLMS && window.SokoHaiLMS.lang) || 'sw'; } catch (e) { return 'sw'; } }
    function esc(s) { return skh.skhEscape(String(s == null ? '' : s)); }
    function tk(k, fb) { try { var s = window.t && window.t(k); return (s && s !== k) ? s : (fb || k); } catch (e) { return fb || k; } }
    function T2(sw, en) { return lang() === 'en' ? en : sw; }

    /* ---------------- REGISTRY (audit-driven; inapanuka) ---------------- */
    function E(id, sym, cat, nSw, nEn, dSw, dEn, ctx, action, exSw, exEn) {
        return { id: id, symbol: sym, category: cat, nameSw: nSw, nameEn: nEn, descSw: dSw, descEn: dEn, contexts: ctx, action: action, exSw: exSw || '', exEn: exEn || '' };
    }
    var DICT = [
        /* ---------- GENERAL / FUNDAMENTAL SYMBOLS ---------- */
        E('plus', '+', 'SYMBOLS', 'Ongeza / Unda', 'Add / Create', 'Kuongeza au kuunda kitu kipya: bidhaa, kikundi, member n.k.', 'Add or create something new: product, group, member etc.', ['products', 'groups', 'cart'], 'Hufungua form/kitendo cha kuunda', '+ Weka Bidhaa', '+ Add Product'),
        E('minus', '−', 'SYMBOLS', 'Punguza', 'Decrease', 'Kupunguza idadi/kiasi (k.m. idadi ya bidhaa kikapuni).', 'Decreases quantity/amount (e.g. cart quantity).', ['cart', 'orders'], 'Hupunguza idadi kwa 1', 'Idadi: − 1 +', 'Qty: − 1 +'),
        E('at', '@', 'CHAT_SOGA', 'Mention', 'Mention', 'Kumtaja mtumiaji: @juma humweka link/reference yake; notification inaweza kwenda kwake (kulingana na mipangilio yake).', 'Tags a user: typing @name creates a mention; they may get notified per their settings.', ['chat', 'discover', 'posts'], 'Hutua reference ya mtu', '@Asha', '@Asha'),
        E('hash', '#', 'POSTS', 'Kategoria / Kikundi', 'Category / Group marker', 'Kutambua kategoria au kikundi/kanali. Ndani ya Discover/Grafu, huonesha kikundi.', 'Marks a category or group/channel. In Discover/Groups it denotes a group.', ['search', 'discover', 'posts'], 'Huonesha kundi au kategoria iliyohusika', '#mchele', '#rice'),
        E('dollar', '$', 'PAYMENTS', 'Fedha / Bei', 'Money / Price', 'Inaashiria fedha. Kwenye SokoHai currency halisi ni TSh (TZS); $ hutumika kwa maana tu, si rechenge la sarafu halisi.', 'Denotes money. Actual SokoHai currency is TSh; $ is symbolic, not a currency substitute.', ['payments', 'products'], 'Hakuna — ni ishara ya fedha', 'TSh 45,000', 'TSh 45,000'),
        E('percent', '%', 'COMMERCE', 'Asilimia / Punguzo', 'Percent / Discount', 'Sehemu ya asilimia — punguzo la bei, riba, komisheni n.k.', 'Percentage portion: discount, interest, commission etc.', ['products', 'orders', 'pos'], 'Hutumika kwenye hesabu za punguzo/komisheni', 'Punguzo 10%', '10% off'),
        E('bang', '!', 'STATUS', 'Tahadhari', 'Attention / Warning', 'Umakini unahitajika: hitilafu, hatari au taarifa muhimu. Maana hupotea na context — soma habari iliyofuatia.', 'Attention required: error, risk or important notice. Exact meaning depends on context.', ['system', 'security', 'payments'], 'Soma ujumbe ufuatao kwa makini', '⚠ Malipo hayakufanikiwa', '⚠ Payment failed'),
        E('question', '?', 'SYMBOLS', 'Swali / Msaada', 'Help / Question', 'Msaada au taarifa za ziada juu ya sehemu husika.', 'Help or extra information about that area.', ['general'], 'Hufungua msaada/ufafanuzi', '? jifunze Logo', '? Learn the logo'),
        E('check', '✓', 'STATUS', 'Imetumwa / Imekamilika (CONTEXT)', 'Done / Sent (CONTEXT)', 'Inategemea context: chat = ujumbe umetumwa; sehemu zingine = imekamilika/imethibitishwa.', 'Context-dependent: in chat = message sent; elsewhere = complete/verified.', ['chat', 'status'], 'Haichagui — ni hali (status)', '✓ 10:20', '✓ 10:20'),
        E('double_check', '✓✓', 'CHAT_SOGA', 'Imewasilishwa / Imesomwa', 'Delivered / Read', 'Chati: alama mbili = umepelekwa; ikikaakiliwa = umesomwa. Backend inasasisha hali.', 'In chat: double ticks = delivered; highlighted ticks = read. Driven by backend state.', ['chat'], 'Haichagui — ni hali (status)', '✓✓ bluu', '✓✓ blue'),
        E('xmark', '×', 'SYMBOLS', 'Funga / Futa', 'Close / Delete', 'Kufunga dirisha/kadi au kufuta kipengee hasa kwa haraka.', 'Closes a panel/card or removes an item (context-driven).', ['modals', 'cart', 'payments'], 'Hufunga kwa click; futa hutaka uthibitisho', '× (juu kulia)', '× (top-right)'),
        E('arrow_r', '→', 'NAVIGATION', 'Mbele / Elekea', 'Forward / Direction', 'Mwelekeo wa kitendo au uhamisho kuelekea hatua inayofuata.', 'Direction towards a next step.', ['navigation', 'transport'], 'Hutumika kwenye hatua/maelekezo', 'Dodoma → Tabora', 'Dodoma → Tabora'),
        E('arrow_l', '←', 'NAVIGATION', 'Rudi Nyuma', 'Back', 'Kurudi kwenye sehemu iliyotangulia.', 'Go back to the previous place.', ['navigation'], 'Hurudisha ukurasa urioacha', '‹ Rudi Kwenye Menu', '‹ Back to Menu'),
        E('arrow_up', '↑', 'NAVIGATION', 'Juu / Onda kwa juu', 'Up / Scroll up', 'Kueleza juu — scroll au kiti cha juu ya orodha.', 'Upwards — scroll or jump to top of a list.', ['lists'], 'Husogeza mwonekano juu', '↑ Rejesha juu', '↑ Back to top'),
        E('arrow_down', '↓', 'NAVIGATION', 'Chini', 'Down', 'Kueleza chini — matokeo zaidi/maelezo zaidi.', 'Downwards — more results/details below.', ['lists'], 'Hupakua zaidi/onyesha maelezo', '↓ Zaidi chini', '↓ More below'),
        E('dots_v', '⋮', 'SYMBOLS', 'Menu ya Ziada', 'More options', 'Chaguzi za ziada kwa kipengee: futa, hifadhi, ripoti, weka bechafu n.k.', 'Extra options for an item: delete, save, report, mute etc.', ['chat', 'posts'], 'Hufungua menu', '⋮ (kwenye oda)', '⋮ (on an order)'),
        E('dots_h', '…', 'SYMBOLS', 'Inaendelea / Zaidi', 'More coming / More', 'Muendeleza maandishi(matukio/message) au maelezo zaidi hupatikana chini. Pia hutumika kama loading placeholder.', 'Continuation or more content below; also used as a loading placeholder.', ['text', 'lists'], 'Haichagui — ni kiashiria', 'Andika maoni…', 'Write a comment…'),
        E('slash', '/', 'SYMBOLS', 'Tofauti / Gawanya', 'Separator / Either', 'Mgawano wa chaguzi mbili (X/Y) au gawanya kwa hesabu.', 'Separates alternatives (X/Y) or division in math.', ['text'], 'Haichagui', 'Pickup / Handover', 'Pickup / Handover'),
        E('pipe', '|', 'SYMBOLS', 'Mgawano', 'Separator', 'Mgawano wa sehemu za taarifa (mf. ID | status | tarehe).', 'Separates pieces of info (e.g. ID | status | date).', ['text'], 'Haichagui', 'ORD-7X92 | In Transit', 'ORD-7X92 | In Transit'),
        E('asterisk', '*', 'SYMBOLS', 'Lazima (Required)', 'Required', 'Sehemu ya kujaza LAZIMA kwenye fomu (hakuna siku ya mbali).', 'MBU-required form field.', ['forms'], 'Haiwezi kusubmit bila kujaza', 'Jina la Benki *', 'Bank Name *'),

        /* ---------- NAVIGATION ---------- */
        E('nav_menu', '≡', 'NAVIGATION', 'Menu', 'Menu', 'Hufungua sidebar ya akaunti, mipangilio, vizuri na bidhaa za modal.', 'Opens the account sidebar with settings, tools and sections.', ['header'], 'Hufungua sidebar', '≡ (juu kushoto)', '≡ (top-left)'),
        E('nav_home', '🏠', 'NAVIGATION', 'Nyumbani', 'Home', 'Ukurasa mkuu wa soko — bidhaa zinazovuma.', 'Marketplace home with trending products.', ['bottom-nav'], 'Hupeleka home', '🏠 Nyumbani', '🏠 Home'),
        E('nav_search', '🔍', 'ICONS', 'Tafuta', 'Search', 'Utafutaji wa bidhaa/huduma/usafiri; ina picha-search (camera).', 'Search products/services/transport; supports image search.', ['header-search'], 'Huanza utafutaji', 'Tafuta viatu…', 'Search shoes…'),
        E('nav_camera', '📷', 'ICONS', 'Tafuta kwa Picha', 'Search by Image', 'Pakia picha — inatafuta bidhaa zinazofanana kimwonekano.', 'Upload a photo to find similar products visually.', ['search'], 'Hufungua camera/file picker', '📷 (kwenye search)', '📷 (on search)'),
        E('nav_cart', '🛒', 'ICONS', 'Kikapu', 'Cart', 'Bidhaa ulizotia kikapu, jumla na hatua ya malipo.', 'Your cart: items, total and checkout entry.', ['header', 'bottom-nav'], 'Hufungua kikapu', '🛒 (badge inaonyesha idadi)', '🛒 (badge shows count)'),
        E('nav_bell', '🔔', 'ICONS', 'Taarifa', 'Notifications', 'Arifa: ofa, malipo, ujumbe, maombi n.k. Badge nyekundu = idadi isirosomwa.', 'Alerts: offers, payments, messages, requests. Red badge = unread count.', ['header'], 'Hufungua notification center', '🔔 3', '🔔 3'),
        E('nav_chat', '💬', 'CHAT_SOGA', 'Chat / Soga', 'Chat', 'Mazungumzo yako yote (Inbox), Discover na "Gundua" sehemu.', 'All conversations (Inbox), plus Discover ("Gundua").', ['bottom-nav'], 'Hufungua Inbox', '💬', '💬'),
        E('nav_products', '📦', 'ICONS', 'Bidhaa', 'Products', 'Bidhaa zote sokoni (Feed).', 'All market products (Feed).', ['bottom-nav'], 'Hufungua orodha ya bidhaa', '📦 Bidhaa', '📦 Products'),
        E('nav_services', '🔧', 'ICONS', 'Huduma', 'Services', 'Watoa huduma na matangazo yao.', 'Service providers and their listings.', ['bottom-nav'], 'Hufungua huduma', '🔧 Huduma', '🔧 Services'),
        E('nav_transport', '🚚', 'ICONS', 'Usafiri', 'Transport', 'Dereva na safari za mizigo na abiria (gari, teksi, moto).', 'Transporters, trips and cargo services.', ['bottom-nav'], 'Hufungua usafiri', '🚚 Usafiri', '🚚 Transport'),

        /* ---------- ROLES (Commerce Identity — §5 R19) ---------- */
        E('role_seller', '🏪', 'ROLES', 'Muuzaji', 'Seller', 'Mtu anayeweza kuuza bidhaa kwenye soko (muuzaji / wauzaji). Ni ROLE, si verification.', 'A person selling products. This is a ROLE, not verification.', ['discover', 'profile', 'chat', 'groups'], 'Haichagui — ni utambulisho', '[Muuzaji] Asha', '[Seller] Asha'),
        E('role_buyer', '🛍', 'ROLES', 'Mnunuzi', 'Buyer', 'Mtu anayenunua (role ya msingi kwa watu wote — mnunuzi/wanunuzi).', 'Someone who buys (base role most users have).', ['discover', 'profiles'], 'Haichagui — ni utambulisho', '[Mnunuzi] Baraka', '[Buyer] Baraka'),
        E('role_provider', '🔧', 'ROLES', 'Mtoa Huduma', 'Service Provider', 'Anatoa kazi/huduma (fundi, repair, washonaji).', 'Offers services (craftsman, repairs, tailoring).', ['discover', 'chat'], 'Haichagui — ni utambulisho', '[Mtoa Huduma] Juma', '[Service Provider] Juma'),
        E('role_transporter', '🚚', 'ROLES', 'Msafirishaji', 'Transporter', 'Anabeba mizigo/abiria kati ya maeneo kwa gari (dereva, teksi, bodaboda).', 'Moves cargo/passengers between places.', ['discover', 'transport', 'chat'], 'Haichagui — ni utambulisho', '[Msafirishaji] Soko Transport', '[Transporter] Soko Transport'),
        E('role_business', '🏢', 'ROLES', 'Biashara', 'Business', 'Akaunti ya kampuni/duka (si mtu binafsi).', 'Company/shop account (not an individual).', ['discover', 'profile'], 'Haichagui — ni utambulisho', '[Biashara] Duka la Simu', '[Business] Phone Shop'),
        E('role_agent', '🪪', 'ROLES', 'Wakala', 'Agent', 'Msajili/msaidizi wa SokoHai — husajili wanachama na maduka offline.', 'SokoHai agent — registers members and offline shops.', ['discover', 'settings'], 'Haichagui — ni utambulisho', '[Wakala] Neema', '[Agent] Neema'),
        E('role_group', '👥', 'CHAT_SOGA', 'Kikundi / Group', 'Group', 'Mazungumzo ya watu wengi — commerce au Community.', 'Multi-person conversation — commerce or community.', ['chat', 'groups'], 'Hufungua kikundi', '👥 Vikundi vyangu', '👥 My groups'),

        /* ---------- STATUS & BADGES (§6) ---------- */
        E('st_verified', '✔', 'SECURITY', 'Imethibitishwa (Verified)', 'Verified', 'Utambulisho zima mchunguzi wa uthibitishaji (backend). Tofauti na ROLE: mtu akiwa seller haimaanishi awe verified.', 'Passed identity verification (backend). Separate from ROLE: being a seller does not imply verified.', ['profile', 'discover', 'badges'], 'Haichagui — ni heshima/backend state', 'Asha ✔', 'Asha ✔'),
        E('st_pending', '⏳', 'STATUS', 'Inasubiri (Pending)', 'Pending', 'Kitendo bado hakijakamilika: inasubiri hatua (malipo, verification, makubaliano).', 'In progress or waiting: payment, verification or agreement step.', ['orders', 'payments', 'negotiation'], 'Subiri au fuata hatua inayofuata', 'Inasubiri malipo', 'Awaiting payment'),
        E('st_active', '🟢', 'STATUS', 'Active / Online', 'Active / Online', 'Kitu chingendoendeshwa (kikundi, offer, listing) au mtu yuko online.', 'Something is live (group, offer, listing) or a person is online.', ['chat', 'groups'], 'Haichagui — ni hali', 'Group Buy ACTIVE', 'Group Buy ACTIVE'),
        E('st_offline', '⚪', 'STATUS', 'Offline', 'Offline', 'Mtu hajakuwa online hivi karibuni au huduma haipo.', 'Person not recently online or a service down.', ['chat'], 'Haichagui — ni hali', 'Last seen jana', 'Last seen yesterday'),
        E('st_completed', '✅', 'STATUS', 'Imekamilika', 'Completed', 'Hatua zote zimekwisha kikamilifu (oda/mkataba/safari).', 'All steps finished (order/contract/trip).', ['orders', 'trips'], 'Haichagui — ni hali', 'Oda ✅', 'Order ✅'),
        E('st_cancelled', '🚫', 'STATUS', 'Imekatizwa', 'Cancelled', 'Kitendo kimekatizwa kabla ya kukamilika. Historia hubaki.', 'Stopped before completion. History is preserved.', ['orders', 'negotiation'], 'Mwangania mualiko mpya ukitaka', 'Ofa imekatizwa', 'Offer cancelled'),
        E('st_expired', '⌛', 'STATUS', 'Muda Umeisha', 'Expired', 'Muda kwa kitendo (ofa/boost/deadline) umekoma.', 'Validity window (offer/boost/deadline) has ended.', ['negotiation', 'boost'], 'Haichagui — upya mbuni ikihitajika', 'Group Buy ⌛', 'Group Buy ⌛'),
        E('st_locked', '🔒', 'SECURITY', 'Imefungwa / Binafsi', 'Locked / Private', 'Taarifa haionekani wazi: audio protection, escrow lock, au uwekazi binafsi.', 'Not publicly visible: escrow lock, privacy protection or private setting.', ['payments', 'privacy'], 'Soma hitimisho/guard badge', 'Escrow 🔒 (malipo yaliyolindwa)', 'Escrow 🔒 (secured funds)'),
        E('st_error', '❌', 'STATUS', 'Hitilafu', 'Error', 'Kitendo hakikufanikiwa. Soma ujumbe kwa hatua inayofuata; jaribu tena au badilisha data.', 'Action failed. Read the message for next steps; retry or change data.', ['system', 'payments'], 'Jaribu tena au chase support', '❌ Imeshindikana', '❌ Failed'),
        E('st_success', '🎉', 'STATUS', 'Mafanikio', 'Success', 'Kitendo kimefanyiliwa.', 'Action completed successfully.', ['system'], 'Haichagui — pongezi', '🎉 kundi limekamilika', '🎉 group completed'),
        E('st_warning', '⚠', 'SECURITY', 'Onyo', 'Warning', 'Tahadhari kabla ya hatua (mf. kufuta akaunti).', 'Caution before an action (e.g. deleting an account).', ['system', 'security'], 'Soma maeleko kabla ya kuendelea', '⚠ Hatua haiwezi kurejelewa', '⚠ Cannot be undone'),
        E('st_blocked', '⛔', 'SECURITY', 'Imezuiwa (Blocked)', 'Blocked', 'Mtu/kitendo kimezuiwa (sio ya mara kwa mara — inaweza kuondolewa kwenye mipangilio).', 'Person/action blocked (reversible in settings).', ['chat', 'security'], 'Chunguza kwenye Mipangilio → Blocked', 'Waliozuiwa', 'Blocked Users'),
        E('st_net_error', '📡', 'STATUS', 'Tatizo la Mtandao', 'Network Error', 'Hakuna muunganiko au server haifikiwi; si data zilizopotea.', 'No connectivity or server unreachable; data is not lost.', ['system'], 'Angalia intanetti, jaribu tena', '📡 Hitilafu ya mtandao', '📡 Network error'),
        E('st_loading', '⌛', 'STATUS', 'Inapakia', 'Loading', 'Data inakusanywa — subiri.', 'Data is being fetched — please wait.', ['system'], 'Subiri kidogo', '⌛ Inapakia…', '⌛ Loading…'),

        /* ---------- COMMERCE (§8) ---------- */
        E('cm_offer', '📄', 'COMMERCE', 'Ofa / Mapendekezo ya Bei', 'Offer', 'Mapendekezo ya bei/muda kwenye negotiation (kadi ya ofa).', 'A price/terms proposal during negotiation (offer card).', ['chat', 'negotiation'], 'Hufungua kadi ya ofa', 'Ofa mpya TSh 40,000', 'New offer TSh 40,000'),
        E('cm_counter', '🔄', 'COMMERCE', 'Counter-offer', 'Counter-offer', 'Majibu ya bei mpya dhidi ya ofa iliyotangulia.', 'A revised price/terms in response to a prior offer.', ['negotiation'], 'Hutuma mpya ya ofa', 'Counter: 38,000', 'Counter: 38,000'),
        E('cm_accept', '🤝', 'COMMERCE', 'Makubaliano (Accept)', 'Agreement reached', 'OFA imekubaliwa — hatua inayofuata ni oda/malipo.', 'Offer accepted — next step is order/payment.', ['negotiation'], 'Hukubali ofa', '🤝 Amekubali TSh 40,000', '🤝 Accepted TSh 40,000'),
        E('cm_group_buy', '🛍👥', 'COMMERCE', 'Group Buy', 'Group Buy', 'Kununua kikundi: bei hushuka watu wanapoongezeka (thresholds ndani ya product).', 'Bulk buying: price drops as more buyers join (thresholds set on the listing).', ['products', 'groups'], 'Hufungua Group Buy ya bidhaa', '10+ → TSh 40,000', '10+ → TSh 40,000'),
        E('cm_wholesale', '📦📦', 'COMMERCE', 'Jumla (Wholesale)', 'Wholesale', 'Ofa ya jumla ya bidhaa nyingi (mvote 50+ units); allocations huimbizwa na seller.', 'Bulk listing (e.g. 50+ units); allocations/portioning by seller.', ['products', 'groups'], 'Hufungua offer ya jumla', '200 pcs → TSh 2,000,000', '200 pcs → TSh 2,000,000'),
        E('cm_auction', '🏆', 'COMMERCE', 'Mnada (Auction)', 'Auction', 'Kadi ya mnada: zabuni ya juu hushinda hadi mnada ufungwe.', 'Auction listing: highest bid wins until closing time.', ['products'], 'Hufungua mnada (kuweka zabuni)', 'Live Mnada', 'Live Auction'),
        E('cm_pricedrop', '📉', 'COMMERCE', 'Bei Inashuka', 'Price Drop', 'Bei hupungua kadiri muda unavoonyesha.', 'Price progressively falls over time.', ['products'], 'Hufungua details', 'Bei Inashuka', 'Price Drop'),
        E('cm_product', '📦', 'COMMERCE', 'Bidhaa iligawanywa', 'Shared product', 'Ujumbe wenye kadi ya bidhaa halisi; kufyata hufungua bidhaa.', 'Message containing a real product card; taps open the product.', ['chat'], 'Hufungua bidhaa', '[kadi ya Viatu]', '[shoes card]'),
        E('cm_order', '🧾', 'COMMERCE', 'Oda', 'Order', 'Rekodi ya nununuzi (ID, gharama, hali).', 'Purchase record (ID, cost, status).', ['orders', 'chat'], 'Hufungua oda husika', 'ORD-7X92KQ', 'ORD-7X92KQ'),

        /* ---------- PAYMENTS / SOKOPAY (§8) ---------- */
        E('sp_escrow', '🛡', 'PAYMENTS', 'Escrow / Ulinzi wa Malipo', 'Escrow Protection', 'Pesa imefungiwa na SokoHai hadi mtambo (delivery + confirmation) umekamilika.', 'Money is held by SokoHai until delivery + confirmation completes.', ['payments', 'orders'], 'Hufungua maelezo ya escrow', 'Malipo Yamelindwa', 'Payment Protected'),
        E('sp_wallet', '👛', 'PAYMENTS', 'Wallet ya SokoPay', 'SokoPay Wallet', 'Salio lako, tokens na njia za malipo.', 'Your balance, tokens and payment methods.', ['header', 'sokopay'], 'Hufungua wallet', '👛 TZS 120,000', '👛 TZS 120,000'),
        E('sp_token', '🎫', 'PAYMENTS', 'Token / Code', 'Token / Code', 'Code ya uthibitishaji wa mzigo/delivery/pickup — usishiriki bila sababu.', 'Cargo/delivery/pickup verification code — do not share carelessly.', ['transport', 'orders'], 'Huthibitisha makabidhiano', 'SP-8X2K', 'SP-8X2K'),
        E('sp_refund', '↩', 'PAYMENTS', 'Refanya Malipo (Refund)', 'Refund', 'Fedha zinarudishwa kwa mteja baada ya dispute/approached (delivery isiyoenda).', 'Money returned to the buyer after a dispute/undelivered order is resolved.', ['payments', 'orders'], 'Hufungua maelezo', 'Refund in progress', 'Refund in progress'),
        E('sp_cashout', '🏧', 'PAYMENTS', 'Kutoa Fedha (Withdraw)', 'Withdrawal', 'Kutoa salio kutoka wallet kwenda Mobile/Bank (kwa akaunti iliyohifadhiwa).', 'Move wallet balance to your saved mobile/bank account.', ['sokopay'], 'Hufungua withdrawal form', '🏧 Kutoa Fedha', '🏧 Withdraw'),

        /* ---------- TRANSPORT (§8) ---------- */
        E('tr_route', '📍', 'TRANSPORT', 'Njia / Route', 'Route', 'Mkoa/halapeklo cha mzigo au safari (Pickup → Destination).', 'Cargo/trip path (Pickup → Destination).', ['transport', 'discover'], 'Hufungua ramani/details', 'Dodoma → Tabora', 'Dodoma → Tabora'),
        E('tr_tracking', '🗺', 'TRANSPORT', 'Ufuatiliaji', 'Tracking', 'Mstari wa hatua za mzigo (imewasili→safarini→ineliwa).', 'Cargo milestone timeline (accepted→in transit→delivered).', ['transport', 'orders'], 'Hufungua ufuatiliaji', 'Inasubiri Malipo → Imechukuliwa', 'Awaiting Payment → Picked up'),
        E('tr_handover', '🤲', 'TRANSPORT', 'Makabidhiano', 'Handover', 'Msigno mzigo umekabidhiwa kutoka seller→driver→buyer kupitia tokens.', 'Official cargo handover from seller→driver→buyer via tokens.', ['transport'], 'Hufungua ufananisho wa token', 'Makabidhiano ✅', 'Handover ✅'),

        /* ---------- CONTENT / POSTS (§10) ---------- */
        E('ct_saved', '🔖', 'ICONS', 'Imehifadhiwa', 'Saved', 'Kitu umekihifadhi binafsi kwa marejeo.', 'Item you saved privately for later.', ['posts', 'products'], 'Huru hifadhi/toa kwenye saved', '🔖 Saved', '🔖 Saved'),
        E('ct_report', '🚩', 'ICONS', 'Ripoti (FLAG)', 'Report / Flag', 'Ripoti kitu kichunguzwe (SIO hukumu "Fake").', 'Report something for review (NOT an automatic judgement).', ['posts', 'chat'], 'Hutuma ripoti', '🚩 Ripoti tatizo', '🚩 Report a problem'),
        E('ct_like', '❤', 'ICONS', 'Penda', 'Like', 'Kitendo cha engagement: kuonyesha kufurahi; kadi hufanya hesabu ya likes.', 'Engagement: shows appreciation; increments like count.', ['posts', 'products'], 'Hurekodi like yako', '❤ 12', '❤ 12'),
        E('ct_share', '🔗', 'ICONS', 'Gawa (Share)', 'Share', 'Sambaza link ya bidhaa/soga/whatsapp n.k.', 'Share the product/chat via link/WhatsApp etc.', ['products', 'chat'], 'Hufungua share options', '🔗 Gawa', '🔗 Share'),
        E('ct_pinned', '📌', 'CHAT_SOGA', 'Imebandikwa (Pinned)', 'Pinned', 'Soga/aila iliyoungizwa juu ya orodha kwa kuruka haraka.', 'Conversation/thread pinned to top for quick access.', ['chat'], 'Pin/unpin kwenye menu', '📌 Inbox juu', '📌 Inbox top'),
        E('ct_drag', '≡≡', 'POSTS', 'Vuta (Drag)', 'Drag handle', 'Sehemu ya kuvuta/kupanga (slider images, order of items).', 'Handle to drag/reorder (image slider etc.).', ['forms'], 'Vuta kwa shika sehemu hii', '≡≡ panga picha', '≡≡ reorder photos'),

        /* ---------- SECURITY / PRIVACY / A11Y (§9/§16) ---------- */
        E('sec_id', '🪪', 'SECURITY', 'Utambulisho wa Kidiji', 'Digital ID', 'SokoHai ID + QR certificate yako.', 'Your SokoHai ID + QR certificate.', ['profile'], 'Hufungua ID', 'SokoHai ID + QR', 'SokoHai ID + QR'),
        E('sec_shield', '🛡', 'SECURITY', 'Ulinzi / Guard', 'Guarded / SokoHai Guard', 'ENEO linalindwa na SokoHai (mawasiliano/malipo).', 'Area protected by SokoHai (communications/payments).', ['chat', 'payments'], 'Haichagui — ni ishara', 'Mawasiliano yanalindwa', 'Communications protected'),
        E('sec_hidden', '🙈', 'SECURITY', 'Mefichwa', 'Hidden', 'Taarifa hii imefichwa kutoka watu wengine (privacy).', 'This info is hidden from others (privacy).', ['privacy'], 'Haichagui — ni hali', 'Simu imefichwa', 'Phone hidden'),
        E('a11y_screen', '♿', 'ICONS', 'Ufikiaji (Accessibility)', 'Accessibility', 'Mipangilio: kontrasti, somaji-scrini, ukubwa wa maandishi.', 'Settings: contrast, screen-reader, text size.', ['settings'], 'Hufungua mipangilio ya ufikiaji', '♿ Accessibility', '♿ Accessibility'),

        /* ---------- [R21 KAMUSI-FIX: founder §5/§6 fill-outs — code-traced] ---------- */
        /* ACTIONS (vitendo halisi — 34-chat-core / cart / negotiation) */
        E('act_send', '➤', 'ACTIONS', 'Tuma', 'Send', 'Kitufe cha kutuma meseji ndani ya Soga — arrow ya kariaasi (paper-plane) hutuma ujumbe ulioandikwa (na picha/file zilizotiwa).', 'Chat composer send button — paper-plane icon sends the typed message (plus any attached media/files).', ['chat', 'soga'], 'Hutuma meseji', 'Andika "Habari" → ➤', 'Type "Habari" → ➤'),
        E('act_reply', '↩', 'ACTIONS', 'Jibu', 'Reply', 'Reply action katika Soga: meseji yako inakuwa na muktadha (quoted context) wa ujumbe unaojibiwa.', 'Chat reply: your message carries the quoted context of the message it answers.', ['chat', 'soga'], 'Hujibu meseji husika', 'Long-press meseji → Jibu', 'Long-press message → Reply'),
        E('act_edit', '✎', 'ACTIONS', 'Hariri', 'Edit', 'Kubadili meseji yako (chat) au taarifa ya bidhaa (products) — mahali inaruhusiwa.', 'Edits your own chat message or product details where edit is offered.', ['chat', 'products'], 'Hufungua edit mode', 'Meseji yako ✎ Hariri', 'Your message ✎ Edit'),
        E('act_delete', '🗑', 'ACTIONS', 'Futa / Toa', 'Delete', 'Kufuta meseji (chat) au kuondoa kitu kutoka cart/odhaa — hatua hii si status, ni kitendo.', 'Removes a chat message or takes an item out of the cart/list — an action, not a status.', ['chat', 'cart'], 'Hufuta/kuondoa kabisa', 'Cart → 🗑 kitu kinaondoka', 'Cart → 🗑 item removed'),
        /* ICONS (icons zinazoonekana UI — founder §5) */
        E('ic_location', '📍', 'ICONS', 'Eneo (Location)', 'Location', 'Alama ya eneo: inaonyesha mahali pa bidhaa/mtu au sehemu inayojazwa. Tofauti na 📍 ya Usafiri ambayo ni njia/route ya mzunguko.', 'A location pin on cards/fields — unlike the transport pin, which denotes a route/waypoint.', ['maps', 'products', 'profiles'], 'Haichagui — ni taarifa ya mahali', '📍 Dar es Salaam, Ubungo', '📍 Dar es Salaam, Ubungo'),
        E('ic_verified', '✔', 'ICONS', 'Imethibitishwa (verified badge)', 'Verified badge', 'Badge ndogo ya uthibitisho karibu na jina la muuzaji/biashara — ni icikuonseshe kuwa taarifa/akaunti imepitia uhakiki wa mfumo. Tofauti na ✓ (status) na ✓✓ (chat).', 'Small verification badge next to seller/business names — account passed system checks. Different from ✓ status and ✓✓ chat ticks.', ['discover', 'profiles', 'soga'], 'Haichagui — ni hali', 'Asha Mrema ✔', 'Asha Mrema ✔'),
        /* POSTS & CONTENT (yaliyomo) */
        E('ct_comment', '💬', 'POSTS', 'Maoni (Comments)', 'Comments', 'Bubbula ya maoni: kwenye post/bidhaa hufungua sehemu ya maoni — wateja wanandika na kupata majibu moja kwa moja.', 'The comments bubble on posts/products opens the comments thread — buyers write and get replies.', ['posts', 'maoni'], 'Hufungua sehemu ya maoni', 'Post → 💬 12 maoni', 'Post → 💬 12 comments'),
        E('ct_pin', '📌', 'POSTS', 'Kubandika (Pin)', 'Pin', 'Kubandika kuchegocha content/soga juu ya orodha ili ibaki seen rahisi.', 'Pins a conversation/content to the top so it stays visible.', ['soga', 'posts'], 'Hubandika/bando la kwanza', '📌 Soga iliyobandikwa juu', '📌 Pinned conversation'),
        /* STATUS (nyongeza — founder §5: Delivered/Sent/Read chains kwa sent-kwanza) */
        E('st_sent', '✓', 'STATUS', 'Imetumwa (1 check)', 'Sent (single tick)', 'Soga: check moja = meseji imefikia server; bado haijafikia/haikusomwa na mpokezaji.', 'Single tick = the message reached the server; not yet delivered/read by the recipient.', ['soga', 'chat'], 'Haichagui — ni hali', 'Meseji ✓ (si ✓✓)', 'Message ✓ (not ✓✓)'),
        E('st_delivered', '🚚', 'STATUS', 'Imefika', 'Delivered', 'Oda/bidhaa imefika mikononi mwa mnunuzi: tracking na escrow flow inapata hatua hii baada ya usafiri; malipo hutolewa kwa muuzaji.', 'The parcel reached the buyer: tracking/escrow reach this step after transport; escrow releases to the seller.', ['orders', 'escrow', 'tracking'], 'Haichagui — ni hali', 'Status: 🚚 Imefika', 'Status: 🚚 Delivered')
    ];
    window.skhIconDict = DICT;

    /* --------------- VALIDATION (§15) --------------- */
    window.skhIconDictValidate = function () {
        var issues = [];
        var seen = {};
        DICT.forEach(function (e, i) {
            if (!e.id || seen[e.id]) issues.push('dup/missing id @' + i);
            seen[e.id] = true;
            ['symbol', 'nameSw', 'nameEn', 'descSw', 'descEn', 'category', 'action'].forEach(function (f) {
                if (!e[f]) issues.push(e.id + ' missing ' + f);
            });
            if (!Array.isArray(e.contexts) || !e.contexts.length) issues.push(e.id + ' contexts missing');
        });
        return issues;
    };

    /* --------------- SEARCH --------------- */
    window.skhDictSearch = function (q, cat) {
        q = String(q || '').toLowerCase().trim();
        return DICT.filter(function (e) {
            if (cat && e.category !== cat) return false;
            if (!q) return true;
            var hay = [e.symbol, e.nameSw, e.nameEn, e.descSw, e.descEn, (e.contexts || []).join(' '), e.exSw, e.exEn].join(' ').toLowerCase();
            return q.split(/\s+/).every(function (tok) { return hay.includes(tok); });
        });
    };



    /* =============== [R21 KAMUSI PAGE — founder-spec §§1–15] ===============
     * - 🌐 button → main menu (Lugha | Kamusi ya SokoHai) — iko index.html;
     *   page hii inahuduluiwa kweli kama DEDICATED view (si tab ndani ya modal).
     * - registration API: window.skhIconDictRegister(entry) (§9/Test9).
     * - same-definition tooltips: data-dict-tip="entryId" (§10).
     * - deep-link: window.skhKamusiOpenEntry('mention').
     * ===================================================================== */

    var CAT_DEFS = [
        ['ALL',       'Zote',             'All'],
        ['ICONS',     'Icons',            'Icons'],
        ['SYMBOLS',   'Alama',            'Symbols'],
        ['ACTIONS',   'Vitendo',          'Actions'],
        ['ROLES',     'Roles',            'Roles'],
        ['STATUS',    'Hali',             'Status'],
        ['COMMERCE',  'Biashara',         'Commerce'],
        ['CHAT_SOGA', 'Chat & Soga',      'Chat & Soga'],
        ['SECURITY',  'Usalama',          'Security'],
        ['PAYMENTS',  'Malipo',           'Payments'],
        ['TRANSPORT', 'Usafiri',          'Transport'],
        ['POSTS',     'Posts & Yaliyomo', 'Posts & Content'],
        ['NAVIGATION','Urambazaji',       'Navigation']
    ];
    function catDefs()  { return CAT_DEFS; }
    window.skhDictCategories = catDefs;
    function catName(id) { var c = CAT_DEFS.find(function (x) { return x[0] === id; }); return c ? T2(c[1], c[2]) : id; }

    var PAGE = { cat: 'ALL' };

    function entryHtml(e) {
        return '<div class="skh-k-entry" data-cat="' + esc(e.category) + '">'
            + '<div class="skh-k-sym">' + esc(e.symbol) + '</div>'
            + '<div class="skh-k-body">'
            + '<b class="skh-k-name">' + esc(T2(e.nameSw, e.nameEn)) + '</b>'
            + '<small class="skh-k-desc">' + esc(T2(e.descSw, e.descEn)) + '</small>'
            + '<small class="skh-k-meta"><span class="skh-k-cat">' + esc(catName(e.category)) + '</span> · '
            + tk('d_where', 'Inatumika:') + ' ' + esc(e.contexts.join(', ')) + ' · '
            + tk('d_does', 'Kitendo:') + ' ' + esc(e.action) + '</small>'
            + (e.exSw || e.exEn ? '<small class="skh-k-ex">' + tk('d_example', 'Mf:') + ' ' + esc(T2(e.exSw, e.exEn)) + '</small>' : '')
            + '</div></div>';
    }

    function pageRender() {
        var q = (document.getElementById('skhKQ') || { value: '' }).value;
        var list = window.skhDictSearch(q, PAGE.cat === 'ALL' ? '' : PAGE.cat);
        var host = document.getElementById('skhKResults');
        if (!host) return;
        host.innerHTML = list.length
            ? ' <p class="skh-k-count">' + list.length + ' ' + tk('d_results', 'alama') + (q ? ' · “' + esc(q) + '”' : '') + '</p>' + list.map(entryHtml).join('')
            : '<div class="skh-k-empty"><b>' + tk('d_none', 'Hakuna alama hiyo') + '</b><small>' + tk('d_none_hint', 'Jaribu neno jingine (mf: "mention", "bei", "muuzaji", "warning")') + '</small></div>';
    }

    function catChipsHtml() {
        return CAT_DEFS.map(function (c) {
            var on = PAGE.cat === c[0];
            return '<button type="button" class="skh-k-chip' + (on ? ' on' : '') + '" data-kcat="' + c[0] + '">' + esc(T2(c[1], c[2])) + '</button>';
        }).join('');
    }

    function buildPage() {
        var m = document.getElementById('skhKamusiPage');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'skhKamusiPage';
        m.className = 'skh-discover-overlay';
        m.innerHTML = '<div class="skh-discover-sheet skh-k-sheet">'
            + '<div class="skh-discover-head">'
            + '<button type="button" class="skh-discover-back" data-act="k-close" aria-label="' + tk('back', 'Rudi') + '">' + (window.skhNavIcon ? window.skhNavIcon('back', 18) : '‹') + '</button>'
            + '<div style="flex:1;min-width:0;"><b class="skh-discover-title">' + tk('kamus_title', 'Kamusi ya SokoHai') + '</b><br>'
            + '<small class="skh-discover-sub">' + tk('kamus_sub', 'Icons, alama, badges & maana zake — single source of truth') + '</small></div>'
            + '</div>'
            + '<div class="skh-discover-search">'
            + '<span class="skh-discover-svg">' + (window.skhNavIcon ? window.skhNavIcon('search', 15) : '⌕') + '</span>'
            + '<input id="skhKQ" type="text" autocomplete="off" placeholder="' + tk('kamus_ph', 'Tafuta alama, icon au neno...') + '">'
            + '</div>'
            + '<div id="skhKCats" class="skh-discover-tabs skh-k-tabs">' + catChipsHtml() + '</div>'
            + '<div id="skhKResults" class="skh-discover-results skh-k-results"></div>'
            + '</div>';
        document.body.appendChild(m);
        m.querySelector('#skhKQ').addEventListener('input', function () {
            clearTimeout(window.__skhKQT);
            window.__skhKQT = setTimeout(pageRender, 180);
        });
        m.querySelector('#skhKCats').addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-kcat]') : null;
            if (!b) return;
            PAGE.cat = b.getAttribute('data-kcat');
            m.querySelector('#skhKCats').innerHTML = catChipsHtml();
            pageRender();
        });
        return m;
    }

    window.skhOpenKamusi = function (query, cat) {
        var m = buildPage();
        PAGE.cat = (cat && CAT_DEFS.find(function (c) { return c[0] === cat; })) ? cat : 'ALL';
        m.querySelector('#skhKCats').innerHTML = catChipsHtml();
        var inp = m.querySelector('#skhKQ');
        if (query != null) inp.value = String(query);
        m.classList.add('open');
        pageRender();
    };
    window.skhCloseKamusi = function () {
        var m = document.getElementById('skhKamusiPage');
        if (m) m.classList.remove('open');
    };
    // §10: deep-link (mfano: tooltip/help actions) — same centralized definition.
    window.skhKamusiOpenEntry = function (idOrQ) {
        window.skhOpenKamusi(String(idOrQ || ''));
    };

    /* ---------------- REGISTRATION API (§9 — future icons zingee HUDHIASHA) ---------------- */
    window.skhIconDictRegister = function (entry) {
        entry = entry || {};
        var rec = {
            id: String(entry.id || '').trim(),
            symbol: String(entry.symbol || ''),
            category: String(entry.category || 'ICONS').toUpperCase(),
            nameSw: String(entry.nameSw || entry.sw || ''),
            nameEn: String(entry.nameEn || entry.en || ''),
            descSw: String(entry.descSw || ''),
            descEn: String(entry.descEn || ''),
            contexts: Array.isArray(entry.contexts) ? entry.contexts : (entry.contexts ? [entry.contexts] : []),
            action: String(entry.action || ''),
            exSw: String(entry.exSw || ''), exEn: String(entry.exEn || '')
        };
        var issues = [];
        if (!rec.id) issues.push('id missing');
        if (DICT.find(function (x) { return x.id === rec.id; })) { DICT = DICT; issues.push('id exists: ' + rec.id); }
        if (!rec.symbol) issues.push('symbol missing');
        if (!CAT_DEFS.find(function (c) { return c[0] === rec.category && rec.category !== 'ALL'; })) issues.push('unknown category: ' + rec.category);
        if (!rec.nameSw || !rec.nameEn) issues.push('needs sw+en names');
        if (!rec.contexts.length) issues.push('contexts empty');
        if (issues.length) return { ok: false, issues: issues };
        DICT.push(rec);
        try { if (document.getElementById('skhKamusiPage')) pageRender(); } catch (eR) {}
        return { ok: true, n: DICT.length };
    };

    /* ---------------- SAME-DEFINITION TOOLTIPS (§10) ---------------- */
    window.skhDictTooltip = function (idOrSym) {
        var e = DICT.find(function (x) { return x.id === idOrSym || x.symbol === idOrSym; });
        return e ? T2(e.descSw, e.descEn) : String(idOrSym || '');
    };
    function applyDictTips(root) {
        try {
            (root || document).querySelectorAll('[data-dict-tip]').forEach(function (el) {
                el.setAttribute('title', window.skhDictTooltip(el.getAttribute('data-dict-tip')));
            });
        } catch (e) {}
    }
    document.addEventListener('DOMContentLoaded', function () { applyDictTips(document); });

    /* ---------------- LANGUAGE MENU glue (menu iko index.html) ---------------- */
    document.addEventListener('click', function (ev) {
        try {
            var b = ev.target && ev.target.closest ? ev.target.closest('[id], [data-act]') : null;
            if (!b) return;
            if (b.id === 'langMenuLugha') {
                document.getElementById('langMenuMain').style.display = 'none';
                document.getElementById('langMenuLughaView').style.display = 'block';
                return;
            }
            if (b.id === 'langMenuBack') {
                document.getElementById('langMenuLughaView').style.display = 'none';
                document.getElementById('langMenuMain').style.display = 'block';
                return;
            }
            if (b.id === 'langMenuKamusi') {
                var dd = document.getElementById('langDropdown');
                if (dd) dd.style.display = 'none';
                window.skhOpenKamusi();
                return;
            }
            if (b.getAttribute && b.getAttribute('data-act') === 'k-close') { window.skhCloseKamusi(); return; }
            // dropdown ikifunguliwa → reset kwa menu kuu
        } catch (e) {}
    }, true);
    // reset menu view kila dropdown inapofunguka
    (function () {
        var dd = document.getElementById('langDropdown');
        if (!dd || typeof MutationObserver === 'undefined')
            { var s2 = window.setInterval(function () { }, 0); return; }
        var mo = new MutationObserver(function () {
            if (dd.style.display !== 'none') {
                var mv = document.getElementById('langMenuLughaView');
                var mm = document.getElementById('langMenuMain');
                if (mv && mm) { mv.style.display = 'none'; mm.style.display = 'block'; }
            }
        });
        mo.observe(dd, { attributes: true, attributeFilter: ['style'] });
    })();

    // Lugha ikibadilika → Kamusi page re-render kwa translations zinazopo (§8/Test 8)
    document.addEventListener('sokohai:languageChanged', function () {
        try {
            var m = document.getElementById('skhKamusiPage');
            if (m && m.classList.contains('open')) { m.querySelector('#skhKCats').innerHTML = catChipsHtml(); pageRender(); }
        } catch (e) {}
    });

    document.addEventListener('DOMContentLoaded', buildPage);
    if (document.readyState !== 'loading') buildPage();
})();

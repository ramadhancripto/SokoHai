/* ==== js/app/38-nego-form-logic.js ====
   SOKOHAI — DYNAMIC NEGOTIATION FORM · LOGIC TUPU (Module 01)
   ----------------------------------------------------------------
   Hapa hakuna DOM wala Firebase — ni CONFIG inayoendeshwa na
   commerceType (product | service | transport), kanuni za fomu,
   uhakiki (validation), hesabu za jumla, na muundo wa PROPOSAL
   unaotayarishwa kwa ajili ya Ofa ya kwanza (OFFER_SENT).

   Faili hili huagizwa (import) na 38-negotiation-form.js (DOM)
   na pia hupimwa moja kwa moja na tools/test_nego_form.mjs.

   KANUNI ZA BIASHARA:
   - Bei ya sokoni (catalogPrice) HAIbadilishwi kamwe.
   - Jumla (total) huhesabiwa kila mara — haiandikwi na mkono.
   - Fomu haitengenezi oda/malipo/usafirishaji — inaandaa proposal tu.
   ================================================================ */
'use strict';

export const NF_TYPES = { PRODUCT: 'product', SERVICE: 'service', TRANSPORT: 'transport' };
export const NF_CURRENCY = 'TZS';
export const NF_INITIAL_STATE = 'OFFER_SENT';

export const NF_META = {
    product: { icon: 'package', label: 'Bidhaa', title: 'Jadili Bei ya Bidhaa', cta: 'Tuma Ofa ya Bidhaa' },
    service: { icon: 'wrench', label: 'Huduma', title: 'Jadili Ofa ya Huduma', cta: 'Tuma Ofa ya Huduma' },
    transport: { icon: 'truck', label: 'Usafiri', title: 'Jadili Nauli ya Usafiri', cta: 'Tuma Ofa ya Usafiri' }
};

/* ================================================================
 * 1) MISAADA TUPU (pure helpers)
 * ================================================================ */
export function nfTodayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

export function nfAddDaysISO(dateISO, days) {
    const base = new Date(dateISO + 'T00:00:00');
    if (isNaN(base.getTime())) return '';
    base.setDate(base.getDate() + Number(days || 0));
    return base.toISOString().slice(0, 10);
}

export function nfIsValidDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d.getTime());
}

// Tarehe haipurwi nyuma ya leo (kulinganisha tarehe tu, si saa).
export function nfDateNotPast(s) {
    if (!nfIsValidDate(s)) return false;
    return s >= nfTodayISO();
}

export function nfDateGte(a, b) {
    if (!nfIsValidDate(a) || !nfIsValidDate(b)) return false;
    return a >= b;
}

export function nfFmtMoney(n) {
    const v = Math.round(Number(n || 0));
    return 'TSh ' + v.toLocaleString('en-US');
}

export function nfToInt(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return n;
}

const DEADLINE_UNITS = [
    { key: 'siku', label: 'Siku', days: 1 },
    { key: 'wiki', label: 'Wiki', days: 7 },
    { key: 'miezi', label: 'Miezi', days: 30 }
];

const PACKAGE_UNITS = ['pcs', 'mfuko', 'mifuko', 'sanduku', 'katoni', 'gunia', 'chupa', 'kreti', 'kg', 'L'];

const VARIANT_SIZE = ['S', 'M', 'L', 'XL', 'XXL'];
const VARIANT_COLOR = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Brown', 'Beige'];
const VARIANT_CONDITION = ['Novo (mpya kabisa)', 'Mpya', 'Iliyotumika kwa makini', 'Mtumba'];

function catHas(cat, words) {
    const c = String(cat || '').toLowerCase();
    return words.some(function (w) { return c.indexOf(w) !== -1; });
}

/* Chaguo/vipimo vinavyoafikia bidhaa HALISI (havionyeshwi visivyohusika).
 * Kipaumbele: taarifa zilizotangazwa na muuzaji (entity.variants),
 * kisha mkisasa wa kategoria (kama kichagua cha product detail). */
export function resolveVariantFields(entity) {
    entity = entity || {};
    const ev = entity.variants || entity.variantOptions || {};
    const cat = entity.category || entity.subCategory || '';
    const out = [];

    const sizes = ev.sizes || ev.sizeOptions || (catHas(cat, ['mavazi', 'fashion', 'fashoni', 'shoe', 'viatu']) ? VARIANT_SIZE : null);
    if (sizes && sizes.length) out.push({ key: 'size', kind: 'chips', label: 'Saizi (Size)', options: sizes, optional: true });

    const colors = ev.colors || ev.colorOptions || (catHas(cat, ['mavazi', 'fashion', 'fashoni']) ? VARIANT_COLOR : null);
    if (colors && colors.length) out.push({ key: 'color', kind: 'chips', label: 'Rangi (Color)', options: colors, optional: true });

    const models = ev.models || ev.modelOptions || (catHas(cat, ['electronic', 'teknoloji', 'tech', 'magari', 'vyombo', 'sauti', 'muziki', 'simu']) ? [''] : null);
    if (models) out.push({ key: 'model', kind: 'text', label: 'Modeli / Toleo', placeholder: 'Mfano: Samsung A55, 2024', maxLength: 60, optional: true });

    if (ev.conditions || catHas(cat, ['mavazi', 'fashion', 'electronic', 'teknoloji', 'vitu vya kale', 'antiques', 'magari'])) {
        out.push({ key: 'condition', kind: 'chips', label: 'Hali (Condition)', options: (ev.conditions || VARIANT_CONDITION), optional: true });
    }

    // Vipimo vya uzito/ufungashio — vinafaa kwa bidhaa za kilimo, vyakula,
    // ujenzi na jumla (vinavyouzwa kwa kg/gunia/katoni).
    if (ev.weight || catHas(cat, ['kilimo', 'mifugo', 'vyakula', 'ujenzi', 'hardware', 'jumla', 'wholesale', 'vifungashio', 'samani'])) {
        out.push({ key: 'weight', kind: 'text', label: 'Vipimo / Uzito unaotaka', placeholder: 'Mfano: 25 kg, gunia 1', maxLength: 60, optional: true });
    }
    if (ev.package || entity.sellsBulk || entity.wholesalePrice || catHas(cat, ['jumla', 'wholesale', 'vifungashio'])) {
        out.push({ key: 'package', kind: 'text', label: 'Ufungashao / Kifurushi', placeholder: 'Mfano: Katoni, mifuko mipya', maxLength: 60, optional: true });
    }
    return out;
}

/* ================================================================
 * 2) CONFIG YA SEHEMU ZA FOMU KWA KILA AINA YA BIASHARA
 *    Injini MOJA ya fomu — config tofauti kwa kila commerceType.
 * ================================================================ */
export function sectionsFor(type, entity) {
    entity = entity || {};
    if (type === NF_TYPES.SERVICE) {
        const serviceSections = [
            {
                id: 'serviceScope', title: 'Huduma na Masharti',
                fields: [
                    { key: 'scope', kind: 'textarea', rows: 2, label: 'Maelezo ya huduma unayotaka *', placeholder: 'Mfano: Kushona suti mbili rasmi', required: true, maxLength: 240, minLength: 3 },
                    { key: 'quantity', kind: 'number', label: 'Idadi / Vitengo *', placeholder: '1', required: true, min: 1, step: 1, default: 1, inputMode: 'numeric' }
                ]
            },
            {
                id: 'servicePricing', title: 'Bei',
                fields: [
                    { key: 'unitPrice', kind: 'money', label: 'Bei unayopendekeza (TSh) *', placeholder: '65,000', required: true, min: 1, step: 100, inputMode: 'numeric' },
                    { key: 'total', kind: 'total', label: 'Jumla ya makadirio' }
                ]
            }
        ];
        // Ratiba/mahali si delivery fields za lazima. Huonekana tu ikiwa model ya
        // huduma yenyewe imetangaza wazi kuwa booking/schedule ni sehemu ya terms.
        if (entity.negotiationScheduleRequired === true || entity.bookingRequired === true) {
            serviceSections.push({
                id: 'serviceSchedule', title: 'Ratiba ya Huduma',
                fields: [
                    { key: 'deadlineQty', kind: 'number', label: 'Muda wa kukamilisha *', placeholder: '2', required: true, min: 1, step: 1, default: 2, inputMode: 'numeric', pairedWith: 'deadlineUnit' },
                    { key: 'deadlineUnit', kind: 'select', label: 'Kipimo cha muda *', required: true, options: DEADLINE_UNITS.map(function (u) { return { value: u.key, label: u.label }; }), default: 'siku' },
                    { key: 'location', kind: 'text', label: 'Mahali pa huduma *', placeholder: 'Mfano: Tabora', required: true, maxLength: 120, minLength: 2 }
                ]
            });
        }
        serviceSections.push({
            id: 'serviceRequirements', title: 'Ujumbe / Maelezo',
            fields: [
                { key: 'requirements', kind: 'textarea', rows: 2, label: 'Masharti au mahitaji (hiari)', placeholder: 'Mfano: Mteja atatoa vitambaa.', maxLength: 400, optional: true },
                { key: 'notes', kind: 'textarea', rows: 3, label: 'Ujumbe wa ofa (hiari)', placeholder: 'Ongeza maelezo ya ofa yako.', maxLength: 500, optional: true }
            ]
        });
        return serviceSections;
    }

    if (type === NF_TYPES.TRANSPORT) {
        return [
            {
                id: 'transportRoute', title: 'Njia',
                fields: [
                    { key: 'from', kind: 'text', label: 'Anapochukuliwa (Pickup) *', placeholder: 'Mfano: Tabora', required: true, maxLength: 120, minLength: 2, prefillFrom: 'route.from' },
                    { key: 'to', kind: 'text', label: 'Anakopelekwa (Destination) *', placeholder: 'Mfano: Pangale', required: true, maxLength: 120, minLength: 2, prefillFrom: 'route.to' }
                ]
            },
            {
                id: 'transportCargo', title: 'Mzigo',
                fields: [
                    { key: 'packageDescription', kind: 'textarea', rows: 2, label: 'Mzigo / Kifurushi *', placeholder: 'Mfano: Mifuko ya mchele', required: true, maxLength: 240, minLength: 2 },
                    { key: 'packageCount', kind: 'number', label: 'Idadi ya vifurushi *', placeholder: '5', required: true, min: 1, step: 1, default: 1, inputMode: 'numeric', pairedWith: 'packageUnit' },
                    { key: 'packageUnit', kind: 'select', label: 'Kipimo cha vifurushi', options: PACKAGE_UNITS.map(function (u) { return { value: u, label: u }; }), default: 'mfuko' },
                    { key: 'weight', kind: 'number', label: 'Uzito wa makadirio (kg) — hiari', placeholder: '250', required: false, min: 0, step: 1, inputMode: 'numeric', optional: true },
                    { key: 'vehicleType', kind: 'select', label: 'Chombo unachopendelea (hiari)', optional: true, options: [{ value: '', label: '— Chochote kilichofaa —' }, { value: 'Boda', label: 'Boda' }, { value: 'Bajaji', label: 'Bajaji' }, { value: 'Gari', label: 'Gari' }, { value: 'Pickup', label: 'Pickup' }, { value: 'Daladala', label: 'Daladala' }, { value: 'Lori', label: 'Lori/Fuso' }] }
                ]
            },
            {
                id: 'transportDates', title: 'Muda wa Safari',
                fields: [
                    { key: 'pickupDate', kind: 'date', label: 'Siku ya kuchukua (Pickup) *', required: true, minDate: 'today' },
                    { key: 'deliveryDeadline', kind: 'date', label: 'Mwisho wa kuwasilisha *', required: true, minDate: 'pickupDate' }
                ]
            },
            {
                id: 'transportFee', title: 'Nauli',
                fields: [
                    { key: 'fee', kind: 'money', label: 'Nauli unayopendekeza (TSh) *', placeholder: '25,000', required: true, min: 1, step: 100, inputMode: 'numeric' },
                    { key: 'total', kind: 'total', label: 'Nauli ya jumla' }
                ]
            },
            {
                id: 'transportRequirements', title: 'Mahitaji Maalum',
                fields: [
                    { key: 'specialRequirements', kind: 'textarea', rows: 2, label: 'Maagizo ya usafirishaji (hiari)', placeholder: 'Mfano: Shughulikia mifuko kwa makini.', maxLength: 400, optional: true },
                    { key: 'notes', kind: 'textarea', rows: 2, label: 'Maelezo ya ziada (hiari)', maxLength: 500, optional: true }
                ]
            }
        ];
    }

    // PRODUCT (chaguo-msingi)
    const variantFields = resolveVariantFields(entity);
    const sections = [
        {
            id: 'productPricing', title: 'Idadi na Bei',
            fields: [
                { key: 'quantity', kind: 'number', label: 'Idadi (Quantity) *', placeholder: '2', required: true, min: entity.minQty || 1, step: 1, default: 1, inputMode: 'numeric', max: (entity.stockQuantity > 0 && entity.saleMode !== 'auction') ? entity.stockQuantity : null, locked: entity.saleMode === 'auction' ? 1 : 0 },
                { key: 'unitPrice', kind: 'money', label: 'Bei unayopendekeza kwa kipande (TSh) *', placeholder: '68,000', required: true, min: 1, step: 100, inputMode: 'numeric' },
                { key: 'total', kind: 'total', label: 'Jumla (huhesabiwa kiotomatiki)' }
            ]
        }
    ];
    if (variantFields.length) {
        sections.push({ id: 'productVariants', title: 'Chaguzi / Vipimo (kama vinahusika)', optional: true, fields: variantFields });
    }
    sections.push({
        id: 'productNotes', title: 'Ujumbe / Maelezo',
        fields: [
            { key: 'notes', kind: 'textarea', rows: 3, label: 'Ujumbe wa ofa (hiari)', placeholder: 'Ongeza masharti au maelezo ya ofa yako.', maxLength: 500, optional: true }
        ]
    });
    return sections;
}

/* Thamani za mwanzo za fomu (pamoja na bei ya sokoni kama pendekezo la kwanza). */
export function defaultValues(type, entity) {
    entity = entity || {};
    const v = {};
    sectionsFor(type, entity).forEach(function (sec) {
        sec.fields.forEach(function (f) {
            if (f.kind === 'chips') { v[f.key] = ''; return; }
            if (f.kind === 'total') { return; }
            if (f.prefillFrom) {
                const parts = f.prefillFrom.split('.');
                let cur = entity;
                parts.forEach(function (p) { cur = cur == null ? null : cur[p]; });
                v[f.key] = cur != null ? String(cur) : '';
                return;
            }
            if (f.default != null) v[f.key] = f.default;
            else v[f.key] = '';
        });
    });
    // Pendekezo la kwanza = bei ya sokoni (mnunuzi anaweza kuibadilisha).
    if (type === NF_TYPES.PRODUCT) {
        v.unitPrice = entity.price != null ? Math.round(Number(entity.price)) : '';
        if (entity && entity.selectedVariants) {
            v.size = entity.selectedVariants.size && entity.selectedVariants.size !== 'N/A' ? entity.selectedVariants.size : '';
            v.color = entity.selectedVariants.color && entity.selectedVariants.color !== 'N/A' ? entity.selectedVariants.color : '';
        }
        v.variants = {};
    }
    if (type === NF_TYPES.SERVICE && v.unitPrice === '') {
        v.unitPrice = entity.price != null ? Math.round(Number(entity.price)) : '';
    }
    if (type === NF_TYPES.TRANSPORT) {
        v.fee = entity.fare != null ? Math.round(Number(entity.fare)) : (entity.price != null ? Math.round(Number(entity.price)) : '');
        if (entity.vehicleType) v.vehicleType = entity.vehicleType;
        // Njia inaweza kutoka route object, ride_request (fromLocation), au
        // tangazo la dereva (pickupRegion/destinationRegion).
        var entRoute = entity.route || {};
        if (!v.from) v.from = entRoute.from || entity.fromLocation || entity.pickupRegion || entity.fromRegion || '';
        if (!v.to) v.to = entRoute.to || entity.toLocation || entity.destinationRegion || entity.toRegion || '';
        if (!v.packageDescription && entity.packageDescription) v.packageDescription = entity.packageDescription;
    }
    return v;
}

/* ================================================================
 * 3) HESABU ZA JUMLA — kamwe hazipokwi na maandishi ya mtumiaji.
 * ================================================================ */
export function computeTotals(type, values) {
    values = values || {};
    let quantity = 1, unitPrice = null, total = null;
    if (type === NF_TYPES.TRANSPORT) {
        quantity = 1;
        unitPrice = nfToInt(values.fee);
        total = (unitPrice != null && unitPrice > 0) ? unitPrice : null;
    } else {
        quantity = nfToInt(values.quantity);
        if (quantity == null) quantity = (type === NF_TYPES.SERVICE ? 1 : 1);
        unitPrice = nfToInt(values.unitPrice);
        total = (unitPrice != null && quantity != null && unitPrice > 0 && quantity > 0) ? unitPrice * quantity : null;
    }
    return { quantity: quantity, unitPrice: unitPrice, total: total };
}

export function deadlineText(values) {
    const q = nfToInt(values.deadlineQty);
    const unit = values.deadlineUnit || 'siku';
    if (!q || q < 1) return { text: '', date: '' };
    const meta = DEADLINE_UNITS.filter(function (u) { return u.key === unit; })[0] || DEADLINE_UNITS[0];
    return {
        text: meta.label.toLowerCase() + ' ' + q,
        date: nfAddDaysISO(nfTodayISO(), q * meta.days)
    };
}

/* ================================================================
 * 4) UHAKIKI (VALIDATION) — makosa ya kirafiki, kwa lugha ya mtumiaji.
 *    Hurejesha { valid, errors:{fieldKey: msg}, totals }
 * ================================================================ */
function setErr(errors, key, msg) { if (msg) errors[key] = msg; }

export function validateForm(type, values, entity) {
    values = values || {};
    entity = entity || {};
    const errors = {};
    const totals = computeTotals(type, values);

    const requirePositiveMoney = function (key, label) {
        const n = nfToInt(values[key]);
        if (n == null || values[key] === '') { setErr(errors, key, 'Tafadhali weka ' + label + '.'); return; }
        if (!isFinite(n) || n <= 0) setErr(errors, key, label + ' haiwezi kuwa sifuri au hasi.');
    };

    if (type === NF_TYPES.PRODUCT) {
        const qty = nfToInt(values.quantity);
        if (values.quantity === '' || qty == null) setErr(errors, 'quantity', 'Tafadhali weka idadi.');
        else if (!Number.isInteger(qty) || qty < (entity.minQty || 1)) setErr(errors, 'quantity', 'Idadi inapaswa kuwa nambari kamili isiyopungua ' + (entity.minQty || 1) + '.');
        else if (entity.stockQuantity > 0 && qty > entity.stockQuantity && entity.saleMode !== 'auction')
            setErr(errors, 'quantity', 'Kiasi kinachopatikana ni ' + entity.stockQuantity + '. Tafadhali punguza idadi.');
        requirePositiveMoney('unitPrice', 'bei unayopendekeza');
        if (values.notes && String(values.notes).length > 500) setErr(errors, 'notes', 'Maelezo yazidi urefu (herufi 500).');
    }

    if (type === NF_TYPES.SERVICE) {
        const scope = String(values.scope || '').trim();
        if (!scope) setErr(errors, 'scope', 'Eleza kazi unayotaka (scope).');
        else if (scope.length < 3) setErr(errors, 'scope', 'Scope inahitaji maelezo zaidi.');
        const qty = nfToInt(values.quantity);
        if (qty == null || !Number.isInteger(qty) || qty < 1) setErr(errors, 'quantity', 'Idadi inapaswa kuwa nambari kamili ya 1 au zaidi.');
        requirePositiveMoney('unitPrice', 'bei unayopendekeza');
        if (entity.negotiationScheduleRequired === true || entity.bookingRequired === true) {
            const dq = nfToInt(values.deadlineQty);
            if (dq == null || !Number.isInteger(dq) || dq < 1) setErr(errors, 'deadlineQty', 'Weka muda halali wa kukamilisha.');
            if (!values.deadlineUnit) setErr(errors, 'deadlineUnit', 'Chagua kizio cha muda.');
            const loc = String(values.location || '').trim();
            if (!loc) setErr(errors, 'location', 'Tafadhali weka mahali pa huduma.');
            else if (loc.length < 2) setErr(errors, 'location', 'Andika mahali sahihi.');
        }
        if (values.requirements && String(values.requirements).length > 400) setErr(errors, 'requirements', 'Mahitaji yazidi urefu (herufi 400).');
        if (values.notes && String(values.notes).length > 500) setErr(errors, 'notes', 'Maelezo yazidi urefu (herufi 500).');
    }

    if (type === NF_TYPES.TRANSPORT) {
        const from = String(values.from || '').trim();
        const to = String(values.to || '').trim();
        if (!from) setErr(errors, 'from', 'Sehemu ya kuchukuliwa inahitajika.');
        else if (from.length < 2) setErr(errors, 'from', 'Andika mahali sahihi vya kutosha.');
        if (!to) setErr(errors, 'to', 'Sehemu ya kwenda inahitajika.');
        else if (to.length < 2) setErr(errors, 'to', 'Andika mahali sahihi vya kutosha.');
        if (from && to && from.toLowerCase() === to.toLowerCase()) setErr(errors, 'to', 'Mahali pa kuchukuliwa na pa kwenda haviwezi kuwa sawa.');

        const cargo = String(values.packageDescription || '').trim();
        if (!cargo) setErr(errors, 'packageDescription', 'Eleza mzigo/kifurushi.');
        const pc = nfToInt(values.packageCount);
        if (pc == null || !Number.isInteger(pc) || pc < 1) setErr(errors, 'packageCount', 'Idadi ya vifurushi inapaswa kuwa 1 au zaidi.');
        if (values.weight !== '' && values.weight != null) {
            const w = nfToInt(values.weight);
            if (w == null || w < 0) setErr(errors, 'weight', 'Uzito uwe nambari isiyo hasi (kg).');
        }
        if (!values.pickupDate) setErr(errors, 'pickupDate', 'Chagua siku ya kuchukua.');
        else if (!nfDateNotPast(values.pickupDate)) setErr(errors, 'pickupDate', 'Siku ya kuchua isiwe nyuma ya leo.');
        if (!values.deliveryDeadline) setErr(errors, 'deliveryDeadline', 'Chagua tarehe ya mwisho ya kuwasilisha.');
        else if (!nfIsValidDate(values.deliveryDeadline)) setErr(errors, 'deliveryDeadline', 'Tarehe si sahihi.');
        else if (values.pickupDate && !nfDateGte(values.deliveryDeadline, values.pickupDate))
            setErr(errors, 'deliveryDeadline', 'Uwasilishaji hauwezi kuwa kabla ya siku ya kuchukua.');
        requirePositiveMoney('fee', 'nauli unayopendekeza');
        if (values.specialRequirements && String(values.specialRequirements).length > 400) setErr(errors, 'specialRequirements', 'Maagizo yazidi urefu (herufi 400).');
        if (values.notes && String(values.notes).length > 500) setErr(errors, 'notes', 'Maelezo yazidi urefu (herufi 500).');
    }

    return { valid: Object.keys(errors).length === 0, errors: errors, totals: totals };
}

/* ================================================================
 * 5) MUUNDO WA PROPOSAL (data structure foundation — spec §12/§14)
 *    Hii NI TAYARI — bado si oda, malipo wala usafirishaji.
 *    Huhifadhi IDs zote halisi + bei ya sokoni isiyoguswa.
 * ================================================================ */
export function buildProposal(type, entity, values, ctx) {
    entity = entity || {};
    values = values || {};
    ctx = ctx || {};
    const now = new Date().toISOString();
    const v = validateForm(type, values, entity);
    const totals = v.totals;
    const catalogPrice = entity.price != null ? Number(entity.price) : null;

    const id = entity.id || '';
    const coll = entity.collection || entity.collectionName
        || (type === NF_TYPES.SERVICE ? 'services' : (type === NF_TYPES.TRANSPORT ? 'ride_requests' : 'products'));
    const title = entity.title || entity.itemTitle || NF_META[type].label;
    const image = entity.image || '';

    // Jina la upande wa pili (muuzaji / mtoa huduma / msafirishaji).
    // Kumbuka: matangazo ya madereva (`drivers`) humilikiwa na `userId`.
    const sellerId = ctx.sellerId || entity.sellerId || entity.providerId || entity.driverId || entity.userId || '';
    const sellerName = ctx.sellerName || entity.sellerName || entity.providerName || entity.driverName || entity.ownerName || entity.company || '';

    const p = {
        // Msingi
        negotiationId: null,
        conversationId: ctx.conversationId || null,
        commerceType: type,
        currency: NF_CURRENCY,
        // Rejeo la bidhaa/huduma/usafiri (jina la kikoa + la urithi kwa injini)
        productId: id,
        productCollection: coll,
        productTitle: title,
        productImage: image,
        // Washiriki
        buyerId: ctx.buyerId || null,
        buyerName: ctx.buyerName || '',
        sellerId: sellerId,
        sellerName: sellerName,
        // Masharti ya kibiashara
        quantity: totals.quantity,
        unitPrice: totals.unitPrice,
        total: totals.total,
        catalogPrice: catalogPrice,
        originalUnitPrice: catalogPrice,
        // Maisha ya negotiation (foundation ya mzunguko wa baadaye)
        currentState: NF_INITIAL_STATE,
        status: NF_INITIAL_STATE,
        proposalVersion: 1,
        version: 1,
        notes: String(values.notes || '').trim(),
        // Type-specific fields huongezwa kwa branch yake tu; hakuna object ya
        // Product yenye delivery/Service/Transport keys tupu.
        createdAt: now,
        updatedAt: now
    };

    if (type === NF_TYPES.PRODUCT) {
        const variants = {};
        ['size', 'color', 'model', 'condition', 'weight', 'package'].forEach(function (k) {
            const val = String(values[k] != null ? values[k] : '').trim();
            if (val) variants[k] = val;
        });
        p.variants = Object.keys(variants).length ? variants : null;
        p.requirements = p.notes || null;
    }

    if (type === NF_TYPES.SERVICE) {
        p.serviceId = id;
        p.serviceCollection = coll;
        p.serviceTitle = title;
        p.serviceImage = image;
        p.scope = String(values.scope || '').trim();
        p.scopeUnit = null;
        p.quantity = totals.quantity;
        if (entity.negotiationScheduleRequired === true || entity.bookingRequired === true) {
            const dl = deadlineText(values);
            p.deadline = dl.text;
            p.deadlineDate = dl.date;
            p.location = String(values.location || '').trim();
        }
        p.requirements = String(values.requirements || '').trim() || null;
    }

    if (type === NF_TYPES.TRANSPORT) {
        p.transportId = id;
        p.transportCollection = coll;
        p.transportTitle = title;
        p.transportImage = image;
        p.route = { from: String(values.from || '').trim(), to: String(values.to || '').trim() };
        p.packageDescription = String(values.packageDescription || '').trim();
        p.packageQuantity = (nfToInt(values.packageCount) || 1) + ' ' + (values.packageUnit || 'pcs');
        const w = nfToInt(values.weight);
        p.weight = (w != null && w >= 0) ? w : null;
        p.pickupDate = values.pickupDate || null;
        p.deliveryDeadline = values.deliveryDeadline || null;
        p.vehicleType = values.vehicleType ? String(values.vehicleType) : null;
        p.specialRequirements = String(values.specialRequirements || '').trim() || null;
        // Nauli ni ya safari nzima (si idadi × vifurushi).
        p.quantity = 1;
        p.total = totals.total;
    }

    return p;
}

/* ================================================================
 * 6) MUHTASARI WA MOJA KWA MOJA (live summary — spec §9)
 *    Hurejesha mistari [ {icon,label,value,bold?} ] inayofuata aina.
 * ================================================================ */
export function summaryLines(type, p) {
    p = p || {};
    const lines = [];
    const money = function (n) { return (n != null && n > 0) ? nfFmtMoney(n) : '—'; };

    if (type === NF_TYPES.PRODUCT) {
        lines.push({ icon: 'hash', label: 'Idadi', value: String(p.quantity != null ? p.quantity : '—') });
        lines.push({ icon: 'wallet', label: 'Bei ya kipande', value: money(p.unitPrice) });
        lines.push({ icon: 'calculator', label: 'Jumla', value: money(p.total), bold: true });
        if (p.variants) {
            const vv = Object.keys(p.variants).map(function (k) {
                const labels = { size: 'Saizi', color: 'Rangi', model: 'Modeli', condition: 'Hali', weight: 'Vipimo', package: 'Ufungashao' };
                return (labels[k] || k) + ': ' + p.variants[k];
            }).join(' · ');
            if (vv) lines.push({ icon: 'tag', label: 'Chaguzi', value: vv });
        }
        if (p.notes) lines.push({ icon: 'edit', label: 'Ujumbe', value: p.notes });
    } else if (type === NF_TYPES.SERVICE) {
        if (p.scope) lines.push({ icon: 'target', label: 'Scope', value: p.scope });
        lines.push({ icon: 'hash', label: 'Idadi', value: String(p.quantity != null ? p.quantity : '—') });
        lines.push({ icon: 'wallet', label: 'Bei/kitengo', value: money(p.unitPrice) });
        lines.push({ icon: 'calculator', label: 'Jumla', value: money(p.total), bold: true });
        if (p.deadline) lines.push({ icon: 'clock', label: 'Muda', value: p.deadline + (p.deadlineDate ? ' (' + p.deadlineDate + ')' : '') });
        if (p.location) lines.push({ icon: 'map', label: 'Mahali', value: p.location });
        if (p.requirements) lines.push({ icon: 'briefcase', label: 'Nyenzo', value: p.requirements });
        if (p.notes) lines.push({ icon: 'edit', label: 'Maelezo', value: p.notes });
    } else {
        if (p.route) lines.push({ icon: 'map', label: 'Njia', value: (p.route.from || '?') + ' → ' + (p.route.to || '?') });
        if (p.packageDescription) lines.push({ icon: 'package', label: 'Mzigo', value: p.packageDescription });
        if (p.packageQuantity) lines.push({ icon: 'hash', label: 'Idadi', value: p.packageQuantity + (p.weight != null ? ' · ' + p.weight + ' kg' : '') });
        else if (p.weight != null) lines.push({ icon: 'scales', label: 'Uzito', value: p.weight + ' kg' });
        if (p.pickupDate) lines.push({ icon: 'calendar', label: 'Pickup', value: p.pickupDate });
        if (p.deliveryDeadline) lines.push({ icon: 'clock', label: 'Mwisho', value: p.deliveryDeadline });
        if (p.vehicleType) lines.push({ icon: 'truck', label: 'Chombo', value: p.vehicleType });
        lines.push({ icon: 'wallet', label: 'Nauli', value: money(p.unitPrice), bold: true });
        if (p.specialRequirements) lines.push({ icon: 'alert', label: 'Maagizo', value: p.specialRequirements });
        if (p.notes) lines.push({ icon: 'edit', label: 'Maelezo', value: p.notes });
    }
    return lines;
}

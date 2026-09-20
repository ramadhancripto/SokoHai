/* ==== js/app/38-nego-form-logic.js ====
   SOKOHAI — DYNAMIC NEGOTIATION FORM (Module 01 · LOGIC)
   ----------------------------------------------------------------
   [REPAIRED FILE 2026-09-20] Faili hii ilikuwa INAKOSEKANA (404) hata
   kwenye site asili — 38-negotiation-form.js ilikuwa HAIWEZI kupakia
   kabisa (static import ilikufa). Imeandikwa upya kwa usahihi ili
   iendane 100% na:
   - UI:        38-negotiation-form.js (sectionsFor/defaultValues/
                validateForm/buildProposal/summaryLines/computeTotals)
   - SUBMIT:    34-chat-core.js window.skhChatSubmitNegotiationProposal()
                (schema ya payload: commerceType, productId, unitPrice,
                total, catalogPrice, originalUnitPrice, notes, variants,
                deliveryLocation, preferredDate, scope, scopeUnit,
                deadline, deadlineDate, location, requirements, route,
                packageDescription, packageQuantity, weight, pickupDate,
                pickupTime, deliveryDeadline, vehicleType,
                specialRequirements)
   - BACKEND:   negotiationSendOffer callable + skhNegoNativeCreate
                (negotiations / offers / negotiation_events collections)

   LOGIC TU — hakuna UI, hakuna Firestore writes hapa. Haihoundi
   oda/malipo/usafirishaji (kama spec ilivyo).
   ================================================================ */

/* ----------------------------------------------------------------
 * 1) AINA ZA BIASHARA (commerce types)
 * ---------------------------------------------------------------- */
export const NF_TYPES = Object.freeze({
    PRODUCT: 'product',
    SERVICE: 'service',
    TRANSPORT: 'transport'
});

export const NF_META = Object.freeze({
    product: {
        key: 'product',
        icon: 'tag',
        title: 'Pendekeza Bei',
        label: 'Bidhaa',
        cta: 'Tuma Pendekezo'
    },
    service: {
        key: 'service',
        icon: 'wrench',
        title: 'Kadirio / Agiza Huduma',
        label: 'Huduma',
        cta: 'Tuma Kadirio'
    },
    transport: {
        key: 'transport',
        icon: 'truck',
        title: 'Jadili Nauli',
        label: 'Usafiri',
        cta: 'Tuma Nauli Yangu'
    }
});

/* ----------------------------------------------------------------
 * 2) VYOPA VYA SAUTI (format helpers)
 * ---------------------------------------------------------------- */
export function nfFmtMoney(v) {
    var n = Number(v);
    if (v == null || v === '' || isNaN(n)) return '—';
    return 'TSh ' + Math.round(n).toLocaleString('en-US');
}

export function nfTodayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
}

function nfNum(v) {
    if (v == null || v === '') return NaN;
    var n = Number(v);
    return isNaN(n) ? NaN : n;
}

function nfIsAuction(entity) {
    if (!entity) return false;
    return entity.saleMode === 'auction' || entity.isAuction === true ||
        entity.saleMode === 'mnada' || entity.auction === true;
}

/* Chaguo za chips (zinaonekana kwenye fomu) */
var NF_CHIP_OPTIONS = {
    size: ['Ndogo', 'Kati', 'Kubwa'],
    color: ['Nyeusi', 'Nyeupe', 'Bluu', 'Nyekundu', 'Kijani', 'Njano'],
    condition: ['Mpya', 'Nusu Mpya', 'Imetumika'],
    scopeUnit: ['Kwa saa', 'Kwa siku', 'Kwa mradi', 'Kwa kipimo'],
    vehicleType: ['Pickup / Ndodo', 'Lori', 'Bajaji', 'Pikipiki', 'Kontena']
};

/* ----------------------------------------------------------------
 * 3) SECTIONS ZA FOMU (fields kwa kila aina ya biashara)
 *    Field shape: { key, label, kind, required, placeholder, options,
 *                   maxLength, inputMode, step, min, max, minDate,
 *                   locked, pairedWith, rows }
 *    Kinds zilizosapotiwa na UI: total|chips|textarea|select|date|
 *                                money|number|text
 * ---------------------------------------------------------------- */
export function sectionsFor(type, entity) {
    entity = entity || {};
    if (type === NF_TYPES.SERVICE) {
        return [
            {
                title: 'Wazo la Kazi na Kadirio',
                fields: [
                    {
                        key: 'scope', label: 'Wazo la kazi (scope)', kind: 'textarea', required: true,
                        rows: 2, maxLength: 300, placeholder: 'Mf. Kupaka smea ya chumba cha kulia…'
                    },
                    {
                        key: 'scopeUnit', label: 'Kipimo cha kazi', kind: 'chips', options: NF_CHIP_OPTIONS.scopeUnit
                    },
                    {
                        key: 'fee', label: 'Kadirio lako (TSh)', kind: 'money', required: true,
                        inputMode: 'numeric', min: 100, placeholder: '0'
                    },
                    { key: 'nfTotal', label: 'Jumla la kadirio', kind: 'total' }
                ]
            },
            {
                title: 'Muda, Mahali na Mahitaji', optional: true,
                fields: [
                    { key: 'deadline', label: 'Muda wa kukamilisha', kind: 'text', maxLength: 60, placeholder: 'Mf. ndani ya siku 3' },
                    { key: 'deadlineDate', label: 'Tarehe ya mwisho', kind: 'date', minDate: 'today' },
                    { key: 'location', label: 'Mahali pazuri pa kazi', kind: 'text', maxLength: 80, placeholder: 'Mf. Mbezi, Dar es Salaam' },
                    { key: 'requirements', label: 'Mahitaji maalum', kind: 'textarea', rows: 2, maxLength: 300, placeholder: 'Mf. ana vifaa vyake, fanya kazi mchana…' },
                    { key: 'notes', label: 'Ujumbe kwa mtoa huduma', kind: 'textarea', rows: 2, maxLength: 300, placeholder: 'Ongeza maelezo…' }
                ]
            }
        ];
    }
    if (type === NF_TYPES.TRANSPORT) {
        return [
            {
                title: 'Mzigo, Njia na Nauli',
                fields: [
                    {
                        key: 'packageDescription', label: 'Maelezo ya mzigo', kind: 'textarea', required: true,
                        rows: 2, maxLength: 200, placeholder: 'Mf. Mifuko 10 ya mchele…'
                    },
                    { key: 'packageQuantity', label: 'Idadi / kiasi', kind: 'text', maxLength: 60, placeholder: 'Mf. Mifuko 10, kila moja 5kg' },
                    { key: 'weight', label: 'Uzito (kg)', kind: 'number', inputMode: 'decimal', step: '0.1', min: 0 },
                    { key: 'vehicleType', label: 'Gari linalofaa', kind: 'chips', options: NF_CHIP_OPTIONS.vehicleType },
                    {
                        key: 'fee', label: 'Nauli unayopendekeza (TSh)', kind: 'money', required: true,
                        inputMode: 'numeric', min: 500, placeholder: '0'
                    },
                    { key: 'nfTotal', label: 'Nauli ya safari nzima', kind: 'total' }
                ]
            },
            {
                title: 'Ratiba ya Usafiri', optional: true,
                fields: [
                    { key: 'pickupDate', label: 'Tarehe ya kuchukua', kind: 'date', minDate: 'today' },
                    {
                        key: 'pickupTime', label: 'Muda wa kuchukua', kind: 'select',
                        options: ['Asubuhi (08:00–12:00)', 'Mchana (12:00–16:00)', 'Jioni (16:00–20:00)', 'Usiku (20:00–06:00)', 'Muda wowote']
                    },
                    { key: 'deliveryDeadline', label: 'Lazima ifike kabla ya', kind: 'date', minDate: 'pickupDate' },
                    { key: 'specialRequirements', label: 'Mahitaji maalum ya njia', kind: 'textarea', rows: 2, maxLength: 300, placeholder: 'Mf. barabara ya vumbi, inahitaji gari la 4WD…' },
                    { key: 'notes', label: 'Ujumbe kwa msafirishaji', kind: 'textarea', rows: 2, maxLength: 300, placeholder: 'Ongeza maelezo…' }
                ]
            }
        ];
    }
    /* PRODUCT (default) */
    var productFields = [
        {
            key: 'quantity', label: 'Idadi', kind: 'number', required: true,
            inputMode: 'numeric', min: 1, max: 100000, locked: nfIsAuction(entity)
        },
        {
            key: 'unitPrice', label: 'Bei yako kwa kipande (TSh)', kind: 'money', required: true,
            inputMode: 'numeric', min: 100, placeholder: '0'
        },
        { key: 'nfTotal', label: 'Jumla (idadi × bei)', kind: 'total' }
    ];
    var optionalSections = [];
    /* Chips za variants (zimechaguliwa awali au chaguo za jumla) */
    var hasVariants = !!(entity && (entity.variants || entity.selectedVariants));
    optionalSections.push({
        title: 'Vipimo vya Bidhaa', optional: true,
        fields: [
            { key: 'size', label: 'Size', kind: 'chips', options: NF_CHIP_OPTIONS.size },
            { key: 'color', label: 'Rangi', kind: 'chips', options: NF_CHIP_OPTIONS.color },
            { key: 'condition', label: 'Hali', kind: 'chips', options: NF_CHIP_OPTIONS.condition }
        ]
    });
    optionalSections.push({
        title: 'Maelezo ya Ziada', optional: true,
        fields: [
            { key: 'deliveryLocation', label: 'Mahali pa kupokea', kind: 'text', maxLength: 80, placeholder: 'Mf. Kariakoo, Dar es Salaam' },
            { key: 'preferredDate', label: 'Tarehe unayopendelea', kind: 'date', minDate: 'today' },
            { key: 'notes', label: 'Ujumbe kwa muuzaji', kind: 'textarea', rows: 2, maxLength: 300, placeholder: 'Ongeza maelezo…' }
        ]
    });
    return [{ title: 'Idadi na Bei', fields: productFields }].concat(optionalSections);
}

/* ----------------------------------------------------------------
 * 4) THAMANI ZA MWANZO (defaults)
 * ---------------------------------------------------------------- */
export function defaultValues(type, entity) {
    entity = entity || {};
    var today = nfTodayISO();
    if (type === NF_TYPES.SERVICE) {
        return {
            scope: entity.scope || '',
            scopeUnit: '',
            fee: '',
            deadline: '',
            deadlineDate: '',
            location: entity.location || '',
            requirements: '',
            notes: ''
        };
    }
    if (type === NF_TYPES.TRANSPORT) {
        return {
            packageDescription: entity.packageDescription || '',
            packageQuantity: entity.packageQuantity || '',
            weight: (entity.weight != null && entity.weight !== '') ? String(entity.weight) : '',
            vehicleType: entity.vehicleType || '',
            fee: '',
            pickupDate: today,
            pickupTime: '',
            deliveryDeadline: '',
            specialRequirements: '',
            notes: ''
        };
    }
    /* PRODUCT */
    var v = {
        quantity: nfIsAuction(entity) ? '1' : '1',
        unitPrice: '',
        size: '', color: '', condition: '',
        deliveryLocation: '',
        preferredDate: '',
        notes: ''
    };
    /* Ikiwa mnunuzi amechagua variants kabla (kutoka showcase), tumia */
    if (entity.selectedVariants && typeof entity.selectedVariants === 'object') {
        Object.keys(entity.selectedVariants).forEach(function (k) {
            if (k in v) v[k] = String(entity.selectedVariants[k]);
        });
    }
    return v;
}

/* ----------------------------------------------------------------
 * 5) UHAKIKI (validation)
 * ---------------------------------------------------------------- */
export function validateForm(type, values, entity) {
    values = values || {};
    var errors = {};
    var qty = nfNum(values.quantity);
    var fee = nfNum(values.unitPrice != null ? values.unitPrice : values.fee);

    if (type === NF_TYPES.SERVICE) {
        if (!String(values.scope || '').trim()) errors.scope = 'Wazo la kazi linahitajika.';
        if (!(fee > 0)) errors.fee = 'Weka kadirio lako (TSh).';
        else if (fee < 100) errors.fee = 'Kadirio kiwe angalau TSh 100.';
    } else if (type === NF_TYPES.TRANSPORT) {
        if (!String(values.packageDescription || '').trim()) errors.packageDescription = 'Maelezo ya mzigo yanahitajika.';
        if (!(fee > 0)) errors.fee = 'Weka nauli unayopendekeza (TSh).';
        else if (fee < 500) errors.fee = 'Nauli iwe angalau TSh 500.';
        if (values.pickupDate && values.deliveryDeadline && String(values.deliveryDeadline) < String(values.pickupDate)) {
            errors.deliveryDeadline = 'Tarehe ya kufika iwe baada ya ya kuchukua.';
        }
    } else {
        /* PRODUCT */
        if (!(qty >= 1)) errors.quantity = 'Idadi iwe angalau 1.';
        else if (qty > 100000) errors.quantity = 'Idadi ni kubwa mno.';
        if (!(fee > 0)) errors.unitPrice = 'Weka bei yako (TSh).';
        else if (fee < 100) errors.unitPrice = 'Bei iwe angalau TSh 100.';
        if (nfIsAuction(entity) && qty !== 1) errors.quantity = 'Bidhaa ya mnada — idadi ni 1.';
    }
    return { valid: Object.keys(errors).length === 0, errors: errors };
}

/* ----------------------------------------------------------------
 * 6) HESABU YA JUMLA (totals)
 * ---------------------------------------------------------------- */
export function computeTotals(type, values) {
    values = values || {};
    if (type === NF_TYPES.TRANSPORT) {
        var tfee = nfNum(values.fee);
        return { total: (tfee > 0) ? tfee : null };
    }
    if (type === NF_TYPES.SERVICE) {
        var sfee = nfNum(values.fee);
        return { total: (sfee > 0) ? sfee : null };
    }
    var qty = nfNum(values.quantity); if (!(qty >= 1)) qty = NaN;
    var up = nfNum(values.unitPrice);
    var total = (qty > 0 && up > 0) ? qty * up : null;
    return { total: total };
}

/* ----------------------------------------------------------------
 * 7) KUUNDA PROPOSAL (schema ya skhChatSubmitNegotiationProposal)
 * ---------------------------------------------------------------- */
function nfVariantsFromValues(values) {
    var out = [];
    ['size', 'color', 'condition'].forEach(function (k) {
        var v = values && values[k] ? String(values[k]).trim() : '';
        if (v) out.push({ name: k, value: v });
    });
    return out.length ? out : null;
}

export function buildProposal(type, entity, values, ctx) {
    entity = entity || {};
    values = values || {};
    ctx = ctx || {};
    var catalogPrice = (entity.price != null && Number(entity.price) > 0)
        ? Number(entity.price)
        : (entity.fare != null && Number(entity.fare) > 0 ? Number(entity.fare) : null);
    var totals = computeTotals(type, values);
    var coll = entity.collection || entity.collectionName ||
        (type === NF_TYPES.SERVICE ? 'services' : (type === NF_TYPES.TRANSPORT ? 'ride_requests' : 'products'));

    var p = {
        commerceType: type,
        conversationId: ctx.conversationId || null,
        sellerId: ctx.sellerId || entity.sellerId || entity.providerId || entity.driverId || entity.userId || null,
        sellerName: ctx.sellerName || entity.sellerName || entity.providerName || entity.driverName || entity.ownerName || entity.company || '',
        productCollection: coll,
        productImage: entity.image || '',
        quantity: (nfNum(values.quantity) >= 1) ? Math.floor(nfNum(values.quantity)) : 1,
        unitPrice: (type === NF_TYPES.PRODUCT) ? nfNum(values.unitPrice) : nfNum(values.fee),
        total: totals.total,
        catalogPrice: catalogPrice,
        originalUnitPrice: catalogPrice,
        notes: String(values.notes || '').trim()
    };

    if (type === NF_TYPES.SERVICE) {
        p.serviceId = entity.id || '';
        p.serviceTitle = entity.title || entity.serviceName || 'Huduma';
        p.productTitle = p.serviceTitle;
        p.productId = p.serviceId;
        p.serviceCollection = coll;
        p.scope = String(values.scope || '').trim();
        p.scopeUnit = String(values.scopeUnit || '').trim();
        p.deadline = String(values.deadline || '').trim();
        p.deadlineDate = String(values.deadlineDate || '').trim();
        p.location = String(values.location || '').trim();
        p.requirements = String(values.requirements || '').trim();
    } else if (type === NF_TYPES.TRANSPORT) {
        p.transportId = entity.id || '';
        p.transportTitle = entity.title || entity.cargoName || 'Usafiri';
        p.productTitle = p.transportTitle;
        p.productId = p.transportId;
        p.transportCollection = coll;
        p.route = {
            from: entity.fromLocation || (entity.route && entity.route.from) || '',
            to: entity.toLocation || (entity.route && entity.route.to) || ''
        };
        p.packageDescription = String(values.packageDescription || '').trim();
        p.packageQuantity = String(values.packageQuantity || '').trim();
        var w = nfNum(values.weight);
        p.weight = (w > 0) ? w : (entity.weight != null ? Number(entity.weight) || null : null);
        p.pickupDate = String(values.pickupDate || '').trim();
        p.pickupTime = String(values.pickupTime || '').trim();
        p.deliveryDeadline = String(values.deliveryDeadline || '').trim();
        p.vehicleType = String(values.vehicleType || '').trim();
        p.specialRequirements = String(values.specialRequirements || '').trim();
    } else {
        p.productId = entity.id || '';
        p.productTitle = entity.title || entity.itemTitle || 'Bidhaa';
        p.variants = nfVariantsFromValues(values);
        p.deliveryLocation = String(values.deliveryLocation || '').trim();
        p.preferredDate = String(values.preferredDate || '').trim();
    }
    return p;
}

/* ----------------------------------------------------------------
 * 8) MUHTASARI (summary lines za fomu)
 * ---------------------------------------------------------------- */
export function summaryLines(type, proposal) {
    proposal = proposal || {};
    var lines = [];
    function add(icon, label, value, bold) {
        if (value == null || value === '') return;
        lines.push({ icon: icon, label: label, value: String(value), bold: !!bold });
    }
    if (type === NF_TYPES.SERVICE) {
        add('wrench', 'Huduma', proposal.serviceTitle || proposal.productTitle);
        add('scales', 'Kipimo', proposal.scopeUnit);
        add('clipboard', 'Wazo la kazi', proposal.scope);
        add('tag', 'Kadirio', proposal.unitPrice != null ? nfFmtMoney(proposal.unitPrice) : null, true);
        add('clock', 'Muda', proposal.deadline);
        add('calendar', 'Tarehe ya mwisho', proposal.deadlineDate);
        add('map', 'Mahali', proposal.location);
    } else if (type === NF_TYPES.TRANSPORT) {
        add('truck', 'Usafiri', proposal.transportTitle || proposal.productTitle);
        if (proposal.route && (proposal.route.from || proposal.route.to)) {
            add('map', 'Njia', (proposal.route.from || '?') + ' → ' + (proposal.route.to || '?'));
        }
        add('package', 'Mzigo', proposal.packageDescription);
        add('scales', 'Uzito', proposal.weight != null && proposal.weight !== '' ? proposal.weight + ' kg' : null);
        add('clock', 'Kuchukua', [proposal.pickupDate, proposal.pickupTime].filter(Boolean).join(' · '));
        add('calendar', 'Ifike kabla ya', proposal.deliveryDeadline);
        add('tag', 'Nauli yangu', proposal.unitPrice != null ? nfFmtMoney(proposal.unitPrice) : null, true);
    } else {
        add('shop', 'Bidhaa', proposal.productTitle);
        if (proposal.variants && proposal.variants.length) {
            add('edit', 'Vipimo', proposal.variants.map(function (v) { return v.name + ': ' + v.value; }).join(', '));
        }
        add('clipboard', 'Idadi', proposal.quantity);
        add('tag', 'Bei yangu', proposal.unitPrice != null ? nfFmtMoney(proposal.unitPrice) : null, true);
        add('scales', 'Jumla', proposal.total != null ? nfFmtMoney(proposal.total) : null, true);
        add('map', 'Kupokea', proposal.deliveryLocation);
        add('calendar', 'Tarehe', proposal.preferredDate);
    }
    if (proposal.catalogPrice != null) {
        lines.unshift({ icon: 'tag', label: 'Sokoni', value: nfFmtMoney(proposal.catalogPrice) });
    }
    if (proposal.notes) {
        add('edit', 'Ujumbe', proposal.notes);
    }
    return lines;
}

/* ==== js/app/00-bootstrap.js ==== */
// SOKOHAI core runtime (Phase 2 refactor).
// Ina: Firebase imports, config, auth/db, bridges, na SHARED STATE `skh`.
// Faili zote za feature (01..24) zinaimportia `skh` kutoka hapa.
// Mutable state & helpers zote za kiwango cha juu zimehamia kwenye `skh` object.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCustomToken, signOut, updateProfile, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, where, updateDoc, doc, increment, arrayUnion, arrayRemove, getDocs, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

const skh = {};

// Mirror ya Firebase imports -> skh (faili za feature zinazifikia kupitia skh)
skh.initializeApp = initializeApp;
skh.getAuth = getAuth;
skh.onAuthStateChanged = onAuthStateChanged;
skh.signInWithEmailAndPassword = signInWithEmailAndPassword;
skh.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
skh.signInWithCustomToken = signInWithCustomToken;
skh.signOut = signOut;
skh.updateProfile = updateProfile;
skh.signInWithPopup = signInWithPopup;
skh.GoogleAuthProvider = GoogleAuthProvider;
skh.sendPasswordResetEmail = sendPasswordResetEmail;
skh.sendEmailVerification = sendEmailVerification;
skh.getFirestore = getFirestore;
skh.collection = collection;
skh.addDoc = addDoc;
skh.onSnapshot = onSnapshot;
skh.query = query;
skh.orderBy = orderBy;
skh.limit = limit;
skh.where = where;
skh.updateDoc = updateDoc;
skh.doc = doc;
skh.increment = increment;
skh.arrayUnion = arrayUnion;
skh.arrayRemove = arrayRemove;
skh.getDocs = getDocs;
skh.getDoc = getDoc;
skh.setDoc = setDoc;
skh.deleteDoc = deleteDoc;
skh.runTransaction = runTransaction;
skh.serverTimestamp = serverTimestamp;
skh.deleteField = deleteField;  // [FIX TOGGLE 2026-09-14] kusafisha fields bapa
skh.getFunctions = getFunctions;
skh.httpsCallable = httpsCallable;

/* ============================================================
   [FUNCTIONS RESILIENCE 2026-09] Safu MOJA ya kati ya Cloud Functions.
   - Hutambua functions ambazo HAZIJAPELEKWA / hazipatikani (404 ya
     endpoint hurudishwa na SDK kama functions/not-found, na mara nyingi
     ujumbe "INTERNAL"; pia unavailable/deadline/network).
   - Haiandili upya makosa HALISI ya biashara (permission-denied,
     invalid-argument, unauthenticated) — hayana alama ya fnDown.
   - Huhifadhi kosa asili (code + message) ili fallback zilizopo
     (negotiation/comments/agent/routing) ziendelee kufanya kazi, na
     huongeza tu: e.fnDown=true na e.friendlyMessage (Kiswahili).
   - Huweka bendela skh.functionsDown na kutuma tukio 'skh:functions-down'
     na kutoa onyo moja lisilo la kukatiza (toast) — hakuna tena "INTERNAL"
     mbichi inayorushwa kwa mtumiaji.
   ============================================================ */
skh._functionsRegion = 'europe-west1';
skh.functionsDown = false;
skh._fnDownToastAt = 0;

function fnErrorCode(e) {
    if (!e) return '';
    return String(e.code || e.errorCode || (e.errorInfo && e.errorInfo.code) || '').toLowerCase();
}
function fnErrorText(e) {
    if (!e) return '';
    var d = e.details;
    var dt = (d && (typeof d === 'string' ? d : (d.message || ''))) || '';
    return String(e.message || dt || '');
}
// Kweli wakati kosa ni LA MIUNDOMBINU (function haipo / haifikiki),
// tofauti na katazo la biashara.
skh.isFunctionsDownError = function (e) {
    if (!e) return false;
    var code = fnErrorCode(e);
    var text = (code + ' ' + fnErrorText(e)).toLowerCase();
    if (code === 'functions/not-found' || code === 'functions/unavailable'
        || code === 'unavailable' || code === 'functions/deadline-exceeded') return true;
    if (code === 'functions/internal' || code === 'internal') return true;
    // Ujumbe wa Firebase SDK wakati endpoint haipo / mkoa si sahihi / mtandao umekata.
    return /not[- ]?found|unavailable|deadline[ -]?exceeded|failed to fetch|network error|no_functions|hazipatikani|haipatikani/.test(text)
        || /^\s*internal\s*$/.test(String(e && e.message || '').trim());
};

window.skhFnDownMessage = function (feature) {
    var f = String(feature || '').toLowerCase();
    if (/pesapal|pesa|pay|malipo|wallet|escrow|sokopay|haipay/.test(f)) {
        return 'Huduma ya malipo (SokoPay) haipatikani kwa sasa. Malipo hayajakamilika — jaribu tena baadaye au wasiliana na msaada. Pesa yoyote haijatolewa.';
    }
    if (/deliver|custody|token|rout|booking|safari|usafir|offer|negotiation/.test(f)) {
        return 'Huduma ya server ya hatua hii haipatikani kwa sasa. Jaribu tena baadaye; endapo itaendelea, wasiliana na msaada.';
    }
    return 'Huduma ya server haipatikani kwa sasa. jaribu tena baadaye.';
};

function markFunctionsDown(name, e) {
    var first = !skh.functionsDown;
    skh.functionsDown = true;
    skh.functionsDownSince = skh.functionsDownSince || Date.now();
    try {
        window.dispatchEvent(new CustomEvent('skh:functions-down', { detail: { name: name, code: fnErrorCode(e) } }));
    } catch (evtErr) { /* CustomEvent haipo — puuza */ }
    // Onyo MOJA lisilo la kukatiza (kila angalau dakika 10), badala ya
    // kurundika maelfu ya alert zenye "INTERNAL".
    try {
        if (first && Date.now() - skh._fnDownToastAt > 10 * 60 * 1000) {
            skh._fnDownToastAt = Date.now();
            if (typeof window.sokohaiToast === 'function') {
                window.sokohaiToast('Baadhi ya huduma za server (malipo/SokoPay) hazijawashwa kwa sasa. Taarifa za sokoni zinaendelea; jaribu tena baadaye.', 'warn', 7000);
            } else {
                console.warn('[Cloud Functions] haipatikani (' + name + '):', fnErrorCode(e) || fnErrorText(e));
            }
        }
    } catch (tErr) { /* kimya */ }
    return first;
}
window.skhMarkFunctionsDown = function (name, e) { return markFunctionsDown(name, e); };
window.skhIsFunctionsDownError = skh.isFunctionsDownError;

// Fungasha callable yoyote: saini ileile (data, options) => Promise,
// lakini makosa ya miundombinu huwekewa alama + ujumbe wa maana.
skh.wrapCallable = function (name) {
    var raw = null;
    try {
        raw = skh.httpsCallable(skh.getFunctions(skh.fApp, skh._functionsRegion), name);
    } catch (initErr) {
        return function wrapped() { return Promise.reject(normalizeFnCallError(name, initErr)); };
    }
    // [CIRCUIT BREAKER 2026-09] Endpoint zisipokuwepo (404/CORS preflight,
    // km. Cloud Functions hazijatumwa), kila mwito mpya uliozua mwamko wa
    // mtandao uliozuiwa ulijaza console ya kivinjari makosa ya CORS na
    // kupunguza kasi. Baada ya kushindwa mara ya kwanza, tusipige mtandao
    // kwa sekunde 30; wito hurudisha kosa la 'haipatikani' mara moja
    // (fallback za kawaida hufanya kazi). Mwito wowote ukifanikiwa,
    // kizingiti hufunguliwa tena papo hapo.
    /* [FIX 2026-09-15] Cooldown ilikuwa sekunde 30 — fupi mno kwa function
       ambayo HAIPO kabisa (404). Kila sekunde 30 kila mwito ulijaribu tena,
       ukijaza console kwa CORS/ERR_FAILED (mf. deliveryRouteSweep ikirudia).
       Sasa: 30s kwa hitilafu ya muda, LAKINI dakika 10 kwa function
       iliyothibitika kuwa haipo (404/not-found). */
    var FN_COOLDOWN_MS = 30000;
    var FN_MISSING_COOLDOWN_MS = 10 * 60 * 1000;
    skh._fnMissing = skh._fnMissing || {};
    function syntheticDown() {
        var e = new Error('Cloud Functions hazipatikani kwa muda huu (server haijatumwa au mtandao umekatika).');
        e.code = 'functions/unavailable';
        return normalizeFnCallError(name, e);
    }
    function wrapped(data, opts) {
        // Function hii imeshathibitika HAIPO -> usiijaribu tena kwa dakika 10.
        var missAt = skh._fnMissing[name];
        if (missAt && (Date.now() - missAt) < FN_MISSING_COOLDOWN_MS) {
            return Promise.reject(syntheticDown());
        }
        if (skh.functionsDown && skh.functionsDownSince
            && (Date.now() - skh.functionsDownSince) < FN_COOLDOWN_MS) {
            return Promise.reject(syntheticDown());
        }
        return Promise.resolve()
            .then(function () { return raw(data, opts); })
            .then(function (res) {
                // Mwito umefanikiwa -> server imerudi; fungua kizingiti.
                if (skh.functionsDown) {
                    skh.functionsDown = false;
                    skh.functionsDownSince = 0;
                }
                return res;
            })
            .catch(function (e) {
                var normalized = normalizeFnCallError(name, e);
                if (normalized.fnDown) {
                    skh.functionsDownSince = Date.now();
                    // 404/not-found = haipo kabisa -> weka alama ya muda mrefu
                    var c = String((e && e.code) || '').toLowerCase();
                    var t = String((e && e.message) || '').toLowerCase();
                    if (/not-?found|404|cors|failed to fetch|err_failed/.test(c + ' ' + t)) {
                        if (!skh._fnMissing[name]) {
                            console.warn('[Cloud Functions] "' + name + '" haipo (haijadeploy). ' +
                                         'Sitaijaribu tena kwa dakika 10. Endesha skhDiagnose() kwa maelezo.');
                        }
                        skh._fnMissing[name] = Date.now();
                    }
                }
                throw normalized;
            });
    }
    wrapped.__name = name;
    wrapped.__raw = raw;
    return wrapped;
};
function normalizeFnCallError(name, e) {
    if (e && skh.isFunctionsDownError(e)) {
        e.fnDown = true;
        e.fnName = name;
        if (!e.friendlyMessage) e.friendlyMessage = window.skhFnDownMessage(name);
        markFunctionsDown(name, e);
    }
    return e;
}
skh.normalizeFnError = normalizeFnCallError;
// Rahisisha utumizi wa mara-moja: skh.callFunction('jina', data)
skh.callFunction = function (name, data, opts) {
    return skh.wrapCallable(name)(data, opts);
};
// Ujumbe wa kuonyesha kwa mtumiaji kutoka kosa la callable.
window.skhFnErrText = function (e, feature) {
    if (!e) return (feature ? window.skhFnDownMessage(feature) : 'Hitilafu isiyojulikana.');
    if (e.fnDown) return e.friendlyMessage || window.skhFnDownMessage(feature || e.fnName);
    // Makosa HALISI ya server: toa ujumbe wa maana, si "INTERNAL" mbichi.
    var d = e.details;
    var real = (d && (typeof d === 'string' ? d : d.message)) || e.message || '';
    real = String(real).replace(/^Error:\s*/, '').replace(/^\[.*?\]\s*/, '');
    if (/^\s*internal\s*$/i.test(real)) return (feature ? window.skhFnDownMessage(feature) : 'Hitilafu ya ndani ya server. jaribu tena.');
    return real || (feature ? window.skhFnDownMessage(feature) : 'Hitilafu. Jaribu tena.');
};

skh.safeLocalStorage = undefined;

try {
    const testKey = '__test_local_storage__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    skh.safeLocalStorage = window.localStorage;
} catch (e) {
    console.warn("localStorage is not accessible due to sandboxing. Using memory fallback.");
    const memoryStorage = {};
    skh.safeLocalStorage = {
        getItem: function(key) {
            return key in memoryStorage ? memoryStorage[key] : null;
        },
        setItem: function(key, value) {
            memoryStorage[key] = String(value);
        },
        removeItem: function(key) {
            delete memoryStorage[key];
        },
        clear: function() {
            for (let key in memoryStorage) {
                delete memoryStorage[key];
            }
        },
        key: function(index) {
            const keys = Object.keys(memoryStorage);
            return keys[index] || null;
        },
        get length() {
            return Object.keys(memoryStorage).length;
        }
    };
}

skh.localStorage = skh.safeLocalStorage;

if (navigator.geolocation) {
    const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(successCallback, errorCallback, options) {
        try {
            originalGetCurrentPosition(
                successCallback,
                function(error) {
                    console.warn("Geolocation failed or blocked. Using fallback coordinates (Dar es Salaam).");
                    const mockPosition = {
                        coords: {
                            latitude: -6.7924,
                            longitude: 39.2083,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    };
                    successCallback(mockPosition);
                },
                options
            );
        } catch (e) {
            console.warn("getCurrentPosition threw error. Using Dar es Salaam fallback.");
            const mockPosition = {
                coords: {
                    latitude: -6.7924,
                    longitude: 39.2083,
                    accuracy: 10,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                },
                timestamp: Date.now()
            };
            successCallback(mockPosition);
        }
    };
    
    const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = function(successCallback, errorCallback, options) {
        try {
            return originalWatchPosition(
                successCallback,
                function(error) {
                    console.warn("watchPosition failed or blocked. Using fallback coordinates (Dar es Salaam).");
                    const mockPosition = {
                        coords: {
                            latitude: -6.7924,
                            longitude: 39.2083,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    };
                    successCallback(mockPosition);
                },
                options
            );
        } catch (e) {
            console.warn("watchPosition threw error. Using simulated timer fallback.");
            const intervalId = setInterval(() => {
                const mockPosition = {
                    coords: {
                        latitude: -6.7924,
                        longitude: 39.2083,
                        accuracy: 10,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    },
                    timestamp: Date.now()
                };
                successCallback(mockPosition);
            }, 3000);
            return intervalId;
        }
    };
}

document.addEventListener('submit', function(e) {
    e.preventDefault();
}, true);

const OriginalAudio = window.Audio;

window.Audio = function(src) {
    if (src && src.includes('alarm_clock.ogg')) {
        // External alarm audio replaced with local Web Audio synthesizer for file/CSP compatibility.
        return {
            loop: true,
            isPlaying: false,
            ctx: null,
            osc1: null,
            osc2: null,
            gainNode: null,
            play: function() {
                if (this.isPlaying) return Promise.resolve();
                this.isPlaying = true;
                try {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AudioCtx();
                    if (this.ctx.state === 'suspended') {
                        this.ctx.resume();
                    }
                    this.osc1 = this.ctx.createOscillator();
                    this.osc1.type = 'sawtooth';
                    this.osc1.frequency.setValueAtTime(600, this.ctx.currentTime);
                    
                    this.osc2 = this.ctx.createOscillator();
                    this.osc2.type = 'sine';
                    this.osc2.frequency.setValueAtTime(1, this.ctx.currentTime);
                    
                    this.gainNode = this.ctx.createGain();
                    this.gainNode.gain.setValueAtTime(0.1, this.ctx.currentTime);
                    
                    const modGain = this.ctx.createGain();
                    modGain.gain.setValueAtTime(150, this.ctx.currentTime);
                    
                    this.osc2.connect(modGain);
                    modGain.connect(this.osc1.frequency);
                    
                    this.osc1.connect(this.gainNode);
                    this.gainNode.connect(this.ctx.destination);
                    
                    this.osc1.start();
                    this.osc2.start();
                } catch(e) {
                    console.error("Web Audio playback failed:", e);
                }
                return Promise.resolve();
            },
            pause: function() {
                this.isPlaying = false;
                if (this.osc1) {
                    try { this.osc1.stop(); this.osc1.disconnect(); } catch(e){}
                    this.osc1 = null;
                }
                if (this.osc2) {
                    try { this.osc2.stop(); this.osc2.disconnect(); } catch(e){}
                    this.osc2 = null;
                }
                if (this.gainNode) {
                    try { this.gainNode.disconnect(); } catch(e){}
                    this.gainNode = null;
                }
            }
        };
    }
    return new OriginalAudio(src);
};

window.safeCreateChart = function(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    // [PERF 2026-09] Chart.js hupakuliwa kwa uvivu; grafu huchorwa punde
    // baada ya maktaba kuwasili (haiuzuii upakiaji wa ukurasa).
    if (typeof window.Chart === 'undefined') {
        if (typeof window.skhLoadChart === 'function') {
            window.skhLoadChart().then(function () {
                const c2 = document.getElementById(canvasId);
                if (!c2) return;
                try { new window.Chart(c2, config); } catch (e) {}
            }).catch(function () {});
        }
        return null;
    }
    const existing = Chart.getChart(canvasId);
    if (existing) existing.destroy();
    return new Chart(ctx, config);
};

window.closeModals = function(forceAll) {
        // [FIX 2026-09-19] Inbox double-hop + dashboard scroll lock regression
        // - Always hide ALL overlay-menus including sidebarMenuModal (z100005) which is > chatListModal (z7750)
        // - Explicit list includes sidebarMenuModal, plusMenu, sokohaiAccountSettingModal, mySokoHaiModal etc.
        // - Reset body overflow to auto (openProduct sets hidden)
        try {
            document.querySelectorAll('.overlay-menu').forEach(ov => {
                try { ov.style.display = 'none'; } catch(e) {}
                try { ov.classList.remove('open'); } catch(e) {}
            });
        } catch(e) {}
        const fomuZote = [ 'sellerForm','serviceForm','deliveryForm','sokopayForm', 'offlineMemberForm','editModal','businessOSForm','rideRequestModal', 'userPaymentModal','buyerOrdersModal', 'authModal', 'productModal', 'cartModal', 'chatModal', 'chatListModal', 'notifModal', 'directHireModal', 'deliveryChoiceModal', 'actionRequestModal', 'logisticsTokenModal', 'deliveriesModal', 'tripsModal', 'savedItemsModal',
            'sidebarMenuModal','plusMenu','mainMenu','sokohaiAccountSettingModal','mySokoHaiModal','sellerProfileModal','tokenBoxModal','requestInboxModal','routeMatchModal','skhDiscoverOverlay','skhDiscoverEngine'
        ];
        fomuZote.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                try { el.style.display = 'none'; } catch(e) {}
                try { el.classList.remove('open'); } catch(e) {}
            }
        });
        try { document.body.style.overflow = 'auto'; } catch(e) {}
        try { document.documentElement.style.overflow = 'auto'; } catch(e) {}

        // [FIX: bottom nav kupotea] Baada ya kufunga modal yoyote (mf. chujio/kategoria),
        // hakikisha bottom nav na top nav vinarudi ikiwa tupo kwenye soko (buyer mode).
        if (skh.currentMode === 'buyer') {
            const _hdr = document.querySelector('.sticky-top-section');
            const _ftr = document.querySelector('.bottom-area-wrapper');
            const _loc = document.getElementById('locationFilterBar');
            if (_hdr) _hdr.style.display = 'flex';
            if (_ftr) _ftr.style.display = 'flex';
            if (_loc) _loc.style.display = 'flex';
        }
    };

skh.firebaseConfig = {
        apiKey: "AIzaSyB_OQ4TN2ctkAv5EpX8NxrNklGq6T7feR4",
        authDomain: "sokonet-3b847.firebaseapp.com",
        projectId: "sokonet-3b847",
        storageBucket: "sokonet-3b847.appspot.com",
        appId: "1:950677961118:web:4cd8177bae10dc9f743e8f"
    };

skh.fApp = skh.initializeApp(skh.firebaseConfig);

skh.auth = skh.getAuth(skh.fApp);

skh.db = skh.getFirestore(skh.fApp);

if (window.skhRegisterFirestore) window.skhRegisterFirestore(skh.onSnapshot);

if (window.skhSyncRegisterFirestore) window.skhSyncRegisterFirestore({ db: skh.db, doc: skh.doc, setDoc: skh.setDoc, getDoc: skh.getDoc });

if (window.skhSpLiveRegisterFirestore) window.skhSpLiveRegisterFirestore({ db: skh.db, collection: skh.collection, query: skh.query, where: skh.where, orderBy: skh.orderBy, limit: skh.limit, getDocs: skh.getDocs });

if (window.skhWalletRegisterFirestore) window.skhWalletRegisterFirestore({ doc: skh.doc, updateDoc: skh.updateDoc, increment: skh.increment });

if (window.skhWalletRegisterCallables) window.skhWalletRegisterCallables({
        adjust: skh.wrapCallable("walletAdjust"), // [PHASE 5.3] region inaabana na server
        release: skh.wrapCallable("escrowRelease")
    });

// [PesaPal] handler ya kurudi (17-pesapal-return.js) — Firestore + apiKey
if (window.skhPesaPalReturnRegister) window.skhPesaPalReturnRegister({ db: skh.db, collection: skh.collection, query: skh.query, where: skh.where, limit: skh.limit, getDocs: skh.getDocs, updateDoc: skh.updateDoc, setDoc: skh.setDoc, getDoc: skh.getDoc, doc: skh.doc, addDoc: skh.addDoc, apiKey: (skh.firebaseConfig && skh.firebaseConfig.apiKey) || '' });

try { window.skhServerPaymentsStatus = skh.wrapCallable("pesapalTransactionStatus"); } catch (e) { console.warn("[PesaPal] status callable haikusajiliwa:", e && e.message); }

try { window.skhServerStatsRefresh = skh.wrapCallable("platformStatsRefresh"); } catch (e) { console.warn("[PHASE 5.4] stats callable haikusajiliwa:", e && e.message); }

try {
        window.skhServerPaymentsCheckout = skh.wrapCallable("pesapalCheckout");
    } catch (e) { console.warn("[PesaPal] httpsCallable haikusajiliwa:", e && e.message); }

// [CUSTODY 2026-09] Chain of Custody — server callables (kukubali + token + uthibitisho).
try { window.skhCustodyServerAccept = skh.wrapCallable("deliveryAccept"); } catch (e) { console.warn("[Custody] accept callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerGenerateToken = skh.wrapCallable("deliveryGenerateToken"); } catch (e) { console.warn("[Custody] generateToken callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerConfirmCustody = skh.wrapCallable("deliveryConfirmCustody"); } catch (e) { console.warn("[Custody] confirmCustody callable haikusajiliwa:", e && e.message); }
// [CUSTODY PHASE B 2026-09] Server-authoritative: kuanza safari, kukamilisha,
// mgogoro, na kuhakiki token (UI ya muuzaji).
try { window.skhCustodyServerStartTransit = skh.wrapCallable("deliveryStartTransit"); } catch (e) { console.warn("[Custody] startTransit callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerComplete = skh.wrapCallable("deliveryComplete"); } catch (e) { console.warn("[Custody] complete callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerDispute = skh.wrapCallable("deliveryDispute"); } catch (e) { console.warn("[Custody] dispute callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerTokenVerify = skh.wrapCallable("deliveryTokenVerify"); } catch (e) { console.warn("[Custody] tokenVerify callable haikusajiliwa:", e && e.message); }
try { window.skhCustodyServerPassengerBoard = skh.wrapCallable("deliveryPassengerBoard"); } catch (e) { console.warn("[Custody] passengerBoard callable haikusajiliwa:", e && e.message); }

// [REQUEST ROUTING 2026-09] Routing Engine — ofa kwa mawakala waliostahili,
// accept/decline, muda-kuisha/reassignment, na kurudia routing.
try { window.skhRoutingServerRouteBooking = skh.wrapCallable("deliveryRouteBooking"); } catch (e) { console.warn("[Routing] routeBooking callable haikusajiliwa:", e && e.message); }
try { window.skhRoutingServerOfferAccept = skh.wrapCallable("deliveryOfferAccept"); } catch (e) { console.warn("[Routing] offerAccept callable haikusajiliwa:", e && e.message); }
try { window.skhRoutingServerOfferDecline = skh.wrapCallable("deliveryOfferDecline"); } catch (e) { console.warn("[Routing] offerDecline callable haikusajiliwa:", e && e.message); }
try { window.skhRoutingServerSweep = skh.wrapCallable("deliveryRouteSweep"); } catch (e) { console.warn("[Routing] sweep callable haikusajiliwa:", e && e.message); }
try { window.skhRoutingServerRetry = skh.wrapCallable("deliveryRouteRetry"); } catch (e) { console.warn("[Routing] retry callable haikusajiliwa:", e && e.message); }

// [DEEP L10N 2026-09] Card labels kupitia engine ya lugha; fallback za zamani hazivunjwi.
function skhTF(key, fb) {
    try { if (window.t) { var s = window.t(key); if (s && s !== key) return s; } } catch (eT) {}
    return fb;
}
skh.skhTF = skhTF;
// Two-arg form: skhTF(key, fallback) — tumikiwa katika blocks ya classic scripts.
window.skhTF = window.skhTF || skhTF;

skh.skhJsEsc = function skhJsEsc(s) { // [PHASE 4.5b] escaper ya onclick="fn('...')" (JS-string-safe)
    var BS = String.fromCharCode(92); // backslash
    var Q = String.fromCharCode(39);  // single quote
    return String(s == null ? '' : s)
        .split(BS).join(BS + BS)      // backslash -> backslash x2
        .split(Q).join(BS + Q)        // quote -> escaped quote
        .split('"').join('&quot;')
        .split('<').join('&lt;');
}

window.skhCopyText = function(t){ try{ navigator.clipboard.writeText(String(t)); alert(' Imenakiliwa: '+t); }catch(e){ alert('Nakili manual: '+t); } };

// [CUSTODY 2026-09] Token SALAMA (crypto-random, 8 hex) kwa mkondo wa mizigo.
// Inachukua nafasi ya tokeni za zamani za tarakimu 4 (Math.random) zilizokuwa
// rahisi kubahatisha (PK-1234, TR-0000 n.k.). Hazina utabiri.
skh.secureToken = function secureToken(prefix) {
    prefix = prefix || 'PK-';
    try {
        if (typeof window.crypto !== 'undefined' && window.crypto.getRandomValues) {
            const b = new window.Uint8Array(4);
            window.crypto.getRandomValues(b);
            let hex = '';
            for (let i = 0; i < 4; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16);
            return prefix + hex.toUpperCase();
        }
    } catch (e) { /* fallback hapa chini */ }
    return prefix + Math.random().toString(16).slice(2, 10).toUpperCase();
};
window.skhSecureToken = skh.secureToken;

skh.skhEscape = function skhEscape(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

window.posCart = [];

window.customPrompt = function(message, placeholder, callback) {
    const existing = document.getElementById('customPromptBox');
    if(existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "customPromptBox";
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,34,68,0.7); z-index:1000005; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";
    
    const box = document.createElement("div");
    box.style.cssText = "background:white; padding:30px 25px; border-radius:24px; width:85%; max-width:350px; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.4); animation:popIn 0.3s ease-out;";
    
    const msg = document.createElement("p");
    msg.style.cssText = "font-size:15px; color:#1e293b; margin:0 0 15px; line-height:1.6; font-weight:600;";
    msg.innerText = message;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.style.cssText = "width:100%; padding:12px; border-radius:12px; border:1px solid #cbd5e1; margin-bottom:20px; outline:none; font-size:14px; text-align:center;";

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = "display:flex; gap:10px;";

    const btnCancel = document.createElement("button");
    btnCancel.innerText = "Ghairi";
    btnCancel.style.cssText = "background:#cbd5e1; color:#334155; border:none; padding:12px; border-radius:12px; font-weight:bold; font-size:14px; cursor:pointer; flex:1;";
    btnCancel.onclick = () => overlay.remove();

    const btnOk = document.createElement("button");
    btnOk.innerText = "Sawa";
    btnOk.style.cssText = "background:var(--primary-blue, #00509d); color:white; border:none; padding:12px; border-radius:12px; font-weight:bold; font-size:14px; cursor:pointer; flex:1;";
    btnOk.onclick = () => {
        const val = input.value.trim();
        overlay.remove();
        if(val) callback(val);
    };

    box.appendChild(msg);
    box.appendChild(input);
    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnOk);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
};

skh.mapInstance = null;

skh.driverMarker = null;

skh.userMarker = null;

skh.currentUser = null;

skh.currentUserData = null;

skh.userLat = null;

skh.userLon = null;

skh.filterNearMe = false;

skh.filterRegion = ""; // [MIKOA] Mkoa uliochaguliwa kwenye chujio la location ("") = Tanzania Nzima

// [MIKOA] Orodha kamili ya mikoa ya Tanzania (+visiwa) pamoja na majina mbadala
// kwa kufananisha na maandishi ya 'location' ya bidhaa.
skh.TZ_REGIONS = [
    { name: "Arusha", aliases: ["arusha"] },
    { name: "Dar es Salaam", aliases: ["dar es salaam", "dar-es-salaam", "dar", "dsm", "ilala", "kinondoni", "temeke", "ubungo", "kigamboni", "kariakoo"] },
    { name: "Dodoma", aliases: ["dodoma"] },
    { name: "Geita", aliases: ["geita"] },
    { name: "Iringa", aliases: ["iringa"] },
    { name: "Kagera", aliases: ["kagera", "bukoba"] },
    { name: "Katavi", aliases: ["katavi", "mpanda"] },
    { name: "Kigoma", aliases: ["kigoma"] },
    { name: "Kilimanjaro", aliases: ["kilimanjaro", "moshi", "kili"] },
    { name: "Lindi", aliases: ["lindi"] },
    { name: "Manyara", aliases: ["manyara", "babati"] },
    { name: "Mara", aliases: ["mara", "musoma"] },
    { name: "Mbeya", aliases: ["mbeya"] },
    { name: "Morogoro", aliases: ["morogoro", "moro"] },
    { name: "Mtwara", aliases: ["mtwara"] },
    { name: "Mwanza", aliases: ["mwanza"] },
    { name: "Njombe", aliases: ["njombe"] },
    { name: "Pwani", aliases: ["pwani", "coast", "kibaha", "bagamoyo"] },
    { name: "Rukwa", aliases: ["rukwa", "sumbawanga"] },
    { name: "Ruvuma", aliases: ["ruvuma", "songea"] },
    { name: "Shinyanga", aliases: ["shinyanga"] },
    { name: "Simiyu", aliases: ["simiyu"] },
    { name: "Singida", aliases: ["singida"] },
    { name: "Songwe", aliases: ["songwe"] },
    { name: "Tabora", aliases: ["tabora"] },
    { name: "Tanga", aliases: ["tanga"] },
    { name: "Unguja Kaskazini", aliases: ["unguja kaskazini", "zanzibar north", "kaskazini"] },
    { name: "Unguja Kusini", aliases: ["unguja kusini", "zanzibar south", "kusini"] },
    { name: "Mjini Magharibi", aliases: ["mjini magharibi", "zanzibar west", "zanzibar", "mjini"] },
    { name: "Pemba Kaskazini", aliases: ["pemba kaskazini", "pemba north"] },
    { name: "Pemba Kusini", aliases: ["pemba kusini", "pemba south", "pemba"] }
];

skh.userRegionName = "";

skh.cachedItems = [];

skh.currentOpenProduct = null;

skh.myCart = JSON.parse(skh.localStorage.getItem('sokohai_cart')) ||[];

skh.chatPartner = "";

skh.currentChatEmail = "";

skh.activeChatProduct = null;

skh.currentFeedCollection = "products";

skh.activeCheckoutAmount = 0;

skh.activeBoostItem = null;

// [FIX 2026-09] Usirudishe mode ya seller/agent/admin kutoka localStorage.
// App inaanza kila mara kwenye Soko la Mnunuzi (buyer) — dashboard inafunguka
// TU wakati mtumiaji ameingia mwenyewe (kupitia switchMode).
skh.currentMode = 'buyer';

skh.userUnsubscribe = null;

skh.notifUnsubscribe = null;

skh.serviceDataMap = { "physical": { "Home & Personal": { "Cleaning Services": { filters: ["Type of cleaning", "House size (rooms)", "Frequency (daily/weekly)"] }, "Beauty & Grooming": { filters: ["Service type", "Gender", "Location (home/salon)"] }, "Laundry Services": { filters: ["Weight (kg)", "Type of clothes", "Pickup & delivery"] }, "Home Cooking": { filters: ["Number of people", "Menu type", "Cooking location"] }, "Home Maintenance": { filters: ["Problem type", "Urgency level", "Tools required"] }, "Personal Care": { filters: ["Age group", "Duration", "Special needs"] }
        }, "Construction & Handyman": { "Building Construction": { filters: ["Project type", "Size of building", "Materials included"] }, "Electrical Installation": { filters: ["Type of electrical work", "House size", "Safety inspection needed"] }, "Plumbing Services": { filters: ["Problem type", "Water system type", "Materials included"] }, "Carpentry & Furniture": { filters: ["Custom design", "Material type", "Size"] }, "Painting & Finishing": { filters: ["Area size (m²)", "Paint type", "Interior/exterior"] }, "General Repairs": { filters: ["Type of repair", "Urgency level", "Parts required"] }, "Welding & Metal Works": { filters: ["Material type", "Design complexity", "Installation needed"] }
        }, "Cleaning & Maintenance": { "House Cleaning": { filters: ["Number of rooms", "Frequency", "Deep cleaning", "Materials provided"] }, "Office Cleaning": { filters: ["Office size", "Number of rooms", "Working hours"] }, "Vehicle Cleaning": { filters: ["Vehicle type", "Wash type", "Location"] }, "Deep Cleaning": { filters: ["Area size", "Dirt level", "Chemicals required"] }, "Pest Control": { filters: ["Type of pest", "Area size", "Frequency", "Safety precautions"] }, "Outdoor Maintenance": { filters: ["Area size", "Frequency", "Tools provided", "Waste disposal"] }
        }, "Event & Entertainment": { "Event Planning": { filters: ["Event type", "Guest count", "Location", "Budget range"] }, "DJ & Music": { filters: ["Event type", "Duration (hours)", "Music genre", "Equipment provided"] }, "Sound Systems": { filters: ["Event size", "Indoor/outdoor", "Technician needed"] }, "Decoration Services": { filters: ["Theme type", "Venue size", "Color scheme"] }, "Photography & Video": { filters: ["Event duration", "Number of photographers", "Editing required"] }, "MC / Host Services": { filters: ["Event type", "Language preference", "Duration"] }, "Entertainment Performers": { filters: ["Performance type", "Duration", "Audience size"] }
        }, "Tech & Repair": { "Phone Repair": { filters: ["Phone brand/model", "Problem type", "Spare parts needed"] }, "Computer Repair": { filters: ["Device type", "Problem category", "Onsite/offsite"] }, "Network Setup": { filters: ["Location size", "Number of devices", "Speed requirements"] }, "Electronics Repair": { filters: ["Device type", "Fault description", "Warranty needed"] }, "Printer Services": { filters: ["Machine type", "Error type", "Replacement parts needed"] }, "CCTV Systems": { filters: ["Number of cameras", "Indoor/outdoor", "Remote access needed"] }
        }, "Industrial Support": { "Machine Maintenance": { filters: ["Machine type", "Industry type", "Downtime urgency"] }, "Industrial Installation": { filters: ["Plant size", "Machine complexity", "Installation timeline"] }, "Warehouse Support": { filters: ["Warehouse size", "Type of goods", "Staff required"] }, "Logistics Handling": { filters: ["Load weight", "Transport type", "Distance"] }, "Quality Control": { filters: ["Product type", "Inspection depth", "Certification needed"] }, "Heavy Equipment": { filters: ["Equipment type", "Job size", "Operator required"] }
        }, "Agriculture Support": { "Farm Preparation": { filters: ["Farm size", "Type of land", "Equipment needed"] }, "Crop Production": { filters: ["Crop type", "Growth stage", "Pest type"] }, "Irrigation Systems": { filters: ["Farm size", "Water source", "System type"] }, "Livestock Services": { filters: ["Animal type", "Herd size", "Disease issue"] }, "Agricultural Advisory": { filters: ["Farm goal", "Crop type", "Soil condition"] }, "Post-Harvest Services": { filters: ["Crop type", "Quantity", "Storage duration"] }
        }
    }, "online": { "Creative Freelancing": { "Graphic Design": { filters: ["Design type", "Purpose", "File format"] }, "Video Production": { filters: ["Video length", "Platform", "Style"] }, "Photography": { filters: ["Event type", "Number of photos", "Editing level"] }, "Content Writing": { filters: ["Topic", "Word count", "Tone"] }, "Web & App Design": { filters: ["Project type", "Number of pages", "Features required"] }, "Social Media Management": { filters: ["Platform", "Posting frequency", "Ad budget"] }, "Digital AI Services": { filters: ["Use case", "Platform integration", "Complexity level"] }
        }, "Software & IT": { "Web & App Dev": { filters: ["Project type", "Programming language", "Required skills"] }
        }, "Digital Marketing": { "Campaigns": { filters: ["Platform", "Campaign duration", "Target audience"] }
        }, "Writing & Translation": { "Languages": { filters: ["Topic", "Word count", "Languages"] }
        }, "Media Production": { "Editing": { filters: ["Video length", "Platform", "Style"] }
        }, "AI Services": { "Prompt Engineering": { filters: ["Use case", "Platform integration", "Complexity level"] }
        }, "Virtual Business": { "Office Support": { filters: ["Task type", "Work hours", "Remote/onsite"] }
        }, "Online Coaching": { "Coaching & Lessons": { filters: ["Session Type", "Subject", "Duration"] }
        }, "Website Services": { "Site Setup": { filters: ["Project type", "Number of pages", "Features required"] }
        }, "Remote Support": { "Tech Help": { filters: ["Technical Support", "Software Troubleshooting", "Device Configuration"] }
        }
    }, "food": { "Food Services": { "Restaurants Food": { filters: ["Restaurant type", "Menu items", "Serving size"] }, "Catering Services": { filters: ["Event type", "Number of guests", "Menu selection"] }, "Street Food": { filters: ["Food type", "Portion size", "Location"] }, "Personal Chef": { filters: ["Service duration", "Meal plan type", "Number of people"] }, "Food Delivery": { filters: ["Pickup location", "Delivery location", "Urgency"] }, "Meal Prep Plans": { filters: ["Goal", "Calories target", "Duration plan"] }
        }
    }, "rental": { "Rental Services": { "Property Rentals": { filters: ["Property type", "Location", "Size", "Duration"] }, "Vehicle Rentals": { filters: ["Vehicle type", "Fuel policy", "Driver included"] }, "Equipment Rentals": { filters: ["Equipment type", "Power capacity", "Duration"] }, "Event Rentals": { filters: ["Event type", "Guest size", "Setup needed"] }, "Agricultural Rentals": { filters: ["Farm size", "Crop type", "Duration"] }, "Furniture Rentals": { filters: ["Item type", "Condition", "Duration"] }
        }
    }
};

skh.sysConfig = {
        bidhaa: { active: true, boost: true, sub: true, comm: true },
        huduma: { active: true, boost: true, sub: true, comm: true },
        usafiri: { active: true, boost: true, sub: true, comm: true },
        //  Alert System: Inadhibiti kama Announcement Bar inaruhusiwa kuonyesha
        // Mienendo ya Biashara Live (Auction/Price Drop/Group Buy).
        // Ikiwa Admin ameizima, bar inarudi kwenye matangazo ya kawaida (normal) tu.
        alerts: { active: true },
        //  MFUMO WA MALIPO (Payments): Admin-controlled PER-FEATURE switches.
        //   KILA ADA ina kitufe chake — hakuna switch ya jumla tena.
        //   true = LAZIMA ULIPE | false (default) = FREE (bure).
        //   - deposit:              TSh 1,300 deposit ya mnada/group-buy/price-drop
        //   - subscription:         ada ya usajili wa duka (mwezi/mwaka)
        //   - boost:                ada ya kukuza tangazo
        //   - commission:           5% platform fee kwenye escrow/SokoPay
        //   - offline_registration: TSh 2,100 usajili wa mwanachama asiye na simu
        //   - agent_registration:   TSh 3,100 usajili wa wakala
        fees: {
            deposit: false,
            subscription: false,
            boost: false,
            commission: false,
            offline_registration: false,
            agent_registration: false
        }
    };

// [FIX 2026-09] MALIPO KIMOJA-KIMOJA (PER-FEATURE) — hakuna switch ya jumla tena.
// Kila ada ina kitufe chake kwenye admin dashboard (deposit, subscription, boost,
// commission, offline_registration, agent_registration).
//   - paymentGate(feature)  -> je, ada HUSIKA imewashwa?
//   - paymentsEnabled()     -> (compat) true ikiwa ANGALAU ada moja imewashwa.
// [MIGRATION] fees.enabled ya zamani (global) bado inaheshimiwa mpaka admin abonyeze
// toggle mpya yoyote — toggleSys('fees', ...) inaibadilisha kuwa per-feature.
skh.paymentsEnabled = function paymentsEnabled() {
    try {
        const cfg = (window.sysConfig && window.sysConfig.fees) || (skh.sysConfig && skh.sysConfig.fees);
        if (!cfg) return false;
        // [FLIP-FLOP FIX 2026-09-17] Per-feature field IPO = ndiyo authoritative.
        // Legacy `enabled` ni fallback TU kama hakuna per-feature kamwe — vinginevyo
        // legacy `fees.enabled=false` ingeraidi haijauza chuma b(lipa sys toggle).
        const keys = ['deposit','subscription','boost','commission','offline_registration','agent_registration'];
        if (keys.some(function (k) { return k in cfg; })) {
            return keys.some(function (k) { return cfg[k] === true; });
        }
        if (typeof cfg.enabled === 'boolean') return cfg.enabled === true; // global ya zamani
        return false;
    } catch (e) { /* default: free */ }
    return false;
};
window.skhIsPaidMode = skh.paymentsEnabled; // alias kwa sehemu nyingine

skh.paymentGate = function paymentGate(feature) {
    try {
        const cfg = (window.sysConfig && window.sysConfig.fees) || (skh.sysConfig && skh.sysConfig.fees);
        if (!cfg) return false;
        // [FLIP-FLOP FIX 2026-09-17] Angalia per-feature KWANZA; legacy `enabled`
        // inaweza kushika ON/OFF kinyume na badiliko jipya admin alibofanya —
        // hili ndiyo lilikuwa chanzo cha switch "ikarudi OFF baada ya ON".
        if (feature in cfg) return cfg[feature] === true;
        if (typeof cfg.enabled === 'boolean') return cfg.enabled === true; // legacy fallback
        return false; // default: FREE
    } catch (e) { /* default: free */ }
    return false;
};
window.skhPaymentGate = skh.paymentGate; // ipatikane kwenye UI ya admin

skh.advancedCategories = { "Vyakula na Vinywaji (Food)": {
        icon: "",
        subcategories: { "Grains & Cereals": { filters: ["Brand", "Origin", "Grade", "Moisture", "Others"], stockTypes: ["Kg", "Bag", "Sack", "Ton"] }, "Cooking Oils": { filters: ["Brand", "Volume", "Type", "Origin", "Others"], stockTypes: ["Bottle", "Tin", "Drum", "Litre"] }, "Dairy Products": { filters: ["Brand", "Volume", "Fat Content", "Expiry", "Others"], stockTypes: ["Packet", "Bottle", "Box"] }, "Snacks & Confectionery": { filters: ["Brand", "Flavor", "Weight", "Expiry", "Others"], stockTypes: ["Piece", "Pack", "Box"] }, "Sugar & Sweeteners": { filters: ["Brand", "Weight", "Purity", "Others"], stockTypes: ["Kg", "Bag", "Sack"] }, "Salt Products": { filters: ["Brand", "Weight", "Type", "Others"], stockTypes: ["Piece", "Pack", "Bag"] }, "Spices & Seasonings": { filters: ["Brand", "Weight", "Origin", "Others"], stockTypes: ["Pack", "Kg", "Box"] }, "Bakery Products": { filters: ["Brand", "Weight", "Freshness", "Others"], stockTypes: ["Piece", "Pack"] }, "Beverages": { filters: ["Brand", "Volume", "Flavor", "Others"], stockTypes: ["Bottle", "Can", "Crate"] }, "Meat Products": { filters: ["Type", "Weight", "Freshness", "Source", "Others"], stockTypes: ["Kg", "Tray"] }, "Fish & Seafood": { filters: ["Type", "Weight", "Freshness", "Source", "Others"], stockTypes: ["Kg", "Crate", "Piece"] }
        }
    }, "Kilimo (Agriculture)": {
        icon: "",
        subcategories: { "Crop Production": { filters: ["Variety", "Season", "Moisture", "Grade", "Others"], stockTypes: ["Kg", "Bag", "Sack", "Ton"] }, "Seeds & Planting": { filters: ["Variety", "Germination Rate", "Treatment", "Others"], stockTypes: ["Packet", "Kg", "Bag"] }, "Fertilizers": { filters: ["Brand", "NPK Ratio", "Weight", "Form", "Others"], stockTypes: ["Bag", "Kg", "Ton"] }, "Pesticides & Herbicides": { filters: ["Brand", "Active Ingredient", "Volume", "Others"], stockTypes: ["Bottle", "Can", "Pack"] }, "Farm Tools": { filters: ["Brand", "Material", "Size", "Power Type", "Others"], stockTypes: ["Piece", "Set"] }, "Irrigation Supplies": { filters: ["Brand", "Size", "Material", "Capacity", "Others"], stockTypes: ["Piece", "Roll", "Set"] }
        }
    }, "Ufugaji (Livestock)": {
        icon: "",
        subcategories: { "Live Animals": { filters: ["Breed", "Age", "Weight", "Gender", "Health", "Others"], stockTypes: ["Head", "Piece"] }, "Meat & Protein": { filters: ["Cut Type", "Fresh/Frozen", "Weight", "Others"], stockTypes: ["Kg", "Tray"] }, "Dairy & Animal Products": { filters: ["Volume", "Fat Content", "Brand", "Expiry", "Others"], stockTypes: ["Bottle", "Packet", "Tray"] }, "Animal Feed & Nutrition": { filters: ["Brand", "Animal Type", "Form", "Weight", "Others"], stockTypes: ["Bag", "Kg", "Sack"] }, "Poultry Products": { filters: ["Type", "Breed", "Age", "Health", "Others"], stockTypes: ["Bird", "Tray", "Box"] }, "Fish & Aquaculture": { filters: ["Type", "Weight", "Source", "Freshness", "Others"], stockTypes: ["Kg", "Fingerling", "Crate"] }
        }
    }, "Afya na Pharmacy (Health)": {
        icon: "",
        subcategories: { "Medicines": { filters: ["Generic Name", "Brand", "Dosage", "Form", "Prescription", "Others"], stockTypes: ["Tablet", "Bottle", "Box"] }, "Medical Supplies": { filters: ["Brand", "Size", "Sterility", "Disposable", "Others"], stockTypes: ["Piece", "Box", "Pack"] }, "OTC Products": { filters: ["Brand", "Usage", "Form", "Age Group", "Others"], stockTypes: ["Piece", "Bottle", "Box"] }, "Veterinary Medicines": { filters: ["Brand", "Animal Type", "Dosage", "Form", "Others"], stockTypes: ["Tablet", "Bottle", "Pack"] }, "Health Supplements": { filters: ["Brand", "Ingredient", "Form", "Target Group", "Others"], stockTypes: ["Bottle", "Box", "Pack"] }, "Personal Health Care": { filters: ["Brand", "Purpose", "Skin Type", "Others"], stockTypes: ["Piece", "Bottle", "Pack"] }
        }
    }, "Mavazi na Fashoni (Fashion)": {
        icon: "",
        subcategories: { "Men's Wear": { filters: ["Brand", "Size", "Color", "Material", "Fit Type", "Others"], stockTypes: ["Piece", "Pack", "Bale"] }, "Women's Wear": { filters: ["Brand", "Size", "Color", "Material", "Style", "Others"], stockTypes: ["Piece", "Pack", "Bale"] }, "Footwear": { filters: ["Brand", "Shoe Size", "Color", "Material", "Others"], stockTypes: ["Pair", "Box"] }, "Kids & Baby Wear": { filters: ["Age Group", "Size", "Color", "Material", "Gender", "Others"], stockTypes: ["Piece", "Set", "Pack"] }
        }
    }, "Vito na Saa (Luxury)": {
        icon: "",
        subcategories: { "Jewelry": { filters: ["Material", "Purity", "Weight", "Gemstone", "Others"], stockTypes: ["Piece", "Gram", "Set"] }, "Watches": { filters: ["Brand", "Movement", "Water Resistance", "Material", "Others"], stockTypes: ["Piece", "Box"] }, "Luxury Accessories": { filters: ["Brand", "Material", "Gender", "Authenticity", "Others"], stockTypes: ["Piece", "Box"] }, "Precious Materials & Gems": { filters: ["Type", "Carat", "Clarity", "Certification", "Others"], stockTypes: ["Gram", "Piece"] }
        }
    }, "Electronics & Teknoloji (Tech)": {
        icon: "",
        subcategories: { "Mobile Phones": { filters: ["Brand", "Model", "RAM", "Storage", "Battery", "Others"], stockTypes: ["Piece", "Box"] }, "Computers & Laptops": { filters: ["Brand", "Processor", "RAM", "Storage", "Graphics", "Others"], stockTypes: ["Piece", "Box"] }, "TVs & Displays": { filters: ["Brand", "Size", "Resolution", "Smart Features", "Others"], stockTypes: ["Piece", "Box"] }, "Audio Devices": { filters: ["Brand", "Type", "Connectivity", "Battery", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Gaming Devices": { filters: ["Brand", "Console Type", "Storage", "Condition", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Office Technology": { filters: ["Brand", "Type", "Connectivity", "Color Support", "Others"], stockTypes: ["Piece", "Box"] }
        }
    }, "Samani na Nyumbani (Home)": {
        icon: "",
        subcategories: { "Furniture": { filters: ["Material", "Size", "Color", "Assembly Type", "Others"], stockTypes: ["Piece", "Set"] }, "Bedroom Essentials": { filters: ["Size", "Material", "Thickness", "Color", "Others"], stockTypes: ["Piece", "Set", "Pack"] }, "Kitchen & Dining": { filters: ["Material", "Capacity", "Set Type", "Brand", "Others"], stockTypes: ["Piece", "Set", "Pack"] }, "Home Appliances": { filters: ["Brand", "Power", "Capacity", "Warranty", "Others"], stockTypes: ["Piece", "Box"] }, "Home Decor": { filters: ["Style", "Color", "Material", "Size", "Others"], stockTypes: ["Piece", "Set"] }, "Storage & Organization": { filters: ["Material", "Size", "Capacity", "Others"], stockTypes: ["Piece", "Pack"] }
        }
    }, "Ujenzi na Hardware (Hardware)": {
        icon: "",
        subcategories: { "Building Materials": { filters: ["Type", "Grade", "Dimensions", "Others"], stockTypes: ["Piece", "Ton", "Truck Load", "Bag", "Cubic Meter"] }, "Cement & Concrete": { filters: ["Brand", "Weight", "Strength Grade", "Others"], stockTypes: ["Bag", "Ton"] }, "Tools & Equipment": { filters: ["Brand", "Power Type", "Size", "Warranty", "Others"], stockTypes: ["Piece", "Set", "Box"] }, "Electrical Supplies": { filters: ["Brand", "Voltage", "Type", "Amperage", "Others"], stockTypes: ["Piece", "Roll", "Box"] }, "Plumbing Supplies": { filters: ["Brand", "Material", "Size", "Pressure", "Others"], stockTypes: ["Piece", "Roll"] }, "Paints & Chemicals": { filters: ["Brand", "Color", "Volume", "Finish", "Others"], stockTypes: ["Can", "Bucket", "Litre"] }
        }
    }, "Magari na Vyombo (Automotive)": {
        icon: "",
        subcategories: { "Vehicles": { filters: ["Brand", "Model", "Year", "Fuel Type", "Transmission", "Others"], stockTypes: ["Unit"] }, "Spare Parts": { filters: ["Car Model", "Part Name", "Part Number", "OEM/Aftermarket", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Tyres & Wheels": { filters: ["Size", "Width", "Brand", "Vehicle Type", "Others"], stockTypes: ["Piece", "Pair", "Set"] }, "Batteries & Electrical": { filters: ["Brand", "Voltage", "Capacity", "Warranty", "Others"], stockTypes: ["Piece", "Box"] }, "Lubricants & Fluids": { filters: ["Brand", "Viscosity", "Volume", "Engine Type", "Others"], stockTypes: ["Bottle", "Litre", "Can"] }
        }
    }, "Vitabu na Elimu (Education)": {
        icon: "",
        subcategories: { "Books & Publications": { filters: ["Author", "Publisher", "Edition", "Language", "Subject", "Others"], stockTypes: ["Piece", "Box"] }, "School Supplies": { filters: ["Age Group", "Size", "Color", "Material", "Others"], stockTypes: ["Piece", "Set", "Pack"] }, "Office Stationery": { filters: ["Brand", "Type", "Color", "Others"], stockTypes: ["Piece", "Pack", "Box"] }, "Printing & Paper Products": { filters: ["Brand", "Size", "GSM", "Quantity", "Others"], stockTypes: ["Pack", "Box", "Ream"] }, "Educational Tools": { filters: ["Subject", "Material", "Age Group", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Michezo na Mazoezi (Sports)": {
        icon: "",
        subcategories: { "Sports Equipment": { filters: ["Sport Type", "Size", "Material", "Brand", "Others"], stockTypes: ["Piece", "Set"] }, "Fitness & Gym": { filters: ["Weight", "Resistance", "Material", "Brand", "Others"], stockTypes: ["Piece", "Set", "Pair"] }, "Outdoor & Camping": { filters: ["Capacity", "Waterproof", "Material", "Brand", "Others"], stockTypes: ["Piece", "Set"] }, "Sportswear": { filters: ["Size", "Gender", "Material", "Brand", "Sport Type", "Others"], stockTypes: ["Piece", "Set", "Pair"] }, "Accessories": { filters: ["Brand", "Type", "Material", "Others"], stockTypes: ["Piece", "Pack"] }
        }
    }, "Vichezeo na Michezo (Toys)": {
        icon: "",
        subcategories: { "Toys": { filters: ["Age Group", "Material", "Battery Operated", "Brand", "Others"], stockTypes: ["Piece", "Box"] }, "Games": { filters: ["Players Count", "Age Group", "Game Type", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Puzzles & Brain Games": { filters: ["Piece Count", "Difficulty", "Age Group", "Material", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Collectibles & Models": { filters: ["Scale Size", "Material", "Brand", "Condition", "Others"], stockTypes: ["Piece", "Box"] }, "Creative Kits": { filters: ["Skill Level", "Material", "Age Group", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Sauti na Muziki (Music)": {
        icon: "",
        subcategories: { "Musical Instruments": { filters: ["Type", "Size", "Material", "Brand", "Skill Level", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Audio Systems": { filters: ["Power Output", "Connectivity", "Channel Type", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Studio & Recording": { filters: ["Type", "Frequency", "Connectivity", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "DJ Equipment": { filters: ["Channels", "Connectivity", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }
        }
    }, "Sanaa na Ubunifu (Arts)": {
        icon: "",
        subcategories: { "Drawing & Painting": { filters: ["Medium", "Brand", "Size", "Quality", "Others"], stockTypes: ["Piece", "Set", "Pack"] }, "Craft Materials": { filters: ["Material", "Color", "Size", "Brand", "Others"], stockTypes: ["Piece", "Pack", "Roll"] }, "Art Tools": { filters: ["Tool Type", "Material", "Size", "Brand", "Others"], stockTypes: ["Piece", "Set"] }, "DIY Kits": { filters: ["Skill Level", "Age Group", "Brand", "Others"], stockTypes: ["Piece", "Set"] }, "Decorative": { filters: ["Material", "Size", "Theme", "Handmade", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Dini na Utamaduni (Religion)": {
        icon: "",
        subcategories: { "Religious Books": { filters: ["Religion", "Language", "Publisher", "Others"], stockTypes: ["Piece", "Box"] }, "Worship Items": { filters: ["Religion", "Material", "Size", "Handmade", "Others"], stockTypes: ["Piece", "Set"] }, "Clothing & Accessories": { filters: ["Religion", "Gender", "Size", "Material", "Others"], stockTypes: ["Piece", "Set", "Pair"] }, "Ritual & Ceremonial": { filters: ["Culture", "Material", "Usage", "Handmade", "Others"], stockTypes: ["Piece", "Set"] }, "Cultural Artifacts": { filters: ["Culture", "Material", "Age", "Handmade", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Zawadi na Sherehe (Gifts)": {
        icon: "",
        subcategories: { "Gifts": { filters: ["Occasion", "Gender", "Age Group", "Personalization", "Others"], stockTypes: ["Piece", "Set", "Box"] }, "Flowers": { filters: ["Flower Type", "Color", "Size", "Others"], stockTypes: ["Piece", "Bouquet", "Set"] }, "Party Supplies": { filters: ["Occasion", "Color", "Material", "Quantity", "Others"], stockTypes: ["Piece", "Pack", "Set"] }, "Celebration Decorations": { filters: ["Event Type", "Material", "Size", "Others"], stockTypes: ["Piece", "Set"] }, "Greeting Cards": { filters: ["Occasion", "Language", "Customizable", "Others"], stockTypes: ["Piece", "Pack"] }
        }
    }, "Pet Products (Pet)": {
        icon: "",
        subcategories: { "Pet Food": { filters: ["Animal Type", "Age Stage", "Brand", "Weight", "Others"], stockTypes: ["Kg", "Packet", "Box"] }, "Pet Health": { filters: ["Animal Type", "Usage", "Prescription", "Brand", "Others"], stockTypes: ["Piece", "Bottle", "Pack"] }, "Pet Accessories": { filters: ["Animal Type", "Size", "Material", "Brand", "Others"], stockTypes: ["Piece", "Pack"] }, "Pet Housing": { filters: ["Animal Type", "Size", "Material", "Others"], stockTypes: ["Piece", "Set"] }, "Live Pets": { filters: ["Animal Type", "Breed", "Age", "Gender", "Health", "Others"], stockTypes: ["Piece"] }
        }
    }, "Vifungashio na Printi (Packaging)": {
        icon: "",
        subcategories: { "Packaging Materials": { filters: ["Material", "Size", "Thickness", "Recyclable", "Others"], stockTypes: ["Piece", "Pack", "Box", "Roll"] }, "Printing Materials": { filters: ["Printing Type", "Size", "Brand", "Others"], stockTypes: ["Pack", "Box", "Roll"] }, "Labelling & Branding": { filters: ["Label Type", "Adhesive", "Waterproof", "Customizable", "Others"], stockTypes: ["Piece", "Pack", "Roll"] }, "Packaging Machines": { filters: ["Power Type", "Capacity", "Speed", "Brand", "Others"], stockTypes: ["Piece", "Box"] }, "Industrial Wrapping": { filters: ["Material", "Thickness", "Size", "Others"], stockTypes: ["Piece", "Roll"] }
        }
    }, "Ulinzi na Usalama (Safety)": {
        icon: "",
        subcategories: { "Personal Safety": { filters: ["Protection Level", "Material", "Size", "Certification", "Others"], stockTypes: ["Piece", "Pair", "Pack"] }, "Home Security": { filters: ["System Type", "Connectivity", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Surveillance": { filters: ["Resolution", "Night Vision", "Connectivity", "Brand", "Others"], stockTypes: ["Piece", "Box", "Set"] }, "Fire Safety": { filters: ["Fire Class", "Capacity", "Brand", "Others"], stockTypes: ["Piece", "Box"] }, "Security Tools": { filters: ["Lock Type", "Material", "Brand", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Biashara ya Jumla (Wholesale)": {
        icon: "",
        subcategories: { "Bulk Food": { filters: ["Unit Type", "Weight", "Grade", "Origin", "Others"], stockTypes: ["Sack", "Bag", "Ton"] }, "Industrial Bulk": { filters: ["Measurement", "Weight", "Grade", "Industry", "Others"], stockTypes: ["Ton", "Bag", "Truck Load"] }
        }
    }, "Maagizo ya Nje (Import/Export)": {
        icon: "",
        subcategories: { "Container Goods": { filters: ["Country", "Container Type", "Duty Status", "Others"], stockTypes: ["Container", "Pallet", "Crate"] }
        }
    }, "Vitu vya Kale na Thamani (Antiques)": {
        icon: "",
        subcategories: { "Antiques": { filters: ["Age", "Rarity", "Origin", "Condition", "Others"], stockTypes: ["Piece", "Set"] }
        }
    }, "Mchanganyiko (General Merchandise)": {
        icon: "",
        subcategories: { "Mixed Retail": { filters: ["Category", "Brand", "Usage", "Others"], stockTypes: ["Piece", "Box", "Pack"] }
        }
    }, "Asili na Utamaduni (Traditional)": {
        icon: "",
        subcategories: { "Traditional Furniture": { filters: ["Aina ya Mbao", "Size", "Handmade", "Others"], stockTypes: ["Piece", "Set"] }, "Honey & Bee Products": { filters: ["Aina ya Asali", "Origin", "Weight", "Organic", "Others"], stockTypes: ["Bottle", "Kg", "Tin"] }, "Traditional Farm": { filters: ["Origin", "Msimu", "Organic", "Weight", "Others"], stockTypes: ["Kg", "Bag", "Sack"] }, "Handicrafts": { filters: ["Material", "Origin", "Handmade", "Size", "Others"], stockTypes: ["Piece", "Set"] }, "Building Materials": { filters: ["Length", "Weight", "Origin", "Material", "Others"], stockTypes: ["Piece", "Roll", "Truck Load"] }, "Cultural Wear": { filters: ["Type", "Gender", "Material", "Others"], stockTypes: ["Piece", "Pair", "Set"] }
        }
    }
};

skh.activeMarketMode = "all_modes";

skh.MY_ADMIN_EMAIL = "rshabansaid@gmail.com";

skh.applyModeUI = function applyModeUI() {
    const buyerView = document.getElementById('buyerView'); 
    const dashView = document.getElementById('dashboardViews');
    
    // Funga drawer ya dashboard (sidebar) ikiwa wazi — ili isikwame kwenye simu
    const openSidebar = document.querySelector('.ct-sidebar.active');
    if (openSidebar) openSidebar.classList.remove('active');
    
    // Mitambo ya kuficha/kuonyesha upau wa juu na chini wa Soko Kuu
    const sokoHeader = document.querySelector('.sticky-top-section');
    const sokoFooter = document.querySelector('.bottom-area-wrapper');
    const locationBar = document.getElementById('locationFilterBar');
    
    if (skh.currentMode === 'buyer') {
        // Onyesha Soko la kawaida na kadi zake zote
        if (buyerView) buyerView.style.display = 'block'; 
        if (dashView) dashView.style.display = 'none'; 
        if (sokoHeader) sokoHeader.style.display = 'flex';
        if (sokoFooter) sokoFooter.style.display = 'flex';
        if (locationBar) locationBar.style.display = 'flex';
        if (typeof window.setSellFab === 'function') window.setSellFab(true);
        skh.loadMainFeed(skh.currentFeedCollection);
    } else {
        // Ficha kabisa soko la kawaida lisianze kuingiliana na Dashboard ya siri
        if (buyerView) buyerView.style.display = 'none'; 
        if (dashView) dashView.style.display = 'block'; 
        if (sokoHeader) sokoHeader.style.display = 'none';
        if (sokoFooter) sokoFooter.style.display = 'none';
        if (locationBar) locationBar.style.display = 'none';
        // Kitufe cha "+" hakiwepo kwenye kurasa zisizo za mbele (Usimamizi n.k.)
        if (typeof window.setSellFab === 'function') window.setSellFab(false);
        
        // Swichi sahihi kuelekea Dashboard husika (kilicho na dashbodi yake maalum)
        if(skh.currentMode === 'admin') { 
            window.loadAdminDashboard(); 
        } else if(skh.currentMode === 'agent') { 
            window.loadAgentDashboard(); 
        } else if(skh.currentMode === 'seller') { 
            window.loadAndRenderDashboard(); // Control Tower ya muuzaji wa duka tu
        } else if(skh.currentMode === 'driver') {
            window.loadDriverDashboard(); // Dashboard maalum ya Dereva
        } else if(skh.currentMode === 'provider') {
            window.loadProviderDashboard(); // Dashboard maalum ya Fundi/Mtoa Huduma
        }
    }
    window.scrollTo({top: 0, behavior: 'smooth'});
}

skh.dashUnsubscribe = null;

skh.appStartTime = Date.now();

skh.dpu = document.getElementById('dpUploadInput');

skh.navMap = { 'home': { dbCollection: 'all', title: ' Uwanja wa Mchanganyiko' }, 'bidhaa': { dbCollection: 'products', title: ' Bidhaa Zote Sokoni' }, 'services': { dbCollection: 'services', title: ' Wataalamu na Huduma' }, 'delivery': { dbCollection: 'drivers', title: ' Vyombo vya Usafiri na Mizigo' }
    };

skh.mm = document.getElementById('mainMenu');

skh.imgWrapper = document.getElementById('pmImgWrapper');

skh.pmImage = document.getElementById('pmImg');

skh.imgScale = 1;
skh.panning = false;
skh.pointX = 0;
skh.pointY = 0;
skh.startX = 0;
skh.startY = 0;
skh.pinchStartDist = 0;
skh.initialScale = 1;

skh.setImgTransform = function setImgTransform() { 
        if(skh.pmImage) skh.pmImage.style.transform = `translate(${skh.pointX}px, ${skh.pointY}px) scale(${skh.imgScale})`; 
    }

skh.activeProductUnsubscribe = null;

skh.calculateDynamicPrice = function calculateDynamicPrice() {
    if(!skh.currentOpenProduct) return;
    
    const qtyInput = document.getElementById('pmQty');
    const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
    
    //  Angalia kama kuna bei ya saizi ya XXL iliyoshikiliwa
    let basePrice = skh.currentOpenProduct.tempVariantPrice || parseFloat(skh.currentOpenProduct.price) || 0;
    let finalPricePerItem = basePrice;

    const mode = skh.currentOpenProduct.saleMode || 'free_market';
    const mData = skh.currentOpenProduct.modeData || {};

    if (mode === 'wholesale' || mode === 'group_buy') {
        const discountVal = parseFloat(mData.discountValue) || 0;
        const discountType = mData.discountType || 'amount'; 
        const extraItems = qty - 1; 

        if (extraItems > 0) {
            if(discountType === 'percent') {
                let totalDiscountPercent = discountVal * extraItems;
                if(totalDiscountPercent > 90) totalDiscountPercent = 90; 
                finalPricePerItem = basePrice - (basePrice * (totalDiscountPercent / 100));
            } else {
                let totalDiscountAmount = discountVal * extraItems;
                finalPricePerItem = basePrice - totalDiscountAmount;
                if(finalPricePerItem < (basePrice * 0.1)) finalPricePerItem = basePrice * 0.1; 
            }
        }
    }

    const totalCost = finalPricePerItem * qty;
    
    const pmPriceEl = document.getElementById('pmPrice');
    // [SHOWCASE 39] Tumia kipimo halisi (kg, lita, pisi, …) cha muuzaji
    const _unit = (skh.currentOpenProduct && skh.currentOpenProduct.baseUnit) ? String(skh.currentOpenProduct.baseUnit) : 'Pc';
    if(pmPriceEl) pmPriceEl.innerText = `TSh ${finalPricePerItem.toLocaleString()} / ${_unit}`;
    
    const pmTotalEl = document.getElementById('pmTotalPriceCalc');
    if(pmTotalEl) pmTotalEl.innerText = `TSh ${totalCost.toLocaleString()}`;
    
    skh.currentOpenProduct.calculatedTotalCost = totalCost;
    skh.currentOpenProduct.selectedQty = qty;
}

skh.loadRelatedProducts = async function loadRelatedProducts(category, excludeId, colToUse) {
        // Tengeneza div ya related products kama haipo
        let relContainer = document.getElementById('pmRelatedProducts');
        if(!relContainer) {
            relContainer = document.createElement('div');
            relContainer.id = 'pmRelatedProducts';
            const commentsSec = document.querySelector('#productModal .comments-section');
            if (commentsSec) commentsSec.insertAdjacentElement('beforebegin', relContainer);
            else relContainer = null;
        }
        if(!relContainer) return;

        relContainer.innerHTML = `<h4 style="margin:20px 0 10px; color:var(--primary-dark); font-size:14px; text-transform:uppercase; display:flex; align-items:center; gap:6px;"> Wauzaji Wengine <span style="font-size:12.5px; color:#64748b; font-weight:600; text-transform:none;">(zinaweza kukufaa)</span></h4><div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px;" id="pmRelatedScroll"> Inatafuta...</div>`;

        // [WAUZAJI] 1. Tumia cache iliyopo (haraka & bila mtandao) kwanza
        let related = [];
        try {
            const cache = skh.cachedItems || [];
            const col = colToUse || skh.currentFeedCollection || 'products';
            related = cache.filter(it => it && it.id !== excludeId && (it.collectionName || col) === col);
            if (category) {
                const catMatch = related.filter(it => (it.category || '') === category || (it.subCategory || '') === category);
                if (catMatch.length > 0) related = catMatch;
            }
        } catch(e) { related = []; }

        const renderCards = (items) => {
            let html = '';
            items.forEach(d => {
                const img = skh.getOptimizedImageUrl(d.image || d.photo || 'https://via.placeholder.com/150');
                const title = d.title || d.driverName || d.company || 'Tangazo';
                html += `
                    <div onclick="openProduct('${skh.skhEscape(d.id)}', '${skh.skhEscape(d.collectionName || colToUse || 'products')}')" style="min-width:130px; max-width:150px; background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.04);"> <img src="${skh.skhEscape(img)}" style="width:100%; height:90px; object-fit:cover; background:#f1f5f9;" onerror="this.src=window.SKH_PLACEHOLDER_IMG||'https://ui-avatars.com/api/?name=Soko&background=f1f5f9&color=64748b'"> <div style="padding:8px;"> <b style="font-size:13px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${skh.skhEscape(title)}</b> <span style="color:var(--terracotta); font-size:12px; font-weight:900;">TSh ${(d.price||0).toLocaleString()}</span> </div> </div> `;
            });
            return html || '<p style="font-size:12px; color:#64748b;">Hakuna matangazo mengine bado.</p>';
        };

        const scrollEl = document.getElementById('pmRelatedScroll');
        if (related.length > 0) { scrollEl.innerHTML = renderCards(related.slice(0, 8)); return; }

        // [WAUZAJI] 2. Fallback: vuta kutoka Firestore (bidhaa za aina hiyo)
        try {
            const col = colToUse || 'products';
            const q = skh.query(skh.collection(skh.db, col), skh.limit(8));
            const snap = await skh.getDocs(q);
            const docs = [];
            snap.forEach(doc => { if(doc.id !== excludeId) docs.push({ id: doc.id, collectionName: col, ...doc.data() }); });
            scrollEl.innerHTML = renderCards(docs);
        } catch(e) {
            scrollEl.innerHTML = '<p style="font-size:12px; color:#64748b;">Hakuna matangazo mengine bado.</p>';
        }
    }

skh.updateInteractionUI = function updateInteractionUI() {
        if (!skh.currentOpenProduct) return; // Ulinzi ili programu isigome mteja akifungua haraka
        const likes = skh.currentOpenProduct.likes ||[]; 
        const comments = skh.currentOpenProduct.comments ||[]; 
        const shares = skh.currentOpenProduct.shares || 0; 
        const views = skh.currentOpenProduct.views || 0;
        
        const pvc = document.getElementById('pmViewsCount');
        if(pvc) pvc.innerText = views; 
        
        const plc = document.getElementById('pmLikesCount');
        if(plc) plc.innerText = likes.length; 
        
        const pcc = document.getElementById('pmCommentsCount');
        if(pcc) pcc.innerText = comments.length; 
        
        const pctc = document.getElementById('pmCommentsTitleCount');
        if(pctc) pctc.innerText = comments.length; 
        
        const psc = document.getElementById('pmSharesCount');
        if(psc) psc.innerText = shares;


        const btnLike = document.getElementById('btnLike');
// Hapa tunatafuta namba ya Likes iliyo sehemu nyingine (Main Counter)
const mainLikesDisplay = document.getElementById('pmLikesCount');

// [BUYER ENGAGEMENT] Mfumo mpya (28) hudhibiti vitufe vya Like/Follow —
// usigombane nao. Tunabakisha tu update ya namba za likes/comments/views.
if(btnLike && !window.skhEngagementState) {
    // 1. Sasisha rangi ya kitufe
    if(skh.currentUser && likes.includes(skh.currentUser.uid)) { 
        btnLike.classList.add('liked'); 
        btnLike.style.color = "#ef4444"; // Rangi nyekundu akilike
    } else { 
        btnLike.classList.remove('liked'); 
        btnLike.style.color = "var(--primary-dark)"; 
    }

    // 2. Sasisha namba ya Likes (Hapa tunatumia ile ID moja tu iliyobaki)
    if(mainLikesDisplay) {
        mainLikesDisplay.innerText = likes.length;
    }
} else if (mainLikesDisplay) {
    mainLikesDisplay.innerText = likes.length;
}

        const clist = document.getElementById('pmCommentsList');
  if(clist) {
            // Ikiwa hakuna maoni (comments) kabisa
            if(comments.length === 0) { 
                clist.innerHTML = '<p style="font-size:12px; color:#94a3b8; text-align:center; padding:10px;">Hakuna tathmini bado. Kuwa wa kwanza kutoa maoni!</p>'; 
            } else {
                // Hapa ndipo tunatengeneza muonekano wa kila tathmini (Review)
                clist.innerHTML = comments.map(c => {
                    const timeStr = new Date(c.timestamp).toLocaleDateString();
                    
                    // Tengeneza nyota kulingana na namba (1-5)
                    const stars = '<span style="color:#f59e0b;letter-spacing:1px;">' + ''.repeat(Number(c.rating || 0) || 5) + '</span>';

                    // [REVIEWS 2026-09] Badge ya "Umenunua" ni ya server pekee.
                    const badgeHtml = c.verifiedPurchase
                        ? '<span style="display:inline-block;margin:4px 0 2px;font-size:12.5px;font-weight:800;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:99px;padding:2px 8px;"> Umenunua (Verified Purchase)</span>'
                        : '';

                    // Picha na/au video (media array mpya, fallback kwa photo ya zamani)
                    const mediaArr = (c.media && c.media.length) ? c.media : (c.photo ? [c.photo] : []);
                    const mediaHtml = mediaArr.map(u => {
                        const eu = skh.skhEscape(u);
                        if (/\.(mp4|webm|ogg|mov)$/i.test(u) || u.indexOf('/video/upload/') !== -1) {
                            return `<div style="margin-top:8px;"><video src="${eu}" controls style="width:190px;max-width:100%;border-radius:10px;border:1px solid #eee;background:#000;"></video></div>`;
                        }
                        return `<div style="margin-top:8px;"><img src="${eu}" style="width:100px; height:100px; border-radius:10px; object-fit:cover; border: 1px solid #eee; cursor:pointer;" onclick="window.open('${skh.skhJsEsc(u)}','_blank')"></div>`;
                    }).join('');
                    
                    return `
                        <div class="comment-box" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:12px; border:1px solid #f1f5f9;"> <div class="comment-head">
                                ${window.skhUserAvatar ? window.skhUserAvatar(c.authorPhoto, c.authorName || 'Mteja', 34) : ''}
                                <div style="flex:1; min-width:0;"> <b style="font-size:13px; color:var(--primary-dark); display:block;">${skh.skhEscape(c.authorName || 'Mteja')}</b> <span style="font-size:12.5px; color:#94a3b8;">${timeStr}</span>
                                    ${badgeHtml}
                                </div> </div> <div style="font-size:12.5px; margin:6px 0 5px;">${stars}</div> <p style="margin:0; font-size:13px; color:#475569; line-height:1.4;">${skh.skhEscape(c.text || c.comment || '')}</p>
                            ${mediaHtml}
                        </div>`;
                }).join('');
                
                // Sukuma list iende chini kabisa maoni mapya yaonekane
                clist.scrollTop = clist.scrollHeight; 
            }
        }
        const btnF = document.getElementById('btnFollow');
        // [BUYER ENGAGEMENT] Follow hudhibitiwa na mfumo mpya (28)
        if(btnF && !window.skhEngagementState) {
            if(skh.currentUser && skh.currentUserData && skh.currentUserData.following && skh.currentUserData.following.includes(skh.currentOpenProduct.userId)) { 
                btnF.innerText = "Following"; 
                btnF.className = "follow-btn btn-following"; 
            } else { 
                btnF.innerText = "Follow"; 
                btnF.className = "follow-btn btn-not-following"; 
            }
            
            if(skh.currentUser && skh.currentUser.uid === skh.currentOpenProduct.userId) { 
                btnF.style.display = 'none'; 
            } else { 
                btnF.style.display = 'flex'; 
            }
        } else if (btnF) {
            if(skh.currentUser && skh.currentUser.uid === skh.currentOpenProduct.userId) btnF.style.display = 'none';
            else btnF.style.display = 'flex';
        }
    }

skh.updateCartUI = function updateCartUI() { 
        const badge = document.getElementById('cartBadge'); 
        if(!badge) return;
        if(skh.myCart.length > 0) { 
            badge.style.display = 'flex'; 
            badge.innerText = skh.myCart.length; 
        } else { 
            badge.style.display = 'none'; 
        } 
    }

skh.chatUnsubscribe = null;

skh.listenToChats = function listenToChats(receiverEmail, receiverUid) {
    const chatDiv = document.getElementById('chatMessages'); 
    if(!chatDiv) return;
    
    // [FIX] Usalama: mtu akiwa hajaingia, onyesha ujumbe mzuri badala ya error
    if(!skh.currentUser || !skh.currentUser.uid) {
        chatDiv.innerHTML = '<p style="text-align:center; color:#64748b; padding:30px 10px; font-size:13px;">ingia kwenye akaunti yako kwanza ili kuona meseji.</p>';
        return;
    }
    // [NEGO DIALOGUE FIX 2026-09] Injini mpya ya chat (34-chat-core, mkusanyiko
    // `conversations`) inamiliki #chatMessages kwa mazungumzo mapya — pamoja na
    // kadi za negotiation zenye vitufe vya upande wa muuzaji. Mzishi wa zamani
    // wa mkusanyiko `chats` USIFUTE mtiririko mpya (ulighushi tatizo la
    // "muuzaji haoni vitufe" baada ya snapshot kuchorwa).
    if (skh.chatCore && skh.chatCore.convId) return;
    const myEmail = (skh.currentUser.email || '').toLowerCase();
    const myUid = skh.currentUser.uid;
    
    const q = skh.query(skh.collection(skh.db, "chats"), skh.orderBy("createdAt", "asc"), skh.limit(80));
    if(skh.chatUnsubscribe) { try { skh.chatUnsubscribe(); } catch(e){} }
    
    chatDiv.innerHTML = '<p style="text-align:center; color:#667781; padding:30px 10px; font-size:13px;">Inapakia meseji...</p>';
    
    skh.chatUnsubscribe = skh.onSnapshot(q, (snapshot) => {
        let html = '<div style="text-align:center; font-size:13px; color:#64748b; margin-bottom:20px; background:white; padding:5px 15px; border-radius:20px; align-self:center; box-shadow:0 1px 3px rgba(0,0,0,0.05);"> Mawasiliano yako yanalindwa na Sokohai E2E.</div>';
        let msgCount = 0;
        
        snapshot.forEach((doc) => {
            const msg = doc.data();
            if(!msg) return;
            // Tunachuja meseji zetu na huyu mtu tu — kwa uid (mpya) au email (za zamani)
            const sUid = msg.senderUid, rUid = msg.receiverUid;
            const sEmail = (msg.sender || '').toLowerCase(), rEmail = (msg.receiver || '').toLowerCase();
            const mineToTheirs = (sUid && rUid) ? (sUid === myUid && rUid === receiverUid)
                : (sEmail === myEmail && rEmail === receiverEmail);
            const theirsToMine = (sUid && rUid) ? (rUid === myUid && sUid === receiverUid)
                : (rEmail === myEmail && sEmail === receiverEmail);
            if(mineToTheirs || theirsToMine) {
                const isMe = (msg.senderUid ? msg.senderUid === myUid : sEmail === myEmail); 
                const rawText = (msg.text == null) ? '' : String(msg.text);
                let displayTxt = skh.skhEscape(rawText); // [PHASE 4.5] XSS-safe
                msgCount++;

                // Tengeneza Kikadi cha bidhaa ndani ya chat — linki la kwenda kwenye bidhaa/stoo
                let productCardHTML = '';
                if(msg.productId) {
                    const pImg = skh.skhEscape(msg.productImg || (window.SKH_PLACEHOLDER_IMG || ''));
                    const pTitle = skh.skhEscape(msg.productTitle || 'Bidhaa');
                    const pIdJs = skh.skhJsEsc(msg.productId || '');
                    const pCollJs = skh.skhJsEsc(msg.productCollection || '');
                    const pSellerJs = skh.skhJsEsc(msg.sellerUid || msg.ownerUid || '');
                    productCardHTML = `
                    <div class="chat-product-card" onclick="window.skhOpenChatProduct('${pIdJs}', '${pCollJs}', '${pSellerJs}')"> <img src="${pImg}" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||'';"> <div class="cpc-info"> <span class="cpc-title">${pTitle}</span> <span class="cpc-link"> Nenda kwenye bidhaa →</span> </div> </div>`;
                }

                if(rawText.startsWith(" Attachment:")) {
                    // [PHASE 4.5] Sanitizer: linki halali ya https pekee (bila quotes/spaces)
                    const rawUrl = String(rawText.replace(" Attachment: ", ""));
                    const url = /^https:\/\/[^\s"'<>]+$/.test(rawUrl) ? rawUrl : '#';
                    if(url.match(/\.(jpeg|jpg|gif|png)$/i) || url.includes("/image/upload/")) { 
                       displayTxt = `<img src="${url}" style="max-width:100%; max-height:250px; object-fit:cover; border-radius:12px; margin-top:5px; cursor:pointer; border:1px solid rgba(0,0,0,0.1);" onclick="window.open('${url}','_blank')">`; 
                    } else if (url.match(/\.(mp4|webm|ogg)$/i) || url.includes("/video/upload/")) { 
                        displayTxt = `<video src="${url}" controls style="max-width:100%; border-radius:12px; margin-top:5px;"></video>`; 
                    } else { 
                        displayTxt = ` <a href="${url}" target="_blank" style="color:${isMe?'white':'var(--primary-dark)'}; text-decoration:underline; font-weight:bold;">Pakua Faili</a>`; 
                    }
                }
                
                // Unganisha kikadi cha bidhaa na maneno
                html += `<div class="chat-bubble ${isMe ? 'me' : 'them'}">${productCardHTML}${displayTxt}</div>`;
            }
        });
        if(msgCount === 0) {
            html += '<p style="text-align:center; color:#667781; font-size:13px; margin-top:16px;">Hamna meseji bado. Anza mazungumzo hapa chini.</p>';
        }
        chatDiv.innerHTML = html; 
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }, (err) => {
        // [FIX] Error wakati wa kupakia ujumbe — onyesha ujumbe mzuri, usifanye ukurasa ukwame
        console.error('Chat load error:', err && err.message ? err.message : err);
        chatDiv.innerHTML = '<p style="text-align:center; color:#b91c1c; padding:30px 10px; font-size:13px;">Imeshindwa kupakia meseji. jaribu tena au angalia muunganisho wako.</p>';
    });
}

skh.isRecording = false;

// [DUPLICATE FIX 2026-09] skh.updateSliders ya zamani imeondolewa KABISA —
// ilikuwa inachanganya boosted na non-boosted (`filter(d=>d.isBoosted).concat(...)`),
// ikitengeneza kadi MBOJEA (duplicates) kwenye Zinazovuma/Karibu Nawe/Zinazotafutwa.
// Hakuna aliyekuwa anaiita (dead code), hivyo kuiondoa ni salama.

skh.setLoading = function setLoading(btnId, isLoading, defaultText) {
        const btn = document.getElementById(btnId); 
        if(!btn) return;
        if(isLoading) { 
            btn.disabled = true; 
            btn.style.opacity = '0.7'; 
            btn.innerHTML = ' Inapakia...'; 
        } else { 
            btn.disabled = false; 
            btn.style.opacity = '1'; 
            btn.innerHTML = defaultText; 
        }
    }

// [AUTO-LOGIN §15–§17 — ROOT CAUSE] Firebase Auth ina default persistence
// (local) — session hupatikana baada ya refresh/browser-restart. Tatizo liko
// hapa: requireAuth() inaitwa na maelfanya UX (modal action, click) na inaweza
// kufungua login modal Kabla ya onAuthStateChanged ya kwanza kumaliza
// kuponya session — mtumiaji aliyeingia anaambiwa "Ingia" bure. Bendera hii
// inakuwa TRUE tu baada ya callback ya kwanza (user au null, zote ni halali).
skh.__authResolved = false;
try {
    if (skh.onAuthStateChanged && skh.auth) {
        skh.onAuthStateChanged(skh.auth, function () { skh.__authResolved = true; });
    } else {
        skh.__authResolved = true; // hakuna auth (mf. failed init) — usizuie UI
    }
} catch (e) { skh.__authResolved = true; }

skh.requireAuth = function requireAuth() { 
        if(!skh.currentUser) { 
            // [AUTO-LOGIN §16] Usizindue login modal bila mpango kabla Firebase
            // haijamaliza kuponya session iliyohifadhiwa. Subiri resolution;
            // baada yake kumpata null, wito unaofuata utafungua modal.
            if (skh.__authResolved === false) {
                if (typeof window.skhToast === 'function') {
                    window.skhToast('Inathibitisha akaunti yako… jaribu tena baada ya sekunde chache.', 'info', 2600);
                }
                return false; 
            }
            openAuthModal(); 
            alert(" Ingia (Login) au Jisajili kwanza!"); 
            return false; 
        } 
        return true; 
    }

skh.getOptimizedImageUrl = function getOptimizedImageUrl(url) { 
        if(!url || !url.includes("cloudinary.com")) return url; 
        return url.replace("/upload/", "/upload/w_600,h_600,c_fit,q_auto,f_auto/"); // [PHASE 6.0] c_fit: picha NZIMA (c_fill ilikuwa inakata)
    }

// ============================================================
// [DP-EVERYWHERE] Avatari za watumiaji — zionekane KILA MAHALI
// (chat, inbox, maoni, SokoPay...), si kwenye bidhaa tu.
// Picha halisi ikiwepo; la sivyo tile ya herufi ya kwanza (SVG,
// haihitaji mtandao — haivunji kwenye mitandao ya kawaida ya TZ).
// ============================================================
window.skhInitialAvatar = function(name) {
    const ch = ((name && String(name).trim().charAt(0)) || 'S').toUpperCase();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
        + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        + '<stop offset="0" stop-color="#00509d"/><stop offset="1" stop-color="#0ea5e9"/>'
        + '</linearGradient></defs>'
        + '<rect width="100" height="100" fill="url(#g)"/>'
        + '<text x="50" y="50" dy="0.36em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="bold" fill="#ffffff">' + ch + '</text>'
        + '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

window.skhUserAvatar = function(url, name, size) {
    size = size || 40;
    const clean = url && !/ui-avatars\.com/.test(String(url)) ? String(url) : '';
    const src = clean ? skh.getOptimizedImageUrl(clean) : window.skhInitialAvatar(name);
    const fb = window.skhInitialAvatar(name);
    return '<img src="' + skh.skhEscape(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" '
        + 'style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;background:#e2e8f0;flex-shrink:0;display:inline-block;" '
        + 'onerror="this.onerror=null;this.src=\'' + fb + '\';"/>';
};

// Wakati mfupi wa mazungumzo kwenye orodha ya mawasiliano ("09:41", "Jana", "12 Mei").
window.skhChatTime = function(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            const h = d.getHours(), m = d.getMinutes();
            return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
        }
        const yest = new Date(now); yest.setDate(now.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return 'Jana';
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
};

skh.uploadImage = async function uploadImage(inputId) { 
        return window.skhUploadFromInput(inputId); 
    }

skh.uploadMultipleImages = async function uploadMultipleImages(inputId) {
        return window.skhUploadManyFromInput(inputId, 4);
    }

skh.saveData = async function saveData(col, data) { 
    if(!skh.requireAuth()) return null; 
    /* [FIX 2026-09-15] Kinga ya jumla: Firestore hukataa `undefined`.
       Ondoa funguo zenye undefined kabla ya kuandika — hii inazuia
       "Unsupported field value" kwenye KILA fomu ya kupakia. */
    function stripUndefined(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(stripUndefined);
        var out = {};
        Object.keys(obj).forEach(function (k) {
            var v = obj[k];
            if (v === undefined) return;                 // ruka
            out[k] = (v && typeof v === 'object' && !(v instanceof Date)) ? stripUndefined(v) : v;
        });
        return out;
    }

    try { 
        // Angalia kama kuna usimamizi wa offline user ulio hai
        const managedUid = sessionStorage.getItem('currently_managed_offline_uid');
        const managedName = sessionStorage.getItem('currently_managed_offline_name');
        const managedShop = sessionStorage.getItem('currently_managed_offline_shop');

        /* [FIX OWNERSHIP 2026-09-15]
           Mabug mawili yaliyokuwepo hapa:
           1) `userEmail: offline_xxx@sokohai.com` — EMAIL YA UONGO. Spec §5
              inakataza waziwazi. Offline member anaweza kukosa email;
              utambulisho wake wa msingi ni NAMBA YA SIMU.
           2) `ownerName: managedShop || currentUser.displayName` — ikiwa jina
              la duka halijawekwa, jina la WAKALA lilikuwa linakuwa mmiliki.
              Spec §3/§9/§22: mmiliki ni MWANACHAMA, wakala ni facilitator.

           Sasa: mmiliki ni mwanachama daima; wakala ni metadata pekee. */
        const ownerIsManaged = !!managedUid;
        const docData = { 
            ...data, 
            userId: managedUid || skh.currentUser.uid, 
            userEmail: ownerIsManaged ? null : skh.currentUser.email, 
            ownerPhone: ownerIsManaged ? (sessionStorage.getItem('currently_managed_offline_phone') || null) : null,
            ownerName: ownerIsManaged
                ? (managedName || managedShop || 'Mwanachama')
                : (managedShop || skh.currentUser.displayName || (skh.currentUser.email || '').split('@')[0]),
            // Uhusiano wa wakala — SI umiliki (§13)
            registeredThroughAgentId: ownerIsManaged ? (skh.currentUser.uid || null) : null,
            /* [FIX 2026-09-15] `undefined` HAIKUBALIKI na Firestore —
               ilikuwa inatupa "Unsupported field value: undefined" na
               kuzuia KUPAKIA huduma/usafiri/bidhaa kabisa.
               Tumia `null` (inakubalika) badala yake. */
            accountType: ownerIsManaged ? 'offline_member' : null,
            createdAt: new Date().toISOString(), 
            status: "active",
            itemCollection: col,
            ...(typeof window.skhAssistMeta === 'function' ? window.skhAssistMeta() : {})
        }; 
        
        // Kama anasimamiwa na agent, mfumo unafunga code ya wakala kwenye bidhaa pia
        if (managedUid && skh.currentUserData?.myAgentCode) {
            docData.agentCode = skh.currentUserData.myAgentCode;
            docData.managedByAgentUid = skh.currentUser.uid;
        }

        const docRef = await skh.addDoc(skh.collection(skh.db, col), stripUndefined(docData));
        // [PERF 2026-09] Kitu kipya kimehifadhiwa -> futa cache ya feed ili
        // tangazo jipya lionekane mara moja (badala ya kusubiri TTL).
        if (skh._feedCache) skh._feedCache.clear();
        // [BUYER ENGAGEMENT] Bidhaa mpya -> price history + arifu followers (fire-and-forget)
        if (col === 'products' && typeof window.skhOnProductPublished === 'function') {
            window.skhOnProductPublished(Object.assign({}, docData, { id: docRef.id }), 'products', docRef.id).catch(() => {});
        }
        return docRef.id;
    } catch(e) { 
        alert("Kosa wakati wa kuhifadhi data: " + e.message); 
        return null; 
    }
}

skh.activeSubCategory = "Zote";

skh.activeFilterValues = {};

skh.activeServiceSection = "all";

skh.activeDeliverySection = "all";

skh.currentLimit = 20;

skh.unsubscribeFeed = null;

skh.activeCategory = "Zote";

skh.searchQuery = "";

skh.searchTimeout = null;

skh.setupLazyLoad = function setupLazyLoad() { 
        const observer = new IntersectionObserver((entries) => { 
            if (entries[0].isIntersecting) { 
                skh.currentLimit += 20; 
                skh.loadMainFeed(skh.currentFeedCollection); 
            } 
        }, { threshold: 0.5 }); 
        
        const trigger = document.getElementById('bottomTrigger'); 
        if(trigger) observer.observe(trigger); 
    }

skh.lastScrollY = window.scrollY;

skh.listenToUnreadNotifications = function listenToUnreadNotifications() {
    if(!skh.currentUser) return;
    const badge = document.getElementById('notifBadge');
    if(!badge) return;

    // Zima listener ya zamani ya notif
    if (skh.notifUnsubscribe) {
        try { skh.notifUnsubscribe(); } catch (e) {}
        skh.notifUnsubscribe = null;
    }

    function showCount(n) {
        if (!n) { badge.style.display = 'none'; badge.innerText = '0'; return; }
        badge.style.display = 'flex';
        badge.innerText = n > 99 ? '99+' : String(n);
    }
    function announceNew(docs) {
        // Mlio mwepesi wa ndani ya programu kwa arifa MPYA zisizosomwa
        // (hupitwa kwenye upakiaji wa kwanza — _notifSeeded hubandika baadae).
        try {
            const ids = docs.map(d => d.id);
            const prev = skh._notifKnownIds || null;
            skh._notifKnownIds = ids;
            if (!prev) return;
            const fresh = docs.filter(d => prev.indexOf(d.id) === -1);
            if (!fresh.length) return;
            const d0 = fresh[0].data() || {};
            const extra = fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' nyingine)' : '';
            if (typeof window.sokohaiToast === 'function') {
                window.sokohaiToast((d0.title || 'Taarifa mpya') + extra, 'info', 4200);
            }
        } catch (e) {}
    }

    function paint(snap) {
        const unread = [];
        snap.forEach(function (d) {
            var data = d.data() || {};
            if (data.read === false) unread.push({ id: d.id, data: data });
        });
        showCount(unread.length);
        announceNew(unread);
    }

    // Swali la msingi: equality+equality haihitaji composite index.
    const q = skh.query(skh.collection(skh.db, "notifications"),
        skh.where("userId", "==", skh.currentUser.uid),
        skh.where("read", "==", false));

    skh.notifUnsubscribe = skh.onSnapshot(q, paint, function (err) {
        // [RESILIENCE 2026-09] Kama index/rule imekataa, angukia swali la
        // usawa MOJA (userId) na chuja kisomaji — beji isikose kamwe.
        console.warn('[notif] listener ya beji imeanguka, fallback:', err && err.code);
        try {
            const q2 = skh.query(skh.collection(skh.db, "notifications"),
                skh.where("userId", "==", skh.currentUser.uid), skh.limit(100));
            skh.notifUnsubscribe = skh.onSnapshot(q2, paint, function () {});
        } catch (e) {}
    });
}

// [PERF 2026-09] Cache fupi (LRU) ya mlisho wa soko. Inazuia kupakua tena
// kila kitu kila wakati mtumiaji anabadili tab (Home->Bidhaa->Home), kuchuja, au
// kila auth-state inapobadilika. Inaisha baada ya dakika 2 na inabebwa kwenye
// kumbukumbu pekee (si disk) — data iko upya kwa kutembelea tena.
skh._feedCache = new Map();       // key -> { data, expiresAt }
skh._feedCacheMax = 24;            // idadi ya juu ya funguo za kuhifadhiwa
skh._feedCacheTTL = 120000;        // ms (dakika 2)
skh._feedCacheKey = function _feedCacheKey(col) {
    const c = col || 'all';
    const mode = skh.activeMarketMode || 'all_modes';
    const cat = (skh.activeCategory && skh.activeCategory !== 'Zote') ? skh.activeCategory : '';
    const sub = (skh.activeSubCategory && skh.activeSubCategory !== 'Zote') ? skh.activeSubCategory : '';
    const sec = (c === 'services') ? (skh.activeServiceSection || 'all')
              : (c === 'drivers') ? (skh.activeDeliverySection || 'all') : 'all';
    return c + '|' + mode + '|' + cat + '|' + sub + '|' + sec;
};
skh._feedCacheGet = function _feedCacheGet(key) {
    const e = skh._feedCache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { skh._feedCache.delete(key); return null; }
    return e.data;
};
skh._feedCacheSet = function _feedCacheSet(key, data) {
    if (!Array.isArray(data)) return;
    if (data.length === 0) return;        // usihifadhi "hakuna matokeo" (inaweza kuwa ya muda)
    skh._feedCache.delete(key);           // weka upya kwenye mwisho (LRU)
    skh._feedCache.set(key, { data: data, expiresAt: Date.now() + skh._feedCacheTTL });
    while (skh._feedCache.size > skh._feedCacheMax) {
        const oldest = skh._feedCache.keys().next().value;
        if (oldest === undefined) break;
        skh._feedCache.delete(oldest);
    }
};

skh.loadMainFeed = function loadMainFeed(collectionToFetch = 'products') {
    const feedGrid = document.getElementById('mainFeed'); 
    if(!feedGrid) return;
    
    // [FIX: bottom nav kupotea] Ukitazama soko (buyer mode), hakikisha upau wa juu,
    // upau wa chini (bottom nav) na upau wa eneo vinabaki vinaonekana — hata wakati
    // wa kuchuja (category/filter), kuchuja haipaswi kuficha bottom nav.
    if (skh.currentMode === 'buyer') {
        const _hdr = document.querySelector('.sticky-top-section');
        const _ftr = document.querySelector('.bottom-area-wrapper');
        const _loc = document.getElementById('locationFilterBar');
        if (_hdr) _hdr.style.display = 'flex';
        if (_ftr) _ftr.style.display = 'flex';
        if (_loc) _loc.style.display = 'flex';
    }
    
    // [BUYER ENGAGEMENT] Pakia hali ya likes/saves + sehemu ya "Recommended for You"
    if (typeof window.skhLoadMyEngagementMap === 'function') window.skhLoadMyEngagementMap();
    if (typeof window.skhRenderPersonalizedFeed === 'function') window.skhRenderPersonalizedFeed();

    // [COMMERCE CARDS 2026-09] Skeleton inayolingana na muundo wa kadi (si spinner tu)
    feedGrid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="feed-card-box skh-card skh-skeleton-card" aria-hidden="true"> <div class="feed-img-box skh-img skeleton"></div> <div class="feed-info-box skh-body"> <div class="skh-sk skh-sk--chip"></div> <div class="skh-sk skh-sk--line" style="width:88%"></div> <div class="skh-sk skh-sk--line" style="width:58%"></div> <div class="skh-sk skh-sk--line" style="width:68%"></div> </div> </div>`).join('');
    
    if(window.unsubscribeFeed) window.unsubscribeFeed();

    // Msaidizi: panga items kwa createdAt (mpya kwanza). Kwenye sort ya browser,
    // bidhaa zisizo na createdAt zinawekwa mwisho — hazifichwi kabisa.
    const tsOf = (v) => {
        if (!v) return 0;
        if (typeof v.toMillis === 'function') return v.toMillis();
        if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
        const t = Date.parse(v);
        return isNaN(t) ? 0 : t;
    };
    const sortByCreated = (arr) => arr.slice().sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
    const showFeedError = (msg) => {
        // [COMMERCE CARDS 2026-09] Usionyeshe hitilafu mbichi ya Firebase/API kwa
        // mtumiaji — iwe kwenye console tu; UI inaonyesha ujumbe mzuri na "Jaribu Tena".
        console.warn('[loadMainFeed] hitilafu ya kupakia soko:', msg);
        feedGrid.innerHTML = `<div class="skh-empty skh-empty--error" style="grid-column:1/-1;"> <span class="skh-empty-icon">${window.skhNavIcon ? window.skhNavIcon('refresh', 26) : ''}</span> <b>Imeshindikana kupakia soko</b> <p>Angalia muunganisho wako wa mtandao kisha ujaribu tena.</p> <button class="skh-empty-btn" onclick="resetAppState(); loadMainFeed('all');">Jaribu Tena</button> </div>`;
    };

    // Kama ni "ALL" (HOME PAGE)
    if (collectionToFetch === 'all') {
        // [FIX 2026-09: BIDHAA MPYA ZILIPOTEA] orderBy("createdAt","desc") ni index ya
        // msingi (auto-index) — haihitaji composite index. Hakikisha MPYA zinaonekana juu.
        // Kila query ina fallback yake (safeSnap) ili kosa la collection MOJA lisifute
        // Home nzima (mf. drivers bila ruhusa zamani ilikuwa inabomoa Promise.all).
        skh.currentFeedCollection = 'all'; // home = mchanganyiko (bidhaa+huduma+usafiri)
        // [PERF 2026-09] Cache: ukurasa tayari umepakuliwa ndani ya dakika 2 —
        // chora mara moja bila kugusa mtandao tena (kasi + offline-friendly).
        const cacheKey = skh._feedCacheKey('all');
        const cached = skh._feedCacheGet(cacheKey);
        if (cached) {
            skh.cachedItems = cached;
            skh.renderFeedUI(cached, feedGrid);
            return;
        }
        const safeSnap = (q) => skh.getDocs(q).catch(() => ({ empty: true, forEach() {}, docs: [] }));
        Promise.all([
            safeSnap(skh.query(skh.collection(skh.db, 'products'), skh.orderBy('createdAt', 'desc'), skh.limit(100))),
            safeSnap(skh.query(skh.collection(skh.db, 'services'), skh.orderBy('createdAt', 'desc'), skh.limit(30))),
            safeSnap(skh.query(skh.collection(skh.db, 'drivers'), skh.orderBy('createdAt', 'desc'), skh.limit(30)))
        ]).then(results => {
            let combinedData = [];
            // Tunazipa bidhaa jina la collection zilikotoka ili App isipotee
            results.forEach((snap, index) => {
                const colNames = ['products', 'services', 'drivers'];
                snap.forEach(doc => {
                    combinedData.push({ id: doc.id, collectionName: colNames[index], ...doc.data() });
                });
            });
            combinedData = sortByCreated(combinedData);
            // Hapa ndipo tunazihifadhi kwenye kumbukumbu ya App
            skh.cachedItems = combinedData;
            skh._feedCacheSet(cacheKey, combinedData);
            skh.renderFeedUI(combinedData, feedGrid);
        }).catch((err) => {
            showFeedError((err && err.message) ? err.message : 'Angalia muunganisho wa mtandao.');
        });
        return;
    }
    // [PERF 2026-09] Cache: rudi kwenye data iliyopo bila kupakua tena.
    const cacheKey = skh._feedCacheKey(collectionToFetch);
    const cached = skh._feedCacheGet(cacheKey);
    if (cached) {
        skh.cachedItems = cached;
        skh.renderFeedUI(cached, feedGrid);
        return;
    }

let qNormal;
    const currentActiveMode = skh.activeMarketMode; 

    // [FIX 2026-09: VICHUJIO VYA TAB VILIVOVUNJIKA]
    // 1) "saleMode" ni ya BIDHAA pekee — huduma/usafiri hawana sehemu hiyo, hivyo
    //    kichujio hicho kilikuwa kinafuta orodha nzima ya Huduma/Usafirishaji.
    // 2) Hakuna orderBy wala limit kwenye matawi yenye `where` — tunachukua matokeo
    //    yote ya kichujio na kupanga kwenye browser. Hii inaepuka hitaji la composite
    //    indexes (ambazo hazipo kwenye services/drivers) NA inaondoa tatizo la
    // "limit(20) bila mpangilio" lililokuwa linapoteza bidhaa mpya zilizopakiwa.
    const isModeFilter = (currentActiveMode && currentActiveMode !== "all_modes" && collectionToFetch === 'products');
    const isCategoryFilter = (!isModeFilter && skh.activeCategory && skh.activeCategory !== "Zote" && skh.activeCategory !== "");

    if (isModeFilter) {
        // 1. Kama amebonyeza tab ya "Mnada", toa bidhaa za mode hiyo tu.
        // [LIVE-FIX 2026-09] Ongeza orderBy+limit — bila hivyo listener ilikuwa
        // inavuta bidhaa ZOTE za mode (unbounded) kwa kila mtumiaji (ghali kwa
        // watumiaji wengi). Index tayari ipo (products saleMode+createdAt DESC).
        qNormal = skh.query(skh.collection(skh.db, collectionToFetch), 
                  skh.where("saleMode", "==", currentActiveMode),
                  skh.orderBy("createdAt", "desc"),
                  skh.limit(skh.currentLimit));
    } 
    else if (collectionToFetch === 'drivers') {
        // USAFIRI: haina `category` wala `saleMode` — "kategoria" yake ni aina ya
        // huduma (Passenger/Product/Cargo/Emergency) iliyohifadhiwa kwenye
        // `supportedServices` (array). Kama hakuna kichujio cha sehemu, chukua MPYA.
        if (skh.activeDeliverySection && skh.activeDeliverySection !== 'all') {
            // [LIVE-FIX 2026-09] orderBy+limit (index: drivers supportedServices+createdAt DESC).
            qNormal = skh.query(skh.collection(skh.db, collectionToFetch),
                      skh.where("supportedServices", "array-contains", skh.activeDeliverySection),
                      skh.orderBy("createdAt", "desc"),
                      skh.limit(skh.currentLimit));
        } else {
            qNormal = skh.query(skh.collection(skh.db, collectionToFetch), 
                      skh.orderBy("createdAt", "desc"),
                      skh.limit(skh.currentLimit));
        }
    }
    else if (isCategoryFilter) {
        // 2. Kama yupo kwenye "Vyote" lakini amechagua Category (mf: Simu).
        // [LIVE-FIX 2026-09] orderBy+limit — index tayari ipo
        // (products category+createdAt DESC).
        qNormal = skh.query(skh.collection(skh.db, collectionToFetch), 
                  skh.where("category", "==", skh.activeCategory),
                  skh.orderBy("createdAt", "desc"),
                  skh.limit(skh.currentLimit));
    } 
    else {
        // 3. Kama hajaweka filter yoyote, onyesha MPYA kwanza — orderBy createdAt
        //    ni index ya msingi ambayo Firestore inajitengenezea yenyewe.
        qNormal = skh.query(skh.collection(skh.db, collectionToFetch), 
                  skh.orderBy("createdAt", "desc"),
                  skh.limit(skh.currentLimit));
    }

    window.unsubscribeFeed = skh.onSnapshot(qNormal, (snapshot) => {
        let normalData = snapshot.docs.map(doc => ({ id: doc.id, collectionName: collectionToFetch, ...doc.data() }));
        // Panga mpya kwanza, kisha kata kwa currentLimit (kwa matawi ya `where`
        // ambapo hatukupunguza idadi kwenye server).
        normalData = sortByCreated(normalData).slice(0, skh.currentLimit);
        skh._feedCacheSet(cacheKey, normalData);
        skh.renderFeedUI(normalData, feedGrid);
    }, (err) => {
        showFeedError((err && err.message) ? err.message : 'Angalia muunganisho wa mtandao.');
    });
}

// ============================================================
// [COMMERCE CARDS 2026-09] Shared post-card architecture.
// Bidhaa / Huduma / Usafiri zinajengwa kutoka vipande vinavyotumika
// tena (PostImage, PostActions, SellerMiniProfile, VerificationBadge,
// RatingDisplay, LocationDisplay, ProtectionBadge, PostMetrics, PostCTA).
// Inatumia mifumo ILIYOPO: skhCardIndex, skhEngagementState,
// skhCardToggle, openProduct, openSellerProfile, SKH_PLACEHOLDER_IMG.
// ============================================================

// Ikoni ndogo ya SVG (stroke) — maktaba iliyopo ya 18-icons.js
skh.cardIcon = function cardIcon(name, size) {
    return (window.skhNavIcon ? window.skhNavIcon(name, size) : '');
};

// [PostActions] Like + Save — zinatumia skhCardToggle iliyopo (bila nakala)
skh.cardEngage = function cardEngage(data, colName) {
    if (window.skhCardIndex) {
        window.skhCardIndex[data.id] = {
            id: data.id, collectionName: colName, title: data.title,
            image: data.image, price: data.price, userId: data.userId,
            ownerName: data.ownerName || data.driverName || data.fullName || data.storeName
        };
    }
    const _eng = window.skhEngagementState || {};
    const _ekey = colName + '__' + data.id;
    const _liked = !!((_eng.liked || {})[_ekey]);
    const _saved = !!((_eng.saved || {})[_ekey]);
    const _icLike = (window.SKH_ICONS && window.SKH_ICONS.like) ? window.SKH_ICONS.like : '';
    const _icSave = (window.SKH_ICONS && window.SKH_ICONS.save) ? window.SKH_ICONS.save : '';
    return `<div class="skh-actions"> <span id="cardLike_${data.id}" onclick="event.stopPropagation(); window.skhCardToggle('like','${skh.skhJsEsc(data.id)}')" title="Like" aria-label="Like" role="button" tabindex="0" class="skh-eng-btn card-eng-like ${_liked ? 'skh-eng-on' : ''}">${_icLike}</span> <span id="cardSave_${data.id}" onclick="event.stopPropagation(); window.skhCardToggle('save','${skh.skhJsEsc(data.id)}')" title="Save" aria-label="Save" role="button" tabindex="0" class="skh-eng-btn card-eng-save ${_saved ? 'skh-eng-on' : ''}">${_icSave}</span> </div>`;
};

// [PostImage] Picha thabiti (cover) + placeholder + idadi ya picha
skh.cardImage = function cardImage(data, overlayHTML, extraClass) {
    let rawImg = data.image || data.photo;
    if (!rawImg && data.imagesArray && data.imagesArray.length > 0) rawImg = data.imagesArray[0];
    if (rawImg && /ui-avatars\.com/.test(String(rawImg))) rawImg = null;
    const optImg = skh.getOptimizedImageUrl(rawImg || window.SKH_PLACEHOLDER_IMG || '');
    const photoCount = (data.imagesArray && data.imagesArray.length > 1)
        ? `<span class="skh-photo-count">${skh.cardIcon('image', 11)} ${data.imagesArray.length}</span>` : '';
    return `<div class="feed-img-box skh-img${extraClass || ''}"> <img src="${skh.skhEscape(optImg)}" loading="lazy" alt="${skh.skhEscape(data.title || '')}" onerror="this.onerror=null;this.src=window.SKH_PLACEHOLDER_IMG||'';">
        ${photoCount}
        ${overlayHTML || ''}
    </div>`;
};

// [VerificationBadge] Tiki ya kijani — IKIWA imethibitishwa KWELI tu
skh.cardVerified = function cardVerified(data) {
    const v = data.verified === true || data.ownerVerified === true || data.verificationStatus === 'verified';
    if (!v) return '';
    return '<span class="skh-verified" title="Imethibitishwa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="10" height="10" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>';
};

// [RatingDisplay] Nyota + wastani (+ idadi ya mapokezi) + mauzo — ikiwa ipo tu
// (hatubandiki). [AUDIT 2026-09-16] Muonekano mmoja kwa BIDHAA/HUDUMA/USAFIRI:
// spec: ⭐rating (+ idadi ya comment) · Imeuzwa X. Taarifa zote ni za DB tu.
skh.cardRating = function cardRating(data) {
    const bits = [];
    const r = parseFloat(data.rating);
    if (Number.isFinite(r) && r > 0) {
        const count = data.reviewCount || data.totalReviews || data.ratingCount || 0;
        bits.push(`${skh.cardIcon('star', 11)}<b>${r.toFixed(1)}</b>${count ? '<small>(' + Number(count).toLocaleString() + ')</small>' : ''}`);
    }
    const sold = Number(data.soldCount || data.sold || data.salesCount || 0);
    if (Number.isFinite(sold) && sold > 0) {
        bits.push('<small class="skh-sold">Imeuzwa ' + sold.toLocaleString() + '</small>');
    }
    if (!bits.length) return '';
    return `<span class="skh-rating">${bits.join('')}</span>`;
};

// [LocationDisplay] Eneo — bidhaa/huduma: location; usafiri: njia
skh.cardLocation = function cardLocation(data, colName) {
    let loc = data.location || data.region || '';
    if (!loc && colName === 'drivers') {
        loc = ((data.pickupRegion || '') + (data.destinationRegion ? ' ' + data.destinationRegion : '')).trim();
        return `<span class="skh-loc">${skh.cardIcon('map', 11)} ${skh.skhEscape(data.pickupRegion || '')}${data.destinationRegion ? '<span class="skh-title-arrow">' + skh.cardIcon('arrow-right', 11) + '</span>' + skh.skhEscape(data.destinationRegion) : ''}</span>`;
    }
    if (!loc) loc = 'Tanzania';
    return `<span class="skh-loc">${skh.cardIcon('map', 11)} ${skh.skhEscape(loc)}</span>`;
};

// [SellerMiniProfile] Avatar + jina + tiki; inafungua duka lililopo (openSellerProfile)
skh.cardSeller = function cardSeller(data) {
    const name = data.ownerName || data.driverName || data.fullName || data.storeName || '';
    if (!name) return '';
    const uid = data.userId || data.sellerId || '';
    const avatar = (typeof window.skhUserAvatar === 'function')
        ? window.skhUserAvatar(data.ownerPhotoURL || data.ownerAvatar || data.ownerLogo || null, name, 22) : '';
    const onClick = uid ? `onclick="event.stopPropagation(); if(window.openSellerProfile){window.openSellerProfile('${skh.skhJsEsc(uid)}','${skh.skhJsEsc(name)}');}"` : '';
    const a11y = uid ? 'role="link" tabindex="0" title="Tazama duka la muuzaji"' : '';
    return `<div class="skh-seller" ${onClick} ${a11y}>${avatar}<span class="skh-seller-name">${skh.skhEscape(name)}</span>${skh.cardVerified(data)}</div>`;
};

// [ProtectionBadge] Ulinzi wa miamala (escrow) — kwa usiri
skh.cardProtection = function cardProtection() {
    return '<span class="skh-protect"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" style="vertical-align:middle;" aria-hidden="true"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg> Imelindwa</span>';
};

// [PostMetrics] Mara iliyotazamwa — ikiwa ina maana tu
skh.cardMetrics = function cardMetrics(data) {
    const views = Number(data.views || 0);
    if (!views) return '';
    return `<span class="skh-views">${skh.cardIcon('search', 11)} ${views.toLocaleString()}</span>`;
};

// [PostCTA] Lebo ya kitendo — kitendo chenyewe ni openProduct (kadi yote)
skh.cardCtaLabel = function cardCtaLabel(colName) {
    if (colName === 'services') return 'Tazama Huduma';
    if (colName === 'drivers') return 'Tazama Safari';
    return 'Tazama Bidhaa';
};

// [Availability] Zipo (kijani) / zimebaki chache (kahawia) / zimeisha (nyekundu)
// — INAONYESHWA IKIWA IMEJULIKANA TU (hatubandiki uwepo wa bidhaa).
skh.cardAvail = function cardAvail(data, colName) {
    if (colName === 'products') {
        const stock = Number(data.stock);
        if (Number.isFinite(stock)) {
            if (stock <= 0) return '<span class="skh-badge skh-badge--out">Zimeisha</span>';
            if (stock <= 5) return `<span class="skh-badge skh-badge--low">Zimebaki ${stock}</span>`;
            return `<span class="skh-badge skh-badge--in">Zipo (${stock})</span>`;
        }
        return '';
    }
    if (colName === 'services') {
        return `<span class="skh-badge skh-badge--in">${skh.cardIcon('refresh', 10)} Inapatikana leo</span>`;
    }
    if (data.online === true || data.status === 'available') {
        return `<span class="skh-badge skh-badge--in">${skh.cardIcon('refresh', 10)} Inapatikana</span>`;
    }
    return '';
};

// [Mode badge] Mnada / Bei inashuka / Group Buy — za pekee pekee
skh.cardModeBadge = function cardModeBadge(data) {
    if (data.saleMode === 'auction') return `<span class="skh-badge skh-badge--auction">${skh.cardIcon('trophy', 10)} ${skhTF('card_badge_auction', 'Live Mnada')}</span>`;
    if (data.saleMode === 'price_drop') return `<span class="skh-badge skh-badge--drop">${skh.cardIcon('refresh', 10)} ${skhTF('card_badge_drop', 'Bei Inashuka')}</span>`;
    if (data.saleMode === 'group_buy') return `<span class="skh-badge skh-badge--group">${skh.cardIcon('users', 10)} Group Buy</span>`;
    // [§21] Wholesale ina badge yake yenyewe — inawezekana kupatikana
    // kutoka modeData.minQty/tiers (halisi, si placeholder).
    if (data.saleMode === 'wholesale') return `<span class="skh-badge skh-badge--wholesale">${skh.cardIcon('package', 10)} ${skhTF('card_badge_wholesale', 'Jumla')}</span>`;
    return '';
};

/* [§6/§8/§13/§17/§21 CARD SIGNAL LINE] Mstari mmoja chini ya bei —
 * namba HALISI toka modeData (zabuni/wamejiunga/bei hai/halalizima),
 * si maelezo ya staili. Habaed, kwa teaser (§44 — uongoza kwa undani
 * utakao kusoma Product Details). */
skh.cardModeSignalLine = function cardModeSignalLine(data) {
    try {
        if (typeof window.skhModesCompute !== 'function') return '';
        const c = window.skhModesCompute(data);
        if (c.mode === 'auction') {
            const t = c.auction.ended ? skhTF('card_auction_ended', 'Mnada umefungwa') : skhTF('card_auction_live', 'Mnada live');
            return `<div class="skh-mode-line skh-mode-line--auction">${skh.cardIcon('trophy', 10)} ${skhTF('card_bid', 'Dau')}: TSh ${Number(c.auction.currentBid).toLocaleString()} · ${c.auction.totalBids.toLocaleString()} ${skhTF('card_bids', 'zabuni')} · ${t}</div>`;
        }
        if (c.mode === 'group_buy') {
            const s = (c.group.status === 'successful' ? '🎉 ' + skhTF('card_group_success', 'kundi limekamilika') : (c.group.status === 'failed' ? skhTF('card_group_failed', 'deal imekwisha') : skhTF('card_group_active', 'inavyuma')));
            return `<div class="skh-mode-line skh-mode-line--group">${skh.cardIcon('users', 10)} ${c.group.joined}/${c.group.target} ${skhTF('card_joined', 'wamejiunga')} · TSh ${c.group.price.toLocaleString()} · ${s}</div>`;
        }
        if (c.mode === 'price_drop') {
            const baseN = Number(data.price) || 0;
            const curN = c.drop.currentPrice;
            const pct = baseN > 0 ? Math.max(0, Math.round((1 - curN / baseN) * 100)) : 0;
            return `<div class="skh-mode-line skh-mode-line--drop">${skh.cardIcon('refresh', 10)} TSh ${baseN.toLocaleString()} → <b>TSh ${curN.toLocaleString()}</b>${pct > 0 ? ' · −' + pct + '%' : ''}</div>`;
        }
        if (c.mode === 'wholesale') {
            return `<div class="skh-mode-line skh-mode-line--wholesale">${skh.cardIcon('package', 10)} ${skhTF('card_wholesale_from', 'Jumla kuanzia')} TSh ${Number(c.wholesale.lowest).toLocaleString()}</div>`;
        }
    } catch (e) { /* kadi ibaki teaser — line ikipuuzwa kadi haipaswi kuvunja */ }
    return '';
};

// [Type badge] Huduma / Usafiri (bidhaa hazihitaji)
skh.cardTypeBadge = function cardTypeBadge(colName) {
    if (colName === 'services') return `<span class="skh-badge skh-badge--service">${skh.cardIcon('wrench', 10)} ${skhTF('nav_services', 'Huduma')}</span>`;
    if (colName === 'drivers') return `<span class="skh-badge skh-badge--transport">${skh.cardIcon('truck', 10)} ${skhTF('nav_transport', 'Usafiri')}</span>`;
    return '';
};

// ============================================================
// [CARD TEASER 2026-09] Kadi ya discovery ni TEASER safi (tazama
// reference): picha ndiyo shujaa, taarifa chache muhimu tu.
// Verifi/mode/njia/zimeisha huwekwa kama OVERLAY juu ya picha;
// mwili wa kadi unabaki: jina -> bei -> muuzaji  -> eneo.
// ============================================================

// [VerifiedPill] Kibandiko cha kijani chini-kushoto mwa picha
skh.cardVerifiedPill = function cardVerifiedPill(data) {
    const v = data.verified === true || data.ownerVerified === true || data.verificationStatus === 'verified';
    if (!v) return '';
    return '<span class="skh-verified-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Verified</span>';
};

// [OutPill] Bidhaa zikiwa zimeisha — kibandiko wazi juu ya picha
skh.cardOutPill = function cardOutPill(data, colName) {
    if (colName !== 'products') return '';
    const stock = Number(data.stock);
    if (Number.isFinite(stock) && stock <= 0) return '<span class="skh-out-pill">' + skhTF('card_out', 'Zimeisha') + '</span>';
    return '';
};

// [RouteOverlay] Njia ya usafiri chini mwa picha (gradient)
skh.cardRouteOverlay = function cardRouteOverlay(data) {
    const from = data.pickupRegion || data.location || '';
    const to = data.destinationRegion || '';
    if (!from && !to) return '';
    return '<div class="skh-route-overlay"><span class="skh-ro-pin">' + skh.cardIcon('map', 11) + '</span>'
        + '<span class="skh-ro-name">' + skh.skhEscape(from || '?') + '</span>'
        + '<span class="skh-ro-arrow">' + skh.cardIcon('arrow-right', 12) + '</span>'
        + '<span class="skh-ro-name">' + skh.skhEscape(to || '?') + '</span></div>';
};

// [PriceHtml] Bei ya kijani, hierarchy ya wazi; "Kuanzia" kwa huduma/usafiri
skh.cardPriceHtml = function cardPriceHtml(data, colName) {
    const hasPrice = Number(data.price) > 0;
    if (!hasPrice) return '<span class="price skh-price skh-price--muted">' + skhTF('card_negotiable', 'Maelewano') + '</span>';
    const amount = 'TSh ' + Number(data.price).toLocaleString();
    if (colName === 'services' || colName === 'drivers') {
        return '<span class="price skh-price"><span class="skh-price-prefix">' + skhTF('card_from', 'Kuanzia') + ' </span>' + amount + '</span>';
    }
    return '<span class="price skh-price">' + amount + '</span>';
};

// [ImageOverlays] Mkusanyiko wa overlays za picha (bila Like/Save)
skh.cardImageOverlays = function cardImageOverlays(data, colName, extra) {
    let topLeft = skh.cardModeBadge(data) ? '<div class="skh-overlay-stack">' + skh.cardModeBadge(data) + '</div>' : '';
    let bottom = '';
    if (colName === 'drivers') {
        bottom = skh.cardRouteOverlay(data);
    } else {
        bottom = skh.cardVerifiedPill(data);
    }
    const out = skh.cardOutPill(data, colName);
    return (extra || '') + topLeft + bottom + out;
};

// [ImageClass] Darasa la ziada la picha (mfano grayscale zikiisha)
skh.cardImageClass = function cardImageClass(data, colName) {
    if (colName === 'products' && Number.isFinite(Number(data.stock)) && Number(data.stock) <= 0) {
        return ' skh-img--out';
    }
    return '';
};

// Sifa za kufungua kadi (a11y + kitendo kilichopo cha openProduct)
skh.cardOpenAttrs = function cardOpenAttrs(id, colName, label) {
    const iid = skh.skhJsEsc(id);
    const icol = skh.skhJsEsc(colName);
    const iLabel = skh.skhEscape(label || '');
    return `role="link" tabindex="0" aria-label="${iLabel}" onclick="openProduct('${iid}', '${icol}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProduct('${iid}', '${icol}');}"`;
};

// [SellerMini] Mstari MWEMBE wa muuzaji/mtoa/dereva: ikoni ya duka +
// jina + tiki (hufungua duka lililopo). Reference: kadi ni teaser, hivyo
// habari ya muuzaji inabana (bila avatar kubwa wala footer).
skh.cardSellerMini = function cardSellerMini(data, iconName) {
    const name = data.ownerName || data.driverName || data.fullName || data.storeName || '';
    if (!name) return '';
    const uid = data.userId || data.sellerId || '';
    const onClick = uid ? `onclick="event.stopPropagation(); if(window.openSellerProfile){window.openSellerProfile('${skh.skhJsEsc(uid)}','${skh.skhJsEsc(name)}');}"` : '';
    const a11y = uid ? 'role="link" tabindex="0" title="' + skhTF('tt_view_shop', 'Tazama duka') + '"' : '';
    // [AUDIT 2026-09-16] Wafuasi wa muuzaji (data halisi ya DB tu — hatubandiki;
    // ikiwa muuzaji anao wafuasi, hesabu inasafirishwa kwenye doc ya bidhaa/
    // huduma/chombo (ownerFollowers) na itaonekana hapa moja kwa moja).
    // [§12-§13 R8 FOLLOWERS: NO FAKE NUMBERS] Product/docs hazina count iliyo-
    // hifadhiwa; hesabu inaHYDRATE KWENDA live (skhHydrateFollowerCounts).
    // Font hii ni slot tu — data halisi itapopatikana itaingia hapa.
    const fAttr = uid ? ` data-fowner="${skh.skhJsEsc(uid)}"` : '';
    const followersHtml = uid
        ? ` <small class="skh-followers" data-fowner-count="${skh.skhJsEsc(uid)}" title="${skhTF('tt_followers', 'Wafuasi wa muuzaji')}" style="opacity:0;"></small>` : '';
    return `<div class="skh-seller-mini"${fAttr} ${onClick} ${a11y}> <span class="skh-seller-ic">${skh.cardIcon(iconName || 'shop', 11)}</span> <span class="skh-seller-name">${skh.skhEscape(name)}</span>${skh.cardVerified(data)}${followersHtml}
    </div>`;
};

/* [§12-§13 R8 HYDRATE FOLLOWERS] Baada ya feed/card kuonekana, vuta LIVE
 * hesabu za wafuasi kwa wamiliki wote wa kadi zinazoonekana (batch live).
 * Chanzo = users[].followers array (yenyewee inatumika kwenye follow followe
 * (28-buyer-engagement + openProduct follow-btn)), errors zikosekerewa (zero). */
skh.hydrateFollowerCounts = async function hydrateFollowerCounts(rootEl) {
    try {
        const root = rootEl || document.getElementById('mainFeed');
        if (!root || !skh.db) return;
        const slots = Array.from(root.querySelectorAll('[data-fowner-count]'));
        if (!slots.length) return;
        const uids = Array.from(new Set(slots.map(s => s.getAttribute('data-fowner-count')).filter(Boolean)));
        if (!uids.length) return;
        const counts = {};
        // Firestore 'in' query — aisha ya 10 - fallback ya kukijaduzima.
        const batches = [];
        for (let i = 0; i < uids.length; i += 10) batches.push(uids.slice(i, i + 10));
        await Promise.all(batches.map(async (batch) => {
            try {
                const q = skh.query(skh.collection(skh.db, 'users'), skh.where('uid', 'in', batch));
                const snap = await skh.getDocs(q);
                snap.forEach(function (d) {
                    const x = d.data() || {};
                    counts[x.uid] = Array.isArray(x.followers) ? x.followers.length : 0;
                });
            } catch (e) { /* batch flieptask — mashushe haitakuza */ }
        }));
        slots.forEach(function (s) {
            const uid = s.getAttribute('data-fowner-count');
            const c = counts[uid];
            if (typeof c !== 'number') return;   // haijapatikana — acha opacity:0
            if (c > 0) { s.textContent = '· ' + c.toLocaleString() + ' ' + skhTF('card_followers', 'wafuasi'); s.style.opacity = '1'; }
            else { s.textContent = '· 0 ' + skhTF('card_followers', 'wafuasi'); s.style.opacity = '0.55'; } // hakuna wafuasi: HASHA visible-lakini haughti — zero ni namba halisi
        });
    } catch (e) { /* kadi ionekane bila count — hassu */ }
};

// [PinLocation] Mstari wa eneo mwembamba (pini + jina)
skh.cardPinLocation = function cardPinLocation(data, colName) {
    let loc = data.location || data.region || '';
    if (!loc && colName === 'drivers') loc = data.pickupRegion || '';
    if (!loc) return '';
    return `<span class="skh-pinloc">${skh.cardIcon('map', 11)}<span>${skh.skhEscape(loc)}</span></span>`;
};

// [ProductPostCard] TEASER: picha -> jina -> bei -> duka  -> eneo.
// Taarifa kamili (stock, ulinzi, maoni) zipo kwenye ukurasa wa bidhaa.
skh.ProductPostCard = function ProductPostCard(data, colName) {
    // [CARD POLICY 2026-09] Kadi ni TEASER: Like/Save havionekani mbele —
    // vitendo vya engagement vipo ndani ya ukurasa wa maelezo (detail) tu.
    const overlays = [
        data.isBoosted ? '<div class="boost-badge">BOOSTED</div>' : '',
        skh.cardModeBadge(data),
        skh.cardVerifiedPill(data),
        skh.cardOutPill(data, 'products')
    ].join('');
    return `<div class="feed-card-box skh-card skh-card--product" ${skh.cardOpenAttrs(data.id, 'products', data.title)}>
        ${skh.cardImage(data, overlays, skh.cardImageClass(data, 'products'))}
        <div class="feed-info-box skh-body"> <h3 class="skh-title">${skh.skhEscape(((window.skhLocField ? window.skhLocField(data, 'title') : null) || data.title) || skhTF('card_product_def', 'Bidhaa'))}</h3>
            ${skh.cardPriceHtml(data, 'products')}
            ${skh.cardModeSignalLine(data)}
            <div class="skh-seller-row">${skh.cardSellerMini(data, 'shop')}${skh.cardRating(data)}</div> <div class="skh-meta-row">${skh.cardPinLocation(data, 'products')}</div> </div> </div>`;
};

// [ServicePostCard] TEASER: picha -> jina -> bei (Kuanzia) -> mtoa   -> eneo.
skh.ServicePostCard = function ServicePostCard(data, colName) {
    const overlays = [
        skh.cardTypeBadge('services') ? '<div class="skh-overlay-chip skh-overlay-chip--service">' + skh.cardTypeBadge('services') + '</div>' : '',
        skh.cardModeBadge(data),
        skh.cardVerifiedPill(data)
    ].join('');
    return `<div class="feed-card-box skh-card skh-card--service" ${skh.cardOpenAttrs(data.id, 'services', data.title)}>
        ${skh.cardImage(data, overlays)}
        <div class="feed-info-box skh-body"> <h3 class="skh-title">${skh.skhEscape(((window.skhLocField ? window.skhLocField(data, 'title') : null) || data.title) || skhTF('card_service_def', 'Huduma'))}</h3>
            ${skh.cardPriceHtml(data, 'services')}
            <div class="skh-seller-row">${skh.cardSellerMini(data, 'wrench')}${skh.cardRating(data)}</div> <div class="skh-meta-row">${skh.cardPinLocation(data, 'services')}</div> </div> </div>`;
};

// [TransportPostCard] TEASER: picha (njia juu yake) -> jina/aina -> bei
// (Kuanzia) -> msafirishaji   -> eneo la mwanzo.
skh.TransportPostCard = function TransportPostCard(data, colName) {
    const hasRoute = !!(data.pickupRegion || data.destinationRegion);
    const overlays = [
        hasRoute ? skh.cardRouteOverlay(data) : skh.cardVerifiedPill(data),
        skh.cardOutPill(data, colName)
    ].join('');
    const arrowIco = skh.cardIcon('arrow-right', 12);
    const _locTitle = (window.skhLocField ? window.skhLocField(data, 'title') : null) || data.title;
    const title = skh.skhEscape(_locTitle || (hasRoute ? ((data.pickupRegion || '') + ' ' + (data.destinationRegion || '')) : skhTF('card_transport_def', 'Usafiri')));
    const vehicle = data.vehicleType ? `<div class="skh-card-sub">${skh.cardIcon('truck', 11)} ${skh.skhEscape(data.vehicleType)}</div>` : '';
    return `<div class="feed-card-box skh-card skh-card--transport" ${skh.cardOpenAttrs(data.id, 'drivers', _locTitle || skhTF('card_transport_def', 'Usafiri'))}>
        ${skh.cardImage(data, overlays)}
        <div class="feed-info-box skh-body"> <h3 class="skh-title">${hasRoute && !data.title ? skh.skhEscape(data.pickupRegion || '') + '<span class="skh-title-arrow" aria-label="hadi">' + arrowIco + '</span>' + skh.skhEscape(data.destinationRegion || '') : title}</h3>
            ${vehicle}
            ${skh.cardPriceHtml(data, 'drivers')}
            <div class="skh-seller-row">${skh.cardSellerMini(data, 'truck')}${skh.cardRating(data)}</div> <div class="skh-meta-row">${skh.cardPinLocation(data, 'drivers')}</div> </div> </div>`;
};

// [CommercePostCard] Kichaguzi cha aina ya kadi
skh.CommercePostCard = function CommercePostCard(data, colName) {
    if (colName === 'services') return skh.ServicePostCard(data, colName);
    if (colName === 'drivers') return skh.TransportPostCard(data, colName);
    return skh.ProductPostCard(data, colName);
};

skh.renderFeedUI = function renderFeedUI(dataArray, feedGrid) {
    if (!feedGrid) return;
    
    let filteredData = dataArray;

    // 1. Kuzuia muingiliano wa collection kwenye all-feed
    if (skh.currentFeedCollection !== 'all') {
        filteredData = filteredData.filter(d => d.collectionName === skh.currentFeedCollection);
    }

    // 1b. [FIX 2026-09] Chujio la SEHEMU (Section)
    //     HUDUMA: physical/online/food/rental (hifadhiwa kwenye `section` au `groupType`)
    if (skh.currentFeedCollection === 'services' && skh.activeServiceSection && skh.activeServiceSection !== 'all') {
        filteredData = filteredData.filter(data => {
            const sec = ((data.section || data.groupType) || '').toLowerCase();
            return sec === String(skh.activeServiceSection).toLowerCase();
        });
    }
    //     USAFIRI: Passenger/Product/Cargo/Emergency (hifadhiwa kwenye `supportedServices`)
    if (skh.currentFeedCollection === 'drivers' && skh.activeDeliverySection && skh.activeDeliverySection !== 'all') {
        filteredData = filteredData.filter(data => {
            const ss = data.supportedServices || [];
            return ss.some(s => String(s).toLowerCase() === String(skh.activeDeliverySection).toLowerCase());
        });
    }

    // 2. Chujio la Kategoria Kuu
    if (skh.activeCategory && skh.activeCategory !== "Zote") {
        filteredData = filteredData.filter(data => {
            // USAFIRI: kategoria yake inahifadhiwa kwenye supportedServices (array)
            if (skh.currentFeedCollection === 'drivers') {
                const ss = data.supportedServices || [];
                return ss.some(s => String(s).toLowerCase() === skh.activeCategory.toLowerCase());
            }
            const itemCat = data.category || '';
            return itemCat.toLowerCase() === skh.activeCategory.toLowerCase();
        });
    }

    // 3. Chujio la Sub-category
    if (skh.activeSubCategory && skh.activeSubCategory !== "Zote") {
        filteredData = filteredData.filter(data => {
            // USAFIRI: subcategory = aina ya chombo (vehicleType)
            if (skh.currentFeedCollection === 'drivers') {
                const vt = data.vehicleType || '';
                return vt.toLowerCase() === skh.activeSubCategory.toLowerCase();
            }
            const itemSub = data.subCategory || '';
            return itemSub.toLowerCase() === skh.activeSubCategory.toLowerCase();
        });
    }

    // 4. Chujio la Vigezo Maalum (Attributes/Filters)
    if (skh.activeFilterValues && Object.keys(skh.activeFilterValues).length > 0) {
        filteredData = filteredData.filter(data => {
            if (!data.filters) return false;
            for (let [fKey, fVal] of Object.entries(skh.activeFilterValues)) {
                const itemVal = data.filters[fKey];
                if (!itemVal || itemVal.toLowerCase() !== fVal.toLowerCase()) {
                    return false;
                }
            }
            return true;
        });
    }

    // 5. Chujio la Search Query
    if (skh.searchQuery && skh.searchQuery.trim() !== "") {
        let query = skh.searchQuery.toLowerCase().replace(/\s+/g, ' ').trim();
        // [§26 MODE-AWARE SEARCH] "simu mnada" / "bei jumla" / "group buy kundi"
        // / "bei kushuka" — neno la mode linatolewa nje ya swali na kuwa filter.
        let forcedMode = null;
        const MODE_WORDS = [
            { mode: 'auction',    re: /\b(mnada|auction|zabuni|bid)\b/g },
            { mode: 'group_buy',  re: /\b(group buy|groupbuy|group_buy|kundi|kubatizana)\b/g },
            { mode: 'price_drop', re: /\b(bei kushuka|price drop|price_drop|kushuka)\b/g },
            { mode: 'wholesale',  re: /\b(jumla|wholesale|bei ya jumla|bei jumla)\b/g }
        ];
        MODE_WORDS.forEach(function (mw) {
            if (mw.re.test(query)) { forcedMode = mw.mode; query = query.replace(mw.re, ' ').replace(/\s+/g, ' ').trim(); }
        });
        if (forcedMode) {
            filteredData = filteredData.filter(function (d) { return d.saleMode === forcedMode; });
            // Ikiwa swali lilibaki tupu baada ya mode-word, onyesha zote za mode
            // (si "hakuna matokeo") — mfano: user aandika tu "mnada".
        }
        filteredData = filteredData.filter(data => {
            if (!query) return true; // msingi baada ya mode-only search
            const title = (data.title || data.driverName || data.company || '').toLowerCase();
            const desc = (data.description || '').toLowerCase();
            const cat = (data.category || '').toLowerCase();
            // [FIX 2026-09] USAFIRI: tafuta pia kwa chombo na huduma anazobeba
            const extra = (data.vehicleType || '') + ' ' + (Array.isArray(data.supportedServices) ? data.supportedServices.join(' ') : '');
            return title.includes(query) || desc.includes(query) || cat.includes(query) || extra.toLowerCase().includes(query);
        });
    }

    // 6. Chujio la Mkoa (Location) — moja kati ya mikoa yote ya Tanzania
    if (skh.filterRegion && skh.filterRegion.trim() !== "") {
        const region = skh.filterRegion.trim().toLowerCase();
        const regionDef = (skh.TZ_REGIONS || []).find(r => r.name.toLowerCase() === region);
        const aliases = regionDef ? regionDef.aliases : [region];
        filteredData = filteredData.filter(data => {
            const locText = ((data.location || '') + ' ' + (data.region || '') + ' ' + (data.pickupRegion || '') + ' ' + (data.destinationRegion || '')).toLowerCase();
            return aliases.some(a => locText.includes(a));
        });
    }

    // 7. Chujio la GPS/Ukaribu (Near Me)
    if (skh.filterNearMe && skh.userLat && skh.userLon) {
        filteredData.forEach(item => {
            if (item.coords && typeof item.coords.lat === 'number' && typeof item.coords.lon === 'number') {
                item.computedDistance = skh.calculateDistance(skh.userLat, skh.userLon, item.coords.lat, item.coords.lon);
            } else {
                item.computedDistance = 9999.0; 
            }
        });
        filteredData.sort((a, b) => (a.computedDistance || 9999) - (b.computedDistance || 9999));
    }

    skh.cachedItems = filteredData; 
    // [§1-§5 R8 FILTERS] HIFADHI YA SOURCE: cachedItems ni state ya SOURCE
    // toka Firestore. Kuhandika hafuta filtra-emtsc (filtered) basi ya
    // algorithm nyingine (mfadhiri omega kupotea feed baada ya search).
    skh._visibleFeedItems = filteredData;

    // [ROUTE MATCHER 2026-09] Kwenye ukurasa wa USAFIRI mteja aanze kwa
    // kuweka njia/vigezo — SokoHai humwonesha magari yanayopitia route yake
    // (kisha majadiliano), badala ya kutangaza ombi kwa upofu.
    const matcherBanner = (skh.currentFeedCollection === 'drivers')
        ? `<div class="skh-route-cta" style="grid-column: 1/-1;"> <span class="skh-route-cta-ic">${skh.cardIcon('filter', 22)}</span> <div class="skh-route-cta-txt"> <b>Unatafuta chombo cha kusafirisha?</b> <span>Weka njia yako (kutoka -> kwenda) na vigezo vya mzigo/abiria — utaona magari yanayopitia route hiyo.</span> </div> <button type="button" class="skh-route-cta-btn" onclick="if(window.openRideRequestModal){window.openRideRequestModal();}">${skh.cardIcon('search', 15)} <span>Tafuta gari kwa njia</span></button> </div>` : '';

    if (filteredData.length === 0) {
        feedGrid.innerHTML = matcherBanner + `
            <div class="skh-empty" style="grid-column: 1/-1;"> <span class="skh-empty-icon">${skh.cardIcon('search', 30)}</span> <b>Hatujapata matokeo</b> <p>Jaribu kutafuta kwa neno lingine au badilisha kategoria — au tafuta gari kwa njia yako.</p> <button class="skh-empty-btn" onclick="resetAppState(); loadMainFeed('all');">Onyesha Vyote</button> </div>`;
        return;
    }

    let html = matcherBanner;
    filteredData.forEach(data => {
        try {
            const colName = data.collectionName || skh.currentFeedCollection;
            html += skh.CommercePostCard(data, colName);
        } catch (cardErr) {
            // [FIX 2026-09] Data mbovu ya kadi MOJA isifute feed NZIMA.
            console.warn('[renderFeedUI] kadi imerukwa (data mbovu):', cardErr && cardErr.message);
        }
    });
    feedGrid.innerHTML = html;

    // [§12-§13 R8] HYDRATE hesabu HALISI za wafuasi (fire-and-forget —
    // haitazuia render: kadi zinaonekana mara moja, counts zinaingia baadaye).
    try { skh.hydrateFollowerCounts(feedGrid).catch(function () {}); } catch (e) {}
}

skh.calculateDistance = function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius ya dunia
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

skh.getAddressName = async function getAddressName(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        return data.display_name || "Eneo lisilojulikana";
    } catch (e) { return "Eneo la Tukio"; }
}

skh.startMasterMonitoring = function startMasterMonitoring() {
    // [SOKOHAI] Live Business Ticker: minada, bei kushuka, group buy.
    // Alert System ya Admin (sysConfig.alerts) inadhibiti bar nzima.
    const alertSystemOn = skh.sysConfig?.alerts?.active !== false;
    if (!alertSystemOn) {
        window.updateLiveTicker('normal', '');
        return;
    }

// D. Kagua mienendo ya minada, bei kushuka, au group buy zilizo hai (ambazo muda wake haujaisha bado)
                const qActivities = skh.query(skh.collection(skh.db, "products"), skh.where("saleMode", "in", ["auction", "price_drop", "group_buy"]));
                skh.getDocs(qActivities).then(actSnap => {
                    let activeActivityFound = false;
                    const nowMs = Date.now();

                    if (!actSnap.empty) {
                        // Pitia bidhaa kupata ile ambayo muda wa mnada wake bado haujaisha
                        for (let doc of actSnap.docs) {
                            const act = doc.data();
                            const mData = act.modeData || {};
                            const endTime = mData.endTime || 0;

                            // Ikiwa muda wa kuisha upo mbele (haujaisha bado), ionyeshe live kwenye upau wa juu
                            if (nowMs < endTime) {
                                window.updateLiveTicker(act.saleMode, '', act.title);
                                activeActivityFound = true;
                                break; // Komesha loop baada ya kupata ya kwanza iliyo hai sokoni
                            }
                        }
                    }

                    // Ikiwa hakuna mnada, price drop au group buy iliyo hai kwa sasa, weka tangazo la kawaida
                    if (!activeActivityFound) {
                        window.updateLiveTicker('normal', '');
                    }
                }).catch(() => {
                    window.updateLiveTicker('normal', '');
                });
}

skh.togglePlusMenu = function togglePlusMenu() {
        const plusMenu = document.getElementById('plusMenu');
        const mainMenu = document.getElementById('mainMenu');
        if (!plusMenu) return;

        if (plusMenu.style.display === 'flex') {
            closeModals();
        } else {
            closeModals();
            plusMenu.style.display = 'flex';
            if(mainMenu) mainMenu.style.display = 'flex';
        }
    }

skh.mapRotationDeg = 0;

skh.markers = {};

skh.userGPSWatcher = null;

skh.mediaRecorder = undefined;

skh.audioChunks = [];

skh.getKmDistance = function getKmDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2);
}

skh.saveRealUserPaymentInfo = async function saveRealUserPaymentInfo() {
    if(!skh.currentUser) return;
    const type = document.getElementById('paySetupType').value;
    const accountNum = document.getElementById('setupMobileNumber').value || document.getElementById('setupBankNumber').value || document.getElementById('setupCardNumber').value;
    const name = document.getElementById('setupMobileName').value || document.getElementById('setupBankName').value || document.getElementById('setupCardName').value;

    if(!type || !accountNum || !name) { alert(" Jaza taarifa zote muhimu."); return; }

    try {
        await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), {
            paymentType: type,
            paymentAccount: accountNum,
            paymentName: name,
            paymentSetupComplete: true
        });
        alert(" Akaunti yako imehifadhiwa salama!");
        window.closeModals();
    } catch(e) { alert("Kosa: " + e.message); }
}

skh.fetchAddress = async function fetchAddress(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
        const data = await res.json();
        const a = data.address;
        let locationName = a.building || a.amenity || a.shop || a.office || a.road || a.suburb || a.neighbourhood || '';
        let city = a.city || a.town || a.village || '';
        let finalName = `${locationName}, ${city}`.trim();
        return finalName.length > 5 ? finalName : data.display_name;
    } catch (e) { 
        return "Eneo la Tukio"; 
    }
}

skh.masterCommands = {
     updateSokoPayFormFields: window.updateSokoPayFormFields,
    calculateSokoPaySplit: window.calculateSokoPaySplit,
    adjustSokoPaySplitManual: window.adjustSokoPaySplitManual,
    runSokoPayTimeLockChronJob: window.runSokoPayTimeLockChronJob,

      submitSokohaiService: window.submitSokohaiService,
    updateHubSubcategories: window.updateHubSubcategories,
    updateHubCategories: window.updateHubCategories,
    // Ongeza hizi ndani ya masterCommands ili zitambulike
submitSokohaiService: window.submitSokohaiService,
updateHubSubcategories: window.updateHubSubcategories,
generateHubServiceFilters: window.generateHubServiceFilters,
initHubOverviewCharts: window.initHubOverviewCharts,
switchProviderDashTab: window.switchProviderDashTab,
loadProviderDashboard: window.loadProviderDashboard,
    loadMarketplaceRequests: window.loadMarketplaceRequests,
    filterMarketplace: window.filterMarketplace,
    setupDriverActiveJobsQuery: window.setupDriverActiveJobsQuery,
    initLogisticsHubOverviewCharts: window.initLogisticsHubOverviewCharts,
    verifyTokenCenterDL: window.verifyTokenCenterDL,
    setupDriverRealtimeQuery: window.setupDriverRealtimeQuery,
    renderSellerLogisticsTab: window.renderSellerLogisticsTab,
    verifySellerDispatchToken: window.verifySellerDispatchToken,
    confirmSellerDispatch: window.confirmSellerDispatch,
    boardPassengerByOtp: window.boardPassengerByOtp,
    triggerVehicleBreakdown: window.triggerVehicleBreakdown,
    // Hakikisha functions hizi zipo ndani ya masterCommands
    initExecutiveControlTowerCharts: window.initExecutiveControlTowerCharts,
    initProductAnalyticsCharts: window.initProductAnalyticsCharts,
    openScrapModal: window.openScrapModal,
    calculateScrapCost: window.calculateScrapCost,
    saveScrapTransaction: window.saveScrapTransaction,
    toggleLandedCostCalculator: window.toggleLandedCostCalculator,
    calculateLandedCost: window.calculateLandedCost,
    openPrintingModal: window.openPrintingModal,
    calculatePrintingCost: window.calculatePrintingCost,
    savePrintingJob: window.savePrintingJob,
    openProjectModal: window.openProjectModal,
    switchIndustrialTab: window.switchIndustrialTab,
    saveConstructionProject: window.saveConstructionProject,
    saveGarageService: window.saveGarageService,
    openRepairModal: window.openRepairModal,
    saveRepairOrder: window.saveRepairOrder,
    selectProductSize: window.selectProductSize,
    selectProductColor: window.selectProductColor,
    openSpoilagePrompt: window.openSpoilagePrompt,
    openStartShiftPrompt: window.openStartShiftPrompt,
    closeCashierShiftPrompt: window.closeCashierShiftPrompt,
    markLoanPaidPro: window.markLoanPaidPro,
    receivePurchaseOrder: window.receivePurchaseOrder,
    openProcurementModal: window.openProcurementModal,
    switchProcurementTab: window.switchProcurementTab,
    saveSupplierProfile: window.saveSupplierProfile,
    searchProductForPO: window.searchProductForPO,
    selectProductForPO: window.selectProductForPO,
    createPurchaseOrder: window.createPurchaseOrder,
    initControlTowerCharts: window.initControlTowerCharts,
    populateControlTowerTables: window.populateControlTowerTables,
  switchPosActionType: window.switchPosActionType,
    searchDebtorsLive: window.searchDebtorsLive,
    selectDebtorForPayment: window.selectDebtorForPayment,
    submitCollectDebtPayment: window.submitCollectDebtPayment,
    searchProductsForReturnLive: window.searchProductsForReturnLive,
    selectProductForReturn: window.selectProductForReturn,
    submitReturnSale: window.submitReturnSale,
    submitSupplierPaymentOS: window.submitSupplierPaymentOS,
    saveShopSettings: window.saveShopSettings,
     openStockTransferModal: window.openStockTransferModal,
    searchProductForTransfer: window.searchProductForTransfer,
    selectProductForTransfer: window.selectProductForTransfer,
    submitStockTransfer: window.submitStockTransfer,
    verifyLogisticsToken: window.verifyLogisticsToken,
    releaseCargoWithToken: window.releaseCargoWithToken,
       addActivityLog: window.addActivityLog,
    addPosCartItem: window.addPosCartItem,
    renderPosCart: window.renderPosCart,
    toggleCartItemPriceMode: window.toggleCartItemPriceMode,
    updatePosCartQty: window.updatePosCartQty,
    removePosCartItem: window.removePosCartItem,
    submitPosSale: window.submitPosSale,
    searchPosProductsLive: window.searchPosProductsLive,
    loadDebtsListInLedger: window.loadDebtsListInLedger,
    recordStaffAttendance: window.recordStaffAttendance,
    switchOsTab: window.switchOsTab,
     toggleProductFormFields: window.toggleProductFormFields,
    toggleBulkPackagingFields: window.toggleBulkPackagingFields,
    updateFormSubcats: window.updateFormSubcats,
    submitSeller: window.submitSeller,
    loadAdminDashboard: window.loadAdminDashboard,
    resolvePlatformDispute: window.resolvePlatformDispute,
    loadAgentDashboard: window.loadAgentDashboard,
    submitAgentFromDash: window.submitAgentFromDash,
    openOfflineStockModal: window.openOfflineStockModal,
    switchStockTab: window.switchStockTab,
    searchExistingStockForUpdate: window.searchExistingStockForUpdate,
    updateExistingStockAmount: window.updateExistingStockAmount,
    calculatePosTotal: window.calculatePosTotal,
    togglePosDebtFields: window.togglePosDebtFields,
    changeChartTimeframe: window.changeChartTimeframe,
    switchOsTab: window.switchOsTab,
    searchPosProductsLive: window.searchPosProductsLive,
    addPosCartItem: window.addPosCartItem,
    updatePosCartQty: window.updatePosCartQty,
    removePosCartItem: window.removePosCartItem,
    simulateBarcodeScan: window.simulateBarcodeScan,
    togglePosDebtArea: window.togglePosDebtArea,
    submitPosSale: window.submitPosSale,
    submitPredefinedExpense: window.submitPredefinedExpense,
    submitAddNewStaff: window.submitAddNewStaff,
    recordStaffAttendance: window.recordStaffAttendance,
    openLogisticsTokenModal: window.openLogisticsTokenModal,
    openMyDeliveries: window.openMyDeliveries,
    openMyTrips: window.openMyTrips,
    openSavedItems: window.openSavedItems,
    submitRating: window.submitRating,
    showForm: window.showForm,
    openDirectHire: window.openDirectHire,
    submitDirectHire: window.submitDirectHire, 
    closeModals: window.closeModals,
    openSokoPay: window.openSokoPay,
    selectSellerType: window.selectSellerType,
    toggleClaimFields: window.toggleClaimFields,
    submitDeviceClaim: window.submitDeviceClaim,
    triggerDeviceCommand: window.triggerDeviceCommand,
    simulateStolenPhoneAction: window.simulateStolenPhoneAction,
    openSidebarMenu: window.openSidebarMenu,
    openProfile: window.openProfile,
    openUserPaymentModal: window.openUserPaymentModal,
    openBuyerOrdersModal: window.openBuyerOrdersModal,
    openCart: window.openCart,
    openNotifications: window.openNotifications,
    openChatList: window.openChatList,
    switchMode: window.switchMode,
    toggleSellerType: window.toggleSellerType,
    updateApp: window.updateApp,
    handleSearch: window.handleSearch, 
    openCategoryModal: window.openCategoryModal,
    setMarketMode: window.setMarketMode,
    setServiceSection: window.setServiceSection,
    setDeliverySection: window.setDeliverySection,

   
  
  
    doLogout: window.doLogout,
    openProduct: window.openProduct,
    addToCart: window.addToCart,
    startChat: window.startChat,
    saveRealUserPaymentInfo: window.saveRealUserPaymentInfo,
    registerOfflineMember: window.registerOfflineMember,
    checkAgentAndShowForm: window.checkAgentAndShowForm,
    togglePlusMenu: window.togglePlusMenu,
    toggleSokoPayTab: window.toggleSokoPayTab,
    generateSokoPayCode: window.generateSokoPayCode,
    verifyAndPreviewSokoPay: window.verifyAndPreviewSokoPay,
    proceedToPaySokoPay: window.proceedToPaySokoPay,
    trackSokoPayTransaction: window.trackSokoPayTransaction,
    loadAndRenderDashboard: window.loadAndRenderDashboard,
    directRequestTransporter: window.directRequestTransporter,
    cancelCurrentOrder: window.cancelCurrentOrder,
    deleteRideOrder: window.deleteRideOrder,
    chainNextLeg: window.chainNextLeg,
    openLiveMap: window.openLiveMap,
    
    // Nyongeza za kuendesha POS mpya bila makosa
    togglePosPaymentDetails: window.togglePosPaymentDetails,
    calculatePosChange: window.calculatePosChange,
    
    deleteAd: window.deleteAd,
    openEditModal: window.openEditModal,
    toggleEditModeFields: window.toggleEditModeFields,
    submitEditForm: window.submitEditForm,
    deleteOfflineItem: window.deleteOfflineItem,
    
    saveShopSetup: window.saveShopSetup,
    saveOfflineInventoryItem: window.saveOfflineInventoryItem,
    openOfflineSaleForm: window.openOfflineSaleForm,
    saveLedgerEntry: window.saveLedgerEntry,
    toggleLedgerInputs: window.toggleLedgerInputs,
    markDebtPaid: window.markDebtPaid,
    markLoanPaid: window.markLoanPaid,
    payStaffSalary: window.payStaffSalary,
    assignStaffTaskPrompt: window.assignStaffTaskPrompt,
    completeStaffTask: window.completeStaffTask,
    completeStaffTask: window.completeStaffTask,
    updateDeliveryFilters: window.updateDeliveryFilters,
    deleteOrderLog: window.deleteOrderLog,
    deleteDriverTrip: window.deleteDriverTrip,
    saveShopSettings: window.saveShopSettings
};

skh.hb = document.querySelector('.nav-tab');

skh.qSenderOrdersWorkaround = function qSenderOrdersWorkaround(uid, fieldName) {
    return skh.query(skh.collection(skh.db, "orders"), skh.where(fieldName, "==", uid), skh.orderBy("date", "desc"), skh.limit(10));
}

skh.activeContractsListFilter = function activeContractsListFilter(uid, snapB, snapS, snapLBuyer, snapLOwner) {
    let list = [];
    const pushItem = (doc) => {
        const d = doc.data();
        if (d.status === 'held' || d.status === 'shipped' || d.status === 'disputed' || d.status === 'in_transit') {
            list.push({ id: doc.id, ...d });
        }
    };
    snapB.forEach(pushItem);
    snapS.forEach(pushItem);
    snapLBuyer.forEach(pushItem);
    snapLOwner.forEach(pushItem);
    return list;
}

skh.uploadPrintingFileIfAny = async function uploadPrintingFileIfAny(){
    const file=document.getElementById('prFileInput')?.files?.[0]; if(!file) return null;
    // [PHASE 4.2] Uploader mmoja wa pamoja (folder: sokohai_printing_jobs)
    try{ const r=await window.skhUploadFromFile(file,{folder:'sokohai_printing_jobs'}); return (r && r.url) ? { url:r.url, name:file.name, type:file.type, size:file.size, provider:'cloudinary' } : { name:file.name, type:file.type, size:file.size, provider:'local_only' }; }catch(e){ return { name:file.name, type:file.type, size:file.size, provider:'upload_failed', error:e.message }; }
}

skh.smartCartItems = function smartCartItems(){ try { skh.myCart = JSON.parse(skh.localStorage.getItem('sokohai_cart')) || skh.myCart || []; } catch(e) {} return skh.myCart || []; }

skh.smartCartPrice = function smartCartPrice(x){ return parseFloat(String(x.price||0).replace(/,/g,'')) || 0; }

skh.smartCartQty = function smartCartQty(x){ return Math.max(1, parseInt(x.qty || x.quantity || 1)); }

skh.smartCartSellerId = function smartCartSellerId(x){ return x.sellerId || x.userId || x.ownerId || 'unknown_seller'; }

skh.smartCartSellerName = function smartCartSellerName(x){ return x.sellerName || x.ownerName || x.seller || 'Seller'; }

skh.smartCartImg = function smartCartImg(x){ try { return skh.getOptimizedImageUrl(x.image || x.images?.[0] || ''); } catch(e) { return x.image || x.images?.[0] || ''; } }

skh.smartCartToken = function smartCartToken(){ return 'SPC-' + Date.now() + '-' + Math.random().toString(36).slice(2,7).toUpperCase(); }

skh.smartCartSave = function smartCartSave(){ skh.localStorage.setItem('sokohai_cart', JSON.stringify(skh.myCart || [])); try { if(skh.currentUserData?.docId) skh.updateDoc(skh.doc(skh.db,'users',skh.currentUserData.docId), { cart: skh.myCart || [] }); } catch(e) {} }

skh.spStatusClass = function spStatusClass(s=''){ const x=String(s).toLowerCase(); if(x.includes('delivered')||x.includes('complete')||x.includes('verified')||x.includes('protected')||x.includes('secured')) return 'green'; if(x.includes('pending')||x.includes('waiting')||x.includes('preparing')||x.includes('transit')) return 'amber'; if(x.includes('dispute')||x.includes('refund')) return 'red'; return ''; }

skh.spDocText = function spDocText(title, tx){ return `${title}\n\nOrder: ${tx.orderId}\nTransaction Token: ${tx.transactionToken}\nSeller: ${skh.skhEscape(tx.sellerName || tx.sellerId)}\nBuyer: ${skh.skhEscape(tx.buyerName || tx.buyerId)}\nAmount: TSh ${(tx.amount || tx.totals?.grandTotal || 0).toLocaleString()}\nPayment: ${tx.paymentStatus}\nEscrow: ${tx.escrowStatus}\nShipment: ${tx.shipmentStatus}\nDate: ${tx.createdAt}`; }

skh.spDownloadText = function spDownloadText(filename, text){ const blob=new Blob([text],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

skh.spTimelineBase = function spTimelineBase(){ return [
    ['Order Created','Order created in SokoPay Core'],
    ['Payment Received','Payment captured/awaiting verification'],
    ['Escrow Protected','Money secured by SokoPay Escrow'],
    ['Seller Confirmed','Seller has confirmed the order'],
    ['Packed','Seller packed the order'],
    ['Courier Picked','Courier collected shipment'],
    ['Delivered','Buyer received order'],
    ['Completed','Escrow released / contract completed']
]; }

skh.spTokens = function spTokens(orderId){ return { paymentToken:'PAY-'+orderId, shipmentToken:'SHP-'+orderId, escrowToken:'ESC-'+orderId, verificationToken:'VER-'+orderId }; }

skh.buildSokoPayCoreTx = function buildSokoPayCoreTx({ orderId, transactionToken, sellerId, sellerItems, calc, sellerProfile=null }){
    const subtotal=sellerItems.reduce((s,x)=>s+skh.smartCartPrice(x)*skh.smartCartQty(x),0);
    const tokens=skh.spTokens(orderId+'-'+String(sellerId).slice(0,6));
    const outsideSeller = !sellerId || sellerId === 'unknown_seller' || sellerItems.some(x=>x.outsideSeller || x.isExternalSeller);
    const sellerPortalToken = 'SEL-' + Math.random().toString(36).slice(2,10).toUpperCase();
    return {
        orderId, transactionToken, ...tokens,
        buyerId:skh.currentUser.uid, buyerName:skh.currentUser.displayName||skh.currentUserData?.fullName||'Buyer',
        sellerId:sellerId || 'outside_seller', sellerName:sellerItems[0]?.sellerName || sellerItems[0]?.ownerName || 'Seller', sellerVerified:!!sellerProfile?.verified || !outsideSeller,
        outsideSeller, sellerPortalToken, sellerPortalLink:`sokohai://seller-portal/${sellerPortalToken}`,
        items:sellerItems, amount:subtotal, totals:calc,
        paymentStatus:'Payment Pending', escrowStatus:'Waiting Payment', shipmentStatus:'Preparing', contractStatus:'Contract Active', orderStatus:'Pending', tokenStatus:'Tokens Ready',
        courier:{ name:'Not assigned', phone:'', vehicle:'', currentLocation:null, eta:'—', distance:'—' },
        sellerDetails:{ rating:sellerProfile?.rating || '—', businessName:sellerProfile?.shopName || sellerItems[0]?.sellerName || 'Seller', supportContact:sellerProfile?.phone || sellerItems[0]?.sellerPhone || '' },
        contract:{ warranty:'Warranty Active', returnPolicy:'Return Policy Available', protectionEnds:new Date(Date.now()+7*86400000).toISOString(), digitalAgreement:'Generated' },
        documents:{ receipt:true, invoice:true, deliveryNote:true, warranty:true, contract:true },
        timeline:skh.spTimelineBase().map((x,idx)=>({ title:x[0], description:x[1], at: idx===0?new Date().toISOString():null, done:idx===0 })),
        createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), source:'smart_cart_sokopay_core'
    };
}

skh.updatePendingSokoPayAfterPayment = async function updatePendingSokoPayAfterPayment(paymentRef='', provider=''){
    let ids=[]; try{ ids=JSON.parse(sessionStorage.getItem('pending_sokopay_core_ids')||'[]'); }catch(e){}
    if(!ids.length) return;
    for(const id of ids){
        try{
            await skh.updateDoc(skh.doc(skh.db,'sokopay_core_transactions',id), { paymentStatus:'Payment Protected', escrowStatus:'Money Secured', orderStatus:'Confirmed', paymentProvider:provider, paymentRef, updatedAt:new Date().toISOString(), timeline:skh.arrayUnion({ title:'Payment Verified', description:'Payment received and protected by SokoPay Escrow', at:new Date().toISOString(), done:true }) });
        }catch(e){ console.log('pending core update failed', id, e); }
    }
}

skh.orchNum = function orchNum(v, fallback=0){ const n=parseFloat(String(v ?? '').replace(/,/g,'')); return Number.isFinite(n)?n:fallback; }

skh.orchProductMeta = function orchProductMeta(p={}){
    const weightKg = skh.orchNum(p.weightKg ?? p.weight ?? p.productWeight, 1);
    const lengthCm = skh.orchNum(p.lengthCm ?? p.length ?? p.dimL, 20);
    const widthCm = skh.orchNum(p.widthCm ?? p.width ?? p.dimW, 20);
    const heightCm = skh.orchNum(p.heightCm ?? p.height ?? p.dimH, 10);
    return {
        productId:p.id || p.productId || '', productName:p.title || p.name || 'Product', productImages:p.images || (p.image?[p.image]:[]),
        sellerId:p.userId || p.sellerId || '', sellerName:p.ownerName || p.sellerName || p.seller || 'Seller', storeName:p.shopName || p.storeName || p.ownerName || 'Store',
        category:p.category || p.productCategory || 'General', sku:p.sku || p.SKU || ('SKU-'+(p.id||Date.now()).toString().slice(-6)),
        unitPrice:skh.smartCartPrice ? skh.smartCartPrice(p) : skh.orchNum(p.price), discount:skh.orchNum(p.discount,0), tax:skh.orchNum(p.tax,0),
        weightKg, dimensions:{ lengthCm,widthCm,heightCm }, fragile:!!(p.fragile || p.isFragile), hazardous:!!(p.hazardous || p.isHazardous),
        warranty:p.warranty || 'Seller Warranty', returnPolicy:p.returnPolicy || 'SokoHai/Seller return policy', availableStock:p.stock ?? p.quantity ?? p.availableStock ?? '—',
        verificationStatus:p.productVerificationStatus || p.verificationStatus || 'marketplace_listed', preferredShipping:p.preferredShipping || p.shippingRequirements || (p.fragile?'fragile':'standard')
    };
}

skh.orchPackageSummary = function orchPackageSummary(items=skh.smartCartItems()){
    let weight=0, volume=0, fragile=false, hazardous=false, sellers=new Set();
    items.forEach(x=>{ const q=skh.smartCartQty(x); const m=x.cartMeta || skh.orchProductMeta(x); weight += (m.weightKg||1)*q; volume += ((m.dimensions?.lengthCm||20)*(m.dimensions?.widthCm||20)*(m.dimensions?.heightCm||10))*q; fragile = fragile || !!m.fragile; hazardous = hazardous || !!m.hazardous; sellers.add(skh.smartCartSellerId(x)); });
    const sizeClass = weight <= 25 ? 'small' : weight <= 500 ? 'medium' : 'large';
    return { weightKg:Math.round(weight*100)/100, volumeCm3:Math.round(volume), fragile, hazardous, sellersCount:sellers.size, sizeClass };
}

skh.orchCarrierSuitable = function orchCarrierSuitable(c, pkg, service){
    if(service && c.service !== service) return false;
    if(pkg.weightKg > (c.capacityKg || 0)) return false;
    if(pkg.fragile && !c.insurance && c.service !== 'customer_pickup') return false;
    return true;
}

skh.orchBuildShipment = function orchBuildShipment(core, carrier, calc){
    const shipmentId='SHPID-'+Date.now()+'-'+Math.random().toString(36).slice(2,5).toUpperCase();
    const trackingId='TRK-'+Math.random().toString(36).slice(2,10).toUpperCase();
    return {
        shipmentId, trackingId, shipmentToken:core.shipmentToken, orderId:core.orderId, transactionToken:core.transactionToken, sokopayCoreId:core.sokopayCoreId || '',
        buyerId:core.buyerId, sellerId:core.sellerId, courierId:carrier?.id || 'not_selected', courierName:carrier?.name || 'Not selected', courierCompany:carrier?.company || '',
        driverName:carrier?.driverName || 'After assignment', driverPhone:carrier?.driverPhone || '', vehicleType:carrier?.vehicleType || '', vehiclePlate:carrier?.plate || 'After assignment', capacity:carrier?.capacity || '', insuranceStatus:carrier?.insurance?'insured':'not_insured', verificationBadge:carrier?.verified?'verified':'pending', rating:carrier?.rating || '—',
        pickupLocation:core.items?.[0]?.sellerLocation || core.items?.[0]?.location || 'Seller location', deliveryAddress:document.getElementById('smartShippingAddress')?.value || window.smartCartState.address || '', specialInstructions:document.getElementById('smartOrderNotes')?.value || window.smartCartState.notes || '', package:calc.package, escrowStatus:core.escrowStatus, shippingCost:carrier?.price || calc.shipping, status:'Courier Assigned', timeline:[{title:'Shipment Created',at:new Date().toISOString(),done:true},{title:'Courier Assigned',at:new Date().toISOString(),done:true},{title:'Collected',at:null,done:false},{title:'In Transit',at:null,done:false},{title:'Delivered',at:null,done:false}], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    };
}

skh.lgxPackage = function lgxPackage(){ return typeof skh.orchPackageSummary==='function' ? skh.orchPackageSummary(skh.smartCartItems()) : { weightKg:1, volumeCm3:4000, fragile:false, hazardous:false, sellersCount:1, sizeClass:'small' }; }

skh.lgxDestination = function lgxDestination(){ return window.smartCartState?.address || document.getElementById('smartShippingAddress')?.value || ''; }

skh.lgxPickup = function lgxPickup(){ const items=skh.smartCartItems(); return items[0]?.sellerLocation || items[0]?.location || items[0]?.cartMeta?.pickupAddress || 'Seller pickup location'; }

skh.lgxRouteText = function lgxRouteText(){ return `${skh.lgxPickup()} -> ${skh.lgxDestination() || 'Delivery address pending'}`; }

skh.lgxVehicleOptions = function lgxVehicleOptions(company, pkg){
    const all = [
        { type:'Motorcycle', icon:'', capacityKg:25, priceAdj:0, etaAdj:'Fast', goodFor:['small','express'] },
        { type:'Bajaj', icon:'', capacityKg:80, priceAdj:1500, etaAdj:'Fast', goodFor:['small'] },
        { type:'Car', icon:'', capacityKg:150, priceAdj:2500, etaAdj:'Same Day', goodFor:['small','fragile'] },
        { type:'Pickup', icon:'', capacityKg:800, priceAdj:5000, etaAdj:'Same/Next Day', goodFor:['medium','fragile'] },
        { type:'Van', icon:'', capacityKg:2000, priceAdj:8000, etaAdj:'1 Day', goodFor:['medium'] },
        { type:'Truck', icon:'', capacityKg:8000, priceAdj:25000, etaAdj:'1-3 Days', goodFor:['large','heavy'] },
        { type:'Trailer', icon:'', capacityKg:24000, priceAdj:60000, etaAdj:'2-5 Days', goodFor:['heavy'] },
        { type:'Container', icon:'', capacityKg:28000, priceAdj:90000, etaAdj:'3-7 Days', goodFor:['heavy','long_distance'] },
        { type:'Refrigerated Truck', icon:'', capacityKg:5000, priceAdj:45000, etaAdj:'1-3 Days', goodFor:['cold_chain'] }
    ];
    const preferred = (skh.smartCartItems().some(x => String(x.cartMeta?.preferredShipping||x.preferredShipping||'').includes('cold')));
    return all.filter(v => v.capacityKg >= pkg.weightKg && (!preferred || v.type==='Refrigerated Truck')).map((v,idx)=>({ id:(company.id||'co')+'_'+v.type.toLowerCase().replace(/\s+/g,'_'), ...v, plate: idx<3 ? 'After assignment' : 'N/A', insurance: company.insurance || pkg.fragile, driverRating: company.rating || 4.3, status:'Available', cost: Math.max(0, (company.price||0) + v.priceAdj), eta: v.etaAdj }));
}

skh.lgxScoreCarrier = function lgxScoreCarrier(c,pkg,state){
    let score=50;
    if(c.verified) score+=12; if(c.insurance && pkg.fragile) score+=12; if((c.capacityKg||0)>=pkg.weightKg) score+=15;
    const price=Number(c.price||0); if(price<=7000) score+=10; else if(price<=15000) score+=6; else score+=2;
    const rating=parseFloat(c.rating); if(Number.isFinite(rating)) score += Math.min(10, rating*2);
    if(c.sponsored) score += 6;
    if(c.service===state.service) score += 10;
    if(pkg.sizeClass==='small' && /moto|motor/i.test(c.name+' '+c.vehicleType)) score+=8;
    if(pkg.sizeClass!=='small' && /van|truck|pickup/i.test(c.vehicleType+' '+c.vehicle)) score+=8;
    return Math.min(99, Math.round(score));
}

skh.lgxLoadCompanies = async function lgxLoadCompanies(){
    const pkg=skh.lgxPackage();
    let carriers = typeof window.loadSokoHaiCarriers==='function' ? await window.loadSokoHaiCarriers() : (window.sokohaiCarrierFallbacks||[]);
    // Add sponsored/premium examples without replacing existing.
    carriers = carriers.map((c,i)=>({ ...c, sponsored: c.sponsored ?? (i===1), premium: c.premium ?? (c.verified && (parseFloat(c.rating)||0)>=4.5), coverageArea:c.coverageArea||'Local/Regional routes', completedDeliveries:(c.completedDeliveries != null ? c.completedDeliveries : '—') /* [AUDIT-FIX §42] ilikuwa Math.random(80..980) */, activeVehicles:(c.activeVehicles != null ? c.activeVehicles : '—') /* [AUDIT-FIX §42] ilikuwa Math.random(2..42) */, branches:c.branches||'Main branch', warehouses:c.warehouses||'Available on request', operatingHours:c.operatingHours||'08:00 - 20:00', coldChain: /refrigerated|cold/i.test(c.vehicleType||''), heavyCargo:(c.capacityKg||0)>2000, fragileCargo:!!c.insurance, expressDelivery:/moto|express|fast/i.test(c.name+' '+c.eta) }));
    carriers = carriers.filter(c => (c.capacityKg||0)>=pkg.weightKg || c.service==='customer_pickup');
    carriers.forEach(c=>c.matchScore=skh.lgxScoreCarrier(c,pkg,window.logisticsMarketplaceState));
    window.logisticsMarketplaceState.carriers=carriers;
    return carriers;
}

skh.lgxApplyFilters = function lgxApplyFilters(list){
    const s=window.logisticsMarketplaceState; const q=String(s.query||'').toLowerCase();
    let out=list.filter(c => !q || String(c.name+' '+c.company+' '+c.coverageArea+' '+c.vehicleType).toLowerCase().includes(q));
    if(s.filter==='sponsored') out=out.filter(c=>c.sponsored);
    if(s.filter==='nearby') out=out.filter(c=>c.source==='transport_profiles' || c.service==='sokohai_logistics');
    if(s.filter==='verified') out=out.filter(c=>c.verified);
    if(s.filter==='premium') out=out.filter(c=>c.premium);
    if(s.filter==='standard') out=out.filter(c=>!c.premium && c.verified);
    if(s.filter==='economy') out=out.sort((a,b)=>(a.price||0)-(b.price||0)).slice(0,8);
    if(s.filter==='suggested') out=out.filter(c=>c.matchScore>=70);
    if(s.sort==='price') out=out.sort((a,b)=>(a.price||0)-(b.price||0));
    else if(s.sort==='eta') out=out.sort((a,b)=>String(a.eta).localeCompare(String(b.eta)));
    else if(s.sort==='rating') out=out.sort((a,b)=>(parseFloat(b.rating)||0)-(parseFloat(a.rating)||0));
    else out=out.sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));
    return out;
}

// [FIX 6] `skh` ipatikane kwa scripts za kawaida (si module tu).
try { window.skh = skh; } catch (e) {}

export { skh };

// [§19 GENERIC-ALERT FIX 2026-09] Ripoti kamili ya kiufundi kwa console
// (function, collection, docId, requestId, timestamp) bila kumfanyia
// mtumiaji "raw Firebase error". Hutumika na vitendo vya majadiliano/SokoPay.
window.skhReportError = function skhReportError(scope, err, ctx) {
    try {
        var rec = {
            scope: scope || 'unknown',
            message: (err && err.message) || String(err || ''),
            code: (err && err.code) || null,
            stackFirst: (err && err.stack ? String(err.stack).split('\n').slice(0, 4).join(' | ') : null),
            ctx: ctx || {},
            ts: new Date().toISOString()
        };
        console.error('[skh:err]', rec);
        return rec;
    } catch (e) { return null; }
};

/* ================= [R24] GLOBAL TOAST (window.showToast) =================
 * Chat groups/discover zilitumia window.showToast kwa arifa fupi (success/info)
 * lakini hakukuwa na implimentesheni — guarded calls zote zilikuwa no-op.
 * Hii ni toast ndogo isiyozuia UI: fixed-bottom, auto-dismiss, ARIA-live.
 * Si modal; si fake state; halina effect yoyote kwenye store/screens. */
(function () {
    if (window.showToast) return;      // usibadilshwe iwapo tayari ipo (tests hu-spy)
    var host = null;
    function ensureHost() {
        if (host && document.body.contains(host)) return host;
        host = document.createElement('div');
        host.id = 'skhToastHost';
        host.setAttribute('aria-live', 'polite');
        host.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:110000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:92vw;';
        document.body.appendChild(host);
        return host;
    }
    window.showToast = function (msg, kind) {
        try {
            var h = ensureHost();
            var t = document.createElement('div');
            var bg = kind === 'success' ? '#18A982' : kind === 'error' ? '#dc2626' : '#0f172a';
            t.style.cssText = 'background:' + bg + ';color:#fff;font-size:13px;font-weight:700;padding:10px 16px;border-radius:99px;box-shadow:0 8px 24px rgba(15,23,42,.28);opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;max-width:100%;text-align:center;';
            t.textContent = String(msg || '');
            h.appendChild(t);
            requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
            setTimeout(function () {
                t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
                setTimeout(function () { try { t.remove(); } catch (e) {} }, 240);
            }, 2800);
        } catch (e) {}
    };
})();

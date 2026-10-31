// Local-only stand-in for js/app/00-bootstrap.js used by tools/product_preview_server.mjs.
// The REAL product modules (builder, forms, app-state, showcase, uploads) run
// against this deterministic "cloud": products are kept in window.testDocs for
// the session only. No Firebase, no network, no accounts. Never deployed
// (tools/ is outside dist/).
// [REPAIR 2026-10 T-03] This file was referenced since the preview server was
// added but had never been committed, so the taxonomy browser tests could not run.
import {
  buildProductWrite, validateProduct, publicationStatus, availabilityStatus,
  normalizeVariants, normalizeConcreteVariantCombinations, PRODUCT_SCHEMA_VERSION
} from '../../js/app/39-product-core.js';

const testDocs = new Map();
window.testDocs = testDocs;
let seq = 0;
const ref = (col, id) => ({ col, id: String(id) });
const snap = (id, data) => ({ id, exists: () => data !== undefined, data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data))) });
const store = col => (col === 'products' ? testDocs : (window.__previewOther = window.__previewOther || new Map()));
const noop = async () => {};

export const skh = {
  db: { preview: true },
  auth: { currentUser: null },
  fApp: {},
  currentUser: { uid: 'preview-seller', email: 'seller@preview.local', displayName: 'Preview Seller', getIdToken: async () => 'preview' },
  currentUserData: { uid: 'preview-seller', docId: 'preview-seller', fullName: 'Preview Seller', isSeller: true, following: [] },
  sysConfig: { modes: {}, fees: {}, features: {} },
  localStorage: window.localStorage,
  myCart: [], cachedItems: [], _feedCache: new Map(), navMap: {}, serviceDataMap: {},
  currentMode: 'seller', currentLimit: 20, lastScrollY: 0, userLat: null, userLon: null,
  activeCategory: '', activeSubCategory: '', activeServiceSection: '', activeDeliverySection: '', currentFeedCollection: 'products', activeCheckoutAmount: 0,
  PRODUCT_SCHEMA_VERSION,
  buildProductWrite, validateProduct, normalizeConcreteVariantCombinations,
  normalizeProductVariants: normalizeVariants,
  productPublicationStatus: publicationStatus, productAvailabilityStatus: availabilityStatus,
  requireAuth: () => true,
  setLoading: () => {}, loadMainFeed: noop, renderFeedUI: () => {}, loadRelatedProducts: noop, listenToUnreadNotifications: () => {},
  paymentGate: () => false, calculateDynamicPrice: p => Number(p && p.price) || 0, calculateDistance: () => null,
  getOptimizedImageUrl: x => x, skhEscape: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'),
  skhJsEsc: s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
  cardVerified: () => '', cardTypeBadge: () => '', cardRating: () => '', cardModeBadge: () => '', cardLocation: () => '',
  // DOM handles the real bootstrap looks up once (05-forms.js uses them).
  mm: document.getElementById('mainMenu'), dpu: document.getElementById('dpUploadInput'),
  // Firestore-shaped API over the session store.
  collection: (db, col) => ({ col }),
  doc: (db, col, id) => ref(col, id),
  query: (c) => c, where: () => null, limit: () => null, orderBy: () => null,
  arrayUnion: (...v) => v, deleteField: () => undefined, serverTimestamp: () => new Date().toISOString(), increment: n => n,
  addDoc: async (c, data) => { const id = 'preview_' + (++seq); store(c.col).set(id, JSON.parse(JSON.stringify(data))); return { id }; },
  setDoc: async (r, data, o) => { const s = store(r.col); s.set(r.id, Object.assign(o && o.merge ? (s.get(r.id) || {}) : {}, JSON.parse(JSON.stringify(data)))); },
  updateDoc: async (r, patch) => { const s = store(r.col); if (!s.has(r.id)) throw new Error('not-found'); s.set(r.id, Object.assign(s.get(r.id), JSON.parse(JSON.stringify(patch)))); },
  getDoc: async (r) => snap(r.id, store(r.col).get(r.id)),
  getDocs: async (c) => { const rows = [...store(c.col).entries()]; return { size: rows.length, empty: !rows.length, docs: rows.map(([id, d]) => snap(id, d)), forEach: fn => rows.forEach(([id, d]) => fn(snap(id, d))) }; },
  // Uploads: the preview intercepts Cloudinary; the signature step stays in transition mode.
  // productVariantsSave / inventoryAdjust mirror the server authority (functions/inventory-authority.js):
  // variant rows are merged by variantId, live stock is kept, new rows start at 0 and opening stock
  // arrives through inventoryAdjust. The browser never writes variant stock itself (F6).
  wrapCallable: (name) => async (data) => {
    if (name === 'uploadSignature') return { data: { ok: true, mode: 'unsigned' } };
    if (name === 'productVariantsSave') {
      const doc = testDocs.get(String(data.productId)); if (!doc) throw new Error('not-found');
      const live = Array.isArray(doc.variantCombinations) ? doc.variantCombinations : [];
      const rows = JSON.parse(JSON.stringify(data.variantCombinations || [])).map(r => { delete r.stock; delete r.reserved; return r; });
      const merged = live.map(cur => { const r = rows.find(x => x.variantId === cur.variantId); if (!r) return cur; const n = { ...r, stock: Number.isSafeInteger(cur.stock) ? cur.stock : 0 }; if ('reserved' in cur) n.reserved = cur.reserved; return n; });
      rows.filter(r => !live.some(c => c.variantId === r.variantId)).forEach(r => merged.push({ ...r, stock: 0 }));
      doc.variantCombinations = merged; return { data: { ok: true, count: merged.length } };
    }
    if (name === 'inventoryAdjust') {
      const doc = testDocs.get(String(data.productId)); if (!doc) return { data: { ok: true } };
      const qty = Number(data.quantity ?? data.delta ?? 0) || 0;
      const v = data.variantId && Array.isArray(doc.variantCombinations) ? doc.variantCombinations.find(x => x.variantId === data.variantId) : null;
      if (v) v.stock = Math.max(0, (Number(v.stock) || 0) + qty);
      return { data: { ok: true } };
    }
    return { data: { ok: true } };
  },
  getFunctions: () => ({}), httpsCallable: () => async () => ({ data: {} }),
  uploadImage: async () => null, updateProfile: noop, chatCore: null,
  getUserCard: async (uid) => ({ id: uid, exists: () => false, data: () => null }),
  signInWithPopup: noop, signInWithEmailAndPassword: noop, createUserWithEmailAndPassword: noop, sendPasswordResetEmail: noop, sendEmailVerification: noop, GoogleAuthProvider: function () {}
};
// Categories come from the real bootstrap via /preview-config.json (see product-preview-start.mjs).
try { const cfg = await (await fetch('/preview-config.json')).json(); skh.advancedCategories = cfg.live; } catch (e) { skh.advancedCategories = {}; }
window.skh = skh;

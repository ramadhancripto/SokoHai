/* SokoHai POS capability authority. This is POS access configuration only;
 * it does not replace Product, Inventory, Payment, or POS sale authorities. */
const LEVEL_ORDER = Object.freeze(['basic', 'partial', 'full']);
const POS_LEVELS = Object.freeze({
  basic: Object.freeze({
    id: 'basic', label: 'BASIC',
    sales: true, products: true, receipts: true, transactions: true, settings: true,
    inventory: false, purchases: false, customers: false, suppliers: false,
    expenses: false, advancedReports: false, staff: false, outlets: false
  }),
  partial: Object.freeze({
    id: 'partial', label: 'PARTIAL',
    sales: true, products: true, receipts: true, transactions: true, settings: true,
    inventory: true, purchases: true, customers: true, suppliers: true,
    expenses: true, advancedReports: true, staff: false, outlets: false
  }),
  full: Object.freeze({
    id: 'full', label: 'FULL',
    sales: true, products: true, receipts: true, transactions: true, settings: true,
    inventory: true, purchases: true, customers: true, suppliers: true,
    expenses: true, advancedReports: true, staff: true, outlets: true
  })
});
const STORAGE_KEY = 'sokohai_pos_level';
function normalizePosLevel(value) { return LEVEL_ORDER.includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'basic'; }
function getPosLevel(storage = globalThis.localStorage) { try { return normalizePosLevel(storage?.getItem(STORAGE_KEY)); } catch (_) { return 'basic'; } }
function setPosLevel(level, storage = globalThis.localStorage) { const normalized = normalizePosLevel(level); try { storage?.setItem(STORAGE_KEY, normalized); } catch (_) {} return normalized; }
function getPosCapabilities(level = getPosLevel()) { return POS_LEVELS[normalizePosLevel(level)]; }
function canUsePosCapability(capability, level = getPosLevel()) { return getPosCapabilities(level)[capability] === true; }
export { LEVEL_ORDER, POS_LEVELS, normalizePosLevel, getPosLevel, setPosLevel, getPosCapabilities, canUsePosCapability };

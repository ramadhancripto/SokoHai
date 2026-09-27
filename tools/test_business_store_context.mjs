import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../shared/business-context-core.js', import.meta.url), 'utf8');
const context = { globalThis: {}, console };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'shared/business-context-core.js' });
const core = context.SKHBusinessContextCore;
assert.ok(core, 'core is exposed');

assert.equal(core.normalizeSellerMode('online_only'), 'ONLINE');
assert.equal(core.normalizeSellerMode('offline_only'), 'OFFLINE');
assert.equal(core.normalizeSellerMode('hybrid'), 'HYBRID');
assert.equal(core.normalizeSellerMode('unknown'), null);

const basic = core.normalizeManagement({ enabled: true, level: 'BASIC' });
assert.equal(basic.level, 'BASIC');
assert.equal(basic.capabilities.products, true);
assert.equal(basic.capabilities.inventory, false);

const partial = core.normalizeManagement({ enabled: true, level: 'PARTIAL', capabilities: { inventory: true, sales: true } });
assert.equal(partial.level, 'PARTIAL');
assert.equal(partial.capabilities.inventory, true);
assert.equal(partial.capabilities.sales, true);
assert.equal(partial.capabilities.reports, false);

const disabled = core.normalizeManagement({ enabled: false, level: 'FULL' });
assert.equal(Object.values(disabled.capabilities).every(Boolean), false);
assert.equal(Object.values(disabled.capabilities).some(Boolean), false);

const empty = core.resolveBusinessContext('uid-1', {});
assert.equal(empty.business, null);
assert.equal(empty.store, null);
assert.equal(empty.ownership.ownerUid, 'uid-1');

const legacy = core.resolveBusinessContext('uid-2', {
  shopName: 'Mussa Electronics', myShopCode: 'SKH-1234', sellMode: 'offline_only', sellerType: 'permanent'
});
assert.equal(legacy.ownerUid, 'uid-2');
assert.equal(legacy.sellerMode, 'OFFLINE');
assert.equal(legacy.business.businessName, 'Mussa Electronics');
assert.equal(legacy.business.canonical, false);
assert.equal(legacy.store.canonical, false);
assert.equal(legacy.legacy.myShopCode, 'SKH-1234');

const canonical = core.resolveBusinessContext('uid-3', {
  businessId: 'business_uid-3', storeId: 'store_uid-3', businessName: 'Canonical Shop',
  sellerMode: 'HYBRID', management: { enabled: true, level: 'FULL' }
});
assert.equal(canonical.business.canonical, true);
assert.equal(canonical.store.canonical, true);
assert.equal(canonical.business.ownerUid, 'uid-3');
assert.equal(canonical.store.businessId, 'business_uid-3');
assert.equal(canonical.management.level, 'FULL');

console.log('BUSINESS/STORE CONTEXT: 22 checks passed');

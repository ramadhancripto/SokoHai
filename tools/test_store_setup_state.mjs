import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/app/14-map-onboarding.js', import.meta.url), 'utf8');
const save = source.slice(source.indexOf('window.saveShopSetup = async function()'), source.indexOf('window.autoGenerateStaffAndRules = async function'));
assert.ok(save.includes('await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), payload);'), 'legacy profile write remains awaited');
const writeAt = save.indexOf('await skh.updateDoc(skh.doc(skh.db, "users", skh.currentUser.uid), payload);');
const cacheAt = save.indexOf('skh.currentUserData = Object.assign({}, skh.currentUserData || {}, payload);');
const switchAt = save.indexOf("window.switchMode('seller')");
assert.ok(writeAt >= 0 && cacheAt > writeAt && switchAt > cacheAt, 'local profile cache is synchronized after successful persistence and before switching to seller mode');
assert.ok(save.includes("businessSetupComplete: true"), 'successful setup marks the saved profile as configured');
assert.ok(save.includes('skhEnsureBusinessContext'), 'canonical owner-scoped Business/Store creation is preserved');
console.log('STORE SETUP STATE: cache synchronization, write ordering and canonical context contract passed');

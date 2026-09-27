import assert from 'node:assert/strict';
import pkg from '../shared/service-taxonomy-core.js';
const { listServiceDomains, getServiceDomain, validateServiceDomains } = pkg;
assert.equal(validateServiceDomains().ok, true);
assert.equal(listServiceDomains().length, 10);
for (let n = 17; n <= 26; n++) {
  const domain = getServiceDomain(`CAT-${n}`);
  assert.ok(domain);
  assert.equal(domain.kind, 'SERVICE_DOMAIN');
  assert.deepEqual(domain.serviceSubcategories, []);
  assert.deepEqual(domain.serviceTypes, []);
  assert.equal(domain.detailStatus, 'MASTER_DETAIL_REQUIRED_BEFORE_DEFINITION');
}
console.log('SERVICE TAXONOMY CONTRACT: all checks passed');

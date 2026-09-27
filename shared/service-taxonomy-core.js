/* Phase 1A Service Domain foundation. No service hierarchy is invented where the approved Master detail was not supplied. */
const { CATEGORY_REGISTRY, SERVICE_DOMAINS } = require('./canonical-taxonomy-data.js');

const domainById = new Map(CATEGORY_REGISTRY.filter(x => x.kind === 'SERVICE_DOMAIN').map(x => [x.id, Object.freeze({ ...x, serviceSubcategories: Object.freeze([]), serviceTypes: Object.freeze([]), detailStatus: 'MASTER_DETAIL_REQUIRED_BEFORE_DEFINITION' })]));
function listServiceDomains() { return Array.from(domainById.values()); }
function getServiceDomain(id) { return domainById.get(String(id || '').toUpperCase()) || null; }
function isServiceDomain(id) { return SERVICE_DOMAINS.includes(String(id || '').toUpperCase()); }
function validateServiceDomains() { return { ok: SERVICE_DOMAINS.length === 10 && SERVICE_DOMAINS.every(id => domainById.has(id)), errors: [] }; }
module.exports = { listServiceDomains, getServiceDomain, isServiceDomain, validateServiceDomains };

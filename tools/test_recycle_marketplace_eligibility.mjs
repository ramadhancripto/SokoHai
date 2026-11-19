import assert from 'node:assert/strict';import {productEligible} from '../js/app/39-product-core.js';
const p={title:'Bidhaa',stock:1,price:10};
assert.equal(productEligible({...p,publicationStatus:'published',status:'active'}),true);
assert.equal(productEligible({...p,publicationStatus:'draft',status:'draft',archivedAt:null}),false);
assert.equal(productEligible({...p,publicationStatus:'archived',status:'archived',archivedAt:'2020'}),false);
assert.equal(productEligible({...p,status:'draft'}),false);
assert.equal(productEligible({...p,salesChannels:['manage_only']}),false);
assert.equal(productEligible({...p,salesChannels:['pos']}),false);
console.log('PASS draft, recycled and offline products excluded from core marketplace predicate');

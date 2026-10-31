'use strict';
const fs = require('fs');
const path = require('path');
const sharedSource = path.resolve(__dirname, '..', 'shared');
const outputDirectory = path.join(__dirname, 'shared');
// [PHASE 3 2026-10-31] functions/ is the deploy source: every shared module a
// function requires must be copied here (../shared is NOT uploaded on deploy).
const files = ['ads-design-rules.js', 'business-context-core.js', 'pos-product-identity-core.js', 'inventory-reservation-core.js', 'quantity-core.js'];
fs.mkdirSync(outputDirectory, { recursive:true });
files.forEach((name) => {
  const source = path.join(sharedSource, name);
  if (!fs.existsSync(source)) throw new Error('Shared source is missing: ' + source);
  fs.copyFileSync(source, path.join(outputDirectory, name));
});
console.log('Packaged shared rules/context at functions/shared/');

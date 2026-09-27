'use strict';
const fs = require('fs');
const path = require('path');
const sharedSource = path.resolve(__dirname, '..', 'shared');
const outputDirectory = path.join(__dirname, 'shared');
const files = ['ads-design-rules.js', 'business-context-core.js'];
fs.mkdirSync(outputDirectory, { recursive:true });
files.forEach((name) => {
  const source = path.join(sharedSource, name);
  if (!fs.existsSync(source)) throw new Error('Shared source is missing: ' + source);
  fs.copyFileSync(source, path.join(outputDirectory, name));
});
console.log('Packaged shared rules/context at functions/shared/');

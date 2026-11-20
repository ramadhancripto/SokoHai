'use strict';
/* [R-19 2026-11-20] ONE source for the public site origin on the server side.
 * CANONICAL_ORIGIN is the origin search engines / share links use today. It must match html/00-head.html,
 * robots.txt, .well-known/security.txt and js/00-config.js (SOKOHAI_CONFIG.CANONICAL_ORIGIN);
 * tools/test_canonical_domain.mjs enforces that.
 * Proposed canonical: https://sokohai.com. It is NOT active yet: on 20 Nov 2026 sokohai.com did not load,
 * while sokohaicom.netlify.app served the site. When the owner has connected the domain on Netlify:
 *     node tools/set_canonical_domain.mjs https://sokohai.com
 * (rewrites every reference consistently and rebuilds index.html). DNS / Netlify / certificates are
 * outside this repository and are changed only by the owner. */
const CANONICAL_ORIGIN = 'https://sokohaicom.netlify.app';
/* Every origin that serves the production app (same hosts as js/00-config.js FIREBASE_ENVIRONMENTS.production). */
const PRODUCTION_ORIGINS = ['https://sokohai.com', 'https://www.sokohai.com', 'https://sokohaicom.netlify.app', 'https://sokohaimarket.netlify.app'];
module.exports = { CANONICAL_ORIGIN, PRODUCTION_ORIGINS };

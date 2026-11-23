#!/usr/bin/env node
/* [L10N 2026-11-23] Part B of tools/test_l10n_live_switch_browser.mjs (same screens and helpers):
 * Kiswahili -> English -> Kiswahili gives back exactly the same visible text on every screen, and no screen scrolls
 * sideways at 360 px in either language. Split so each file stays within the browser runner's time limit. */
globalThis.__L10N_PART = 'B';
await import('./test_l10n_live_switch_browser.mjs');

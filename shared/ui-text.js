/* [UI 2026-11-21] Message text humanizer — ONE place used by every alert, confirm, prompt and toast in the app
 * (js/05-dialogs.js, js/07-toasts.js). The app has ~830 alert() calls written over time; many SHOUT in capitals
 * ("Ombi lako LIMETUMWA kwa Admin"), start with a stray space left by removed emoji, or end with "!!!".
 * This normalises presentation only — it never changes numbers, amounts, reference codes or the meaning:
 *   - trims each line and collapses runs of spaces;
 *   - lower-cases ALL-CAPS words of 4+ letters (brand names restored: SokoHai, SokoPay, PesaPal, M-Pesa; real
 *     acronyms kept: NIDA, BRELA, USSD…); tokens touching digits, "-" or "_" (codes like ORD-ABCD) are untouched;
 *   - capitalises the first letter of each line / sentence that it lower-cased;
 *   - "!!!" -> "!", "??" -> "?"; the message starts with a capital letter.
 * Browser global SKHUiText, Node require (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHUiText = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Official names only (review 2026-11-21): SokoPay is the payment brand; the old internal payment code name is NOT a
  // product name and is never produced here. SokoCart is the cart's on-screen name (js/app/23-smart-cart.js).
  var BRANDS = { SOKOHAI: 'SokoHai', SOKOPAY: 'SokoPay', SOKOCART: 'SokoCart', PESAPAL: 'PesaPal', MPESA: 'M-Pesa', TANZANIA: 'Tanzania', ADMIN: 'Admin' };
  var KEEP = { NIDA: 1, BRELA: 1, USSD: 1, HTTP: 1, HTTPS: 1, JSON: 1, TCRA: 1, TANESCO: 1, DAWASA: 1, NMB: 1, CRDB: 1, TIGO: 1, VODACOM: 1, AIRTEL: 1, HALOTEL: 1, TTCL: 1, LATRA: 1, TBS: 1, TMDA: 1, GEPG: 1 };
  var WORD = /(^|[^A-Za-z0-9_\-À-ÿ])([A-ZÀ-Þ]{4,})(?=$|[^A-Za-z0-9_\-À-ÿ])/g;

  function deshout(line) {
    var changed = false;
    var out = line.replace(WORD, function (m, pre, w) {
      if (KEEP[w]) return m;
      changed = true;
      return pre + (BRANDS[w] || w.toLowerCase());
    });
    if (!changed) return line;
    // the line may now start (or a sentence may start) with a lower-case letter that used to be a capital
    return out.replace(/(^|[.!?:]\s+)([a-zà-ÿ])/g, function (m, pre, c) { return pre + c.toUpperCase(); });
  }
  function humanize(msg) {
    if (msg == null) return '';
    var s = String(msg).replace(/\r\n?/g, '\n');
    s = s.split('\n').map(function (l) { return deshout(l.replace(/[ \t ]+/g, ' ').trim()); }).join('\n');
    s = s.replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?').replace(/\n{3,}/g, '\n\n').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);   // a message starts with a capital letter
  }
  return { humanize: humanize };
});

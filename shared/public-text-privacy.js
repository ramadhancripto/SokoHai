/* [SEO-PRIVACY 2026-11-21 review 2] What must never reach a PUBLIC page (tools/build_seo.mjs), removed from free text:
 * GPS pairs / degree coordinates / map links, e-mail addresses, phone numbers (Tanzanian and international),
 * tel: and WhatsApp links — while legitimate numeric identifiers are KEPT:
 *   - product barcodes (EAN-8, UPC-A, EAN-13, GTIN-14) written as one run with a VALID GS1 check digit,
 *   - numbers labelled as identifiers (barcode, EAN, UPC, GTIN, ISBN, SKU, IMEI, serial, model, code…),
 *   - amounts written after a currency (TSh 1 500 000, KSh 12 500).
 * A number is treated as a phone number when it
 *   - starts with + or 00 (international dialling), or
 *   - is preceded by contact words (simu, piga, call, phone, tel, WhatsApp, contact, wasiliana…), or
 *   - starts with a mobile country code without the + (255/254/256/250/257/243/260/265/258/27 + mobile digit), or
 *   - is a local number starting with 0 (10–11 digits), or
 *   - is written in phone-style groups (e.g. "754 111 222", "803-123-4567").
 * A plain run of digits with no contact words, no phone shape and not a valid barcode is left alone.
 * Browser global SKHPublicTextPrivacy, Node require (build + tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKHPublicTextPrivacy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var FIXED = [
    /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?openstreetmap\.org|waze\.com|what3words\.com)\S*/gi,
    /-?\d{1,3}\.\d{3,}\s*[,;\s]\s*-?\d{1,3}\.\d{3,}/g,                              // 6.81234, 39.27891
    /\d{1,3}\s*°\s*\d{1,2}\s*['′]\s*(?:\d{1,2}(?:\.\d+)?\s*["″])?\s*[NSEW]/gi,         // 6°48'44"S
    /\b(?:lat(?:itude)?|lon(?:gitude)?|lng|gps)\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
    /\btel:\S+|(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp\.com\/send)\S*/gi,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  ];
  // a candidate number: optional + / 00 prefix, digits with single separators (space . - and one optional (area) group)
  var CANDIDATE = /(\+|\b00\s?)?\(?\d[\d().\s\-]{6,22}\d/g;
  var CONTACT_BEFORE = /(simu|piga|nipigie|tupigie|call|phone|tel|telephone|mobile|mob|cell|whats\s?app|wasap|sms|contact|wasiliana|mawasiliano|namba yangu|namba ya simu|reach)\W{0,14}$/i;
  var ID_BEFORE = /(barcode|bar code|ean|upc|gtin|isbn|sku|imei|serial|s\/n|sn|model|modeli|part|code|msimbo|namba ya bidhaa|item no|art\.?\s?no|ref)\W{0,6}$/i;
  var CURRENCY_BEFORE = /(TSh|Tsh|TZS|KSh|Ksh|KES|UGX|USh|USD|US\$|EUR|GBP|\$|€|£|bei|price)\s?$/i;
  var MOBILE_CC = /^(255[67]|254[17]|256[37]|250[7]|257[67]|243[89]|260[79]|265[89]|258[8]|27[6-8])\d{7,9}$/;

  /** Valid GS1 barcode (EAN-8, UPC-A, EAN-13, GTIN-14) by check digit. */
  function isGtin(d) {
    if (!/^\d+$/.test(d) || [8, 12, 13, 14].indexOf(d.length) === -1) return false;
    var sum = 0, n = d.length;
    for (var i = 0; i < n - 1; i++) sum += Number(d[n - 2 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(d[n - 1]);
  }
  /** Is this candidate (with the text before it) a phone number? */
  function isPhone(raw, before) {
    var digits = raw.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) return false;
    var plain = /^\d+$/.test(raw.trim());
    if (/^\s*(\+|00)/.test(raw)) return !(plain && isGtin(digits) && !/^\s*\+/.test(raw) && !CONTACT_BEFORE.test(before));
    if (CONTACT_BEFORE.test(before)) return true;
    if (CURRENCY_BEFORE.test(before)) return false;
    if (ID_BEFORE.test(before)) return false;
    if (MOBILE_CC.test(digits)) return true;
    if (plain && isGtin(digits)) return false;
    if (/^0\d{9,10}$/.test(digits)) return true;
    // phone-style grouping: 3-4 groups of 2-4 digits separated by spaces / dashes / dots
    if (/^\(?\d{2,4}\)?([\s.\-]\d{2,4}){2,3}$/.test(raw.trim()) && digits.length <= 12) return true;
    return false;
  }
  function scrubPhones(text) {
    return text.replace(CANDIDATE, function (m, pre, off, all) {
      var before = all.slice(Math.max(0, off - 30), off);
      if (/\d[\s.,]?$/.test(before)) return m;               // the tail of a longer number (e.g. an amount) — not a separate phone
      return isPhone(m, before) ? ' ' : m;
    });
  }
  function scrub(t) {
    var s = FIXED.reduce(function (acc, re) { return acc.replace(re, ' '); }, String(t == null ? '' : t));
    return scrubPhones(s).replace(/[ \t]{2,}/g, ' ').trim();
  }
  /** Attribute keys that are location or contact details (dropped from public pages). */
  var PRIVATE_ATTR = /loc|address|anwani|mtaa|street|plot|kiwanja|ward|kata|gps|coord|lat|lon|lng|geo|map|eneo|mahali|phone|simu|tel|mobile|whatsapp|contact|mawasiliano|piga|email|barua/i;
  return { scrub: scrub, isPhone: isPhone, isGtin: isGtin, PRIVATE_ATTR: PRIVATE_ATTR };
});

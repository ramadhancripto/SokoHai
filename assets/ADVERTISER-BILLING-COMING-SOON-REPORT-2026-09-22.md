# Advertiser Billing & Payments — Coming Soon Report

**Date:** 22 September 2026  
**Status:** UI-only placeholder complete

## Audit result

The codebase had existing SokoPay, checkout, wallet, payment gateway, boost/payment, and announcement campaign functionality, but no Advertiser Dashboard Billing section and no advertising billing backend. Those payment and advertising creation systems were not reused or changed for this placeholder because Billing must not initiate any financial operation.

## Implementation

- Added **Advertiser** to the existing `Kazi / Usimamizi` role menu and unified management drawer.
- Added a lightweight, extensible Advertiser Dashboard shell.
- Added a visible neutral/locked **Billing & Payments — Coming Soon** entry.
- Added a disabled-styled Billing card with the requested description.
- Clicking either locked entry opens an informational dialog:
  - `Billing & Payments`
  - `Mfumo wa malipo na usimamizi wa gharama za matangazo unakuja hivi karibuni.`
  - `Coming Soon`
  - `Sawa`
- Added responsive styles for small phone, mobile, tablet, and desktop.
- Registered the two new UI overlays with the existing modal closure system.

## Explicitly not implemented

No advertising-specific:

- billing or pricing collection
- CPM or CPC calculation
- budget calculation or deduction
- wallet
- invoice
- payment transaction
- checkout or payment-gateway route
- SokoPay handoff
- Cloud Function

The Coming Soon handlers only open and close informational UI.

## Files

- `html/03-modals-core.html`
- `css/36-advertiser-coming-soon.css`
- `js/app/19-roles.js`
- `js/app/22-printing.js`
- `js/app/00-bootstrap.js`
- `html/00-head.html`
- `tools/test_advertiser_billing_coming_soon_contract.mjs`

## Verification

- Advertiser Billing Coming Soon contract: **20 passed, 0 failed**
- Full `npm test`: **exit 0**
- JavaScript syntax: **105 files passed**
- HTML build/check: **22 fragments, byte-exact**
- `git diff --check`: **passed**

Full test output is in `ADVERTISER-COMING-SOON-TEST-LOG.txt`.

No browser runtime was available, so no screenshot, physical-device, or browser-driven E2E claim is made.

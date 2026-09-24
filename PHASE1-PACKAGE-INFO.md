# SokoHai — Phase 1 Package Info

- **Baseline commit:** `aaf50a0` (github.com/ramadhancripto/SokoHai)
- **Phase 1 status:** FINAL VERIFICATION COMPLETE — READY FOR PHASE 1 APPROVAL (awaiting owner approval).
  Phase 2 / Phase 3 NOT started.
- **Committed / pushed / deployed:** NO. This archive is a copy of the uncommitted working tree.

## Files changed vs `aaf50a0`
| File | Purpose |
|---|---|
| `functions/index.js` | R1 walletAdjust authorization; R2 escrowRelease; R4 SokoPay links / auto-release; R5 deliveryComplete; server escrow proof (`escrow_holds`); PesaPal settle + initiator record; `sokopayLinkWalletPay`; admin dispute resolution consumes escrow proof |
| `firestore.rules` | `sokopay_links` + `ride_requests` protections; syntax-only fixes so the file compiles |
| `functions/local-server.js` | 127.0.0.1 default (`SKH_HOST` opt-in), schedules off by default (double opt-in for production), emulator + ADC + service-account fallback, no secret logging |
| `LOCAL-SERVER-MWONGOZO.md` | Guide for the above |
| `js/16-wallet.js`, `js/17-pesapal-return.js`, `js/app/17-hub.js` | Clients pass PesaPal references; link wallet payment via server |
| `firebase.json` | Emulator ports block (tests only) |
| `package.json` | `test:security`, `test:security:emulator` |
| `tools/test_phase1_security.mjs` (new) | Phase 1 security suite (emulator only) |

## Tests (final verification run)
- `npm run test:security:emulator` — **57 passed, 0 failed**
- `node tools/test_local_functions_server.mjs` — **12/12 passed**
- Every other test in the `npm test` chain — **passed** (run individually)
- Ads: governance 12, delivery engine 40/40, local delivery regression 24, unified designer 146, ad card visual 19/19, non-canvas designer 56, creative system, creator studio — **passed**
- `python3 tools/build_html.py check` — passed

## Known pre-existing failures (identical at `aaf50a0`, not caused by Phase 1)
- `tools/test_chat_authority_contract.mjs` — stale duplicate app in `fonts/` (this also stops the `npm test` chain)
- `tools/test_studio_media_design.mjs` — `/shared/ads-design-rules.js` import path

## Secrets
- Excluded: `.env*`, `functions/.env*`, service-account / adminsdk JSON, `*.pem`, `*.key`, `node_modules/`, `functions/node_modules/`, `.firebase/`, logs, temp/backup files.
- No private keys, tokens, passwords or PesaPal credentials are included. (The test suite uses emulator placeholder values and generates a throwaway RSA key at runtime.)
- The Firebase **web** API key in `js/app/00-bootstrap.js` is public client configuration by design and was already in the repo.

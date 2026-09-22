# LIVE ACCOUNT NEGOTIATION VERIFICATION — 2026-09-22

## Scope and method

The supplied account was authenticated against the production Firebase project `sokonet-3b847` using Firebase Authentication REST. No password, ID token, or refresh token was saved to the workspace or included in this report. Firestore was inspected read-only through the authenticated REST API.

A browser executable is not installed in the sandbox, so this is an authenticated production-data and live-deployment source verification, not a claimed Chrome screenshot session.

## Account/data result

Authentication succeeded.

Production data visible to the account includes:

- 20 direct conversations.
- 34 negotiations where the account is buyer.
- 13 negotiations where the account is seller.
- Product, Service and Transport negotiation documents are all present as distinct `commerceType` values.

For the reported Product `Viatu`:

- A direct conversation with the seller already exists.
- Its `related` context contains the Product ID and Product fields.
- Its last message contains `Bidhaa: Viatu`.
- Multiple structured Product negotiations are already tied to that conversation.

Therefore the red instruction to “Anza mazungumzo kwanza” is factually incorrect for this account. The account has already started the conversation and sent commerce messages. The obstruction is not missing inbox data.

## Live deployment result

The production site inspected was:

`https://sokohaicom.netlify.app`

The live deployment contract failed immediately:

- Live root `index.html` does not contain `#chatNegotiationHost`.
- Live `/fonts/js/app/38-negotiation-form.js` still contains the old fallback functions, including historical context inference and Product delivery fields.
- The exact old UI strings reported by the user exist in the live stale source.

This proves the currently visible behavior is being executed by an old Netlify deployment. It is not executing the repaired package presently in the workspace.

## Why all reported symptoms occur together

The old live build:

1. Appends negotiation shell to `document.body`, so it can sit behind/away from Chat and be found after leaving Chat.
2. Infers type from historical Product/Service/Transport cards and globals, causing context mixing.
3. Includes Product `productDelivery`, `deliveryLocation`, and `preferredDate` fields, creating the unwanted delivery/final-pickup behavior.
4. Blocks submit on current in-memory `chatCore.convId`/`partnerUid` and displays `Anza mazungumzo kwanza`, even though Firestore already contains the conversation.
5. Lacks the repaired per-button processing/success/error states.

## Deployment repair added

- `netlify.toml` now publishes only the root app behavior with no-cache headers for HTML, service workers, and app modules.
- `/fonts/`, `/fonts/js/*`, `/fonts/css/*`, and `/fonts/html/*` are redirected away from the retired duplicate app.
- `tools/verify_live_negotiation_deploy.mjs` provides a mandatory post-deploy contract.
- `npm run verify:live -- https://sokohaicom.netlify.app` must pass before the live incident is declared closed.

## Required deployment

Deploy the newly generated package/repository root to the connected Netlify site. The workspace cannot update the Netlify production site without the site owner's Netlify deployment credential or connected Git push.

After deployment run:

```bash
npm run verify:live -- https://sokohaicom.netlify.app
```

Do not accept a deployment while that command fails.

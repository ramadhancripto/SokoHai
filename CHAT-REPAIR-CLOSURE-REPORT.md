# SOKOHAI CHAT + NEGOTIATION — REPAIR CLOSURE REPORT

**Date:** 22 Septemba 2026  
**Base HEAD:** `115664605be9e517974857d6f9fd342476074571`  
**Forensic report:** `CHAT-ROOT-CAUSE-REPORT.md`  
**Automated test log:** `FINAL-TEST-LOG.txt`

## Repair outcome

Direct Chat sasa ina implementation moja ya public `window.skhChatOpen` ndani ya `34-chat-core.js`. Files 78/81/90/92 hazibadilishi tena entry point hiyo. 93 inaendelea kuwa inbox authority tu.

Lifecycle sasa ni:

```text
AUTH READY
→ UID VALIDATION
→ deterministic pair conversation ID
→ race-safe conversation read/create
→ parent confirmation
→ one message listener + one parent listener
→ READY/EMPTY
→ composer enabled
→ write + optimistic render
→ atomic conversation metadata update
→ realtime confirmation
→ commerce context
→ negotiation context
```

Failures za conversation create/read hazimezwi tena; flow inakuwa `ERROR` na haiattach listener wala hairuhusu send dhidi ya parent bandia.

---

# FILE-BY-FILE CLOSURE

## FILE: `js/app/34-chat-core.js`

**STATUS: CLOSED**

### FOUND
1. `ensureConversation` ilikuwa inameza exception na kurudisha fake success yenye `data:null`.
2. `convIdFor` ingeweza kutengeneza ID kwa auth UID null.
3. Loading ilikuwa na watchdog ya open na watchdog ya listener; 90 iliongeza nyingine.
4. Message/conversation callbacks hazikuwa na stale partner/open guard.
5. Composer hakuwa amefungwa rasmi kwa lifecycle state.
6. Message metadata ilitumia read-modify-write unread update.
7. Write errors zilifinyangwa kuwa generic `write_failed`.
8. Negotiation fallback ilitumia pair-wide buyer/seller listeners ambazo zingeweza kuchukua entity isiyo sahihi.
9. Commerce context na retry ingeweza kupotea kwa reopen isiyohifadhi opts.

### REPAIRED
1. State model `IDLE/CONNECTING/READY/EMPTY/ERROR/RETRYING` imewekwa.
2. Auth wait contract inatumia bootstrap `skh:auth-ready`; hakuna polling.
3. UID/partner/conversation contract inavalidate fail-fast.
4. Conversation create inatumia transaction ikiwa available; failures zinarethrow na typed logging.
5. Timeout moja authoritative ya first message snapshot: sekunde 10.
6. `openToken + convId` guards zimewekwa kwenye message na parent callbacks.
7. Old direct/negotiation listeners zinafungwa kabla ya partner mpya.
8. Composer ina-enable tu READY/EMPTY.
9. Retry huhifadhi request opts/context.
10. Send diagnostics zina `AUTH_FAILURE`, `PARTNER_MISSING`, `CONVERSATION_MISSING`, `PERMISSION_DENIED`, `FIREBASE_UNAVAILABLE`, `WRITE_FAILED`, `INVALID_PAYLOAD`.
11. Unread inatumia atomic `increment(1)`; related/drafts/deletedForUser ni field-level update.
12. Negotiation fallback ni conversation-ID scoped; pair-wide listeners zimeondolewa.
13. Stale negotiation callbacks zinakataliwa.

### TESTED
- Product/service/transport structured messages.
- Optimistic send + reconcile bila duplicate.
- Existing/new canonical conversation.
- Permission-denied create → ERROR, no fake parent, no listener.
- Partner switch → no cross-conversation leakage.
- Offer/counter/accept persistence katika in-memory Firestore E2E.
- Syntax + full regression suite.

### DEPENDENCIES CHECKED
`00-bootstrap`, 37, 38, 39, 69, 73, 78, 79, 81, 90, 92, 93, rules, indexes, chat DOM/CSS.

**NO FURTHER AUDIT REQUIRED FOR COVERED AREAS.**

---

## FILE: `js/app/93-chat-inbox-repair.js`

**STATUS: CLOSED**

### FOUND
- Timeout ilionyesha Retry lakini `loading93` ilibaki true; Retry ilirudi kimya milele.
- Response ya request iliyotimeout ingeweza ku-overwrite retry mpya.

### REPAIRED
- Timeout sekunde 10 inaunlock retry.
- Request generation token inakataa stale response.
- `loadInbox93` hurudisha result; global state ina-commit tu ikiwa request bado active.
- Direct chat bado inadelegate kwa 34.

### TESTED
Inbox empty/reload, row contracts, authority invariants, full suite.

---

## FILE: `js/app/92-chat-auth-fix.js`

**STATUS: CLOSED**

### FOUND
- Premise ya zamani haikuwa kweli tena: `00-bootstrap.js` tayari ina auth listener, currentUser assignment, `__authResolved`, na event.
- File iliongeza listener ya pili, polling, timeout, `requireAuth` override, `doLogin` override na chat wrappers.

### REPAIRED
- Imebaki compatibility diagnostic tu.
- Hakuna auth listener/poll/wrapper/requireAuth override.
- Bootstrap ndiyo auth authority moja.

### TESTED
Static authority invariants 18/18; auth paths za suite hazijaregress.

---

## FILE: `js/app/90-chat-fixes.js`

**STATUS: CLOSED**

### FOUND
- Ilikuwa direct-chat wrapper yenye timeout ya pili, delayed loader inspection, MutationObserver na composer polling kila 800ms.
- Slow first snapshot ingeweza kutafsiriwa EMPTY kabla data kufika.

### REPAIRED
- Imebaki state CSS + cache utility + clean retry delegate.
- Hakuna wrapper, MutationObserver, listener, timeout au interval.

### TESTED
Authority invariants; no polling; full suite.

---

## FILE: `js/app/78-chat-fix-blink.js`

**STATUS: CLOSED**

### FOUND
- Direct chat instant-open wrapper iliduplicate kazi ambayo sasa core inafanya.

### REPAIRED
- Direct hook ni compatibility marker tu; hakuna reassignment ya `skhChatOpen`.
- Group/no-blink behavior imehifadhiwa.

### TESTED
Group create/send/order E2E; authority invariant.

---

## FILE: `js/app/79-one-ui-at-a-time.js`

**STATUS: CLOSED — NO SOURCE CHANGE REQUIRED**

- Direct/inbox/group paths tayari hu-defer kwa 81 ikiwa absolute UI manager iko live.
- Chain flags zimehakikiwa.
- Hakuna defect mpya iliyohitaji edit.

---

## FILE: `js/app/81-absolute-one-ui-live.js`

**STATUS: CLOSED**

### FOUND
- Direct-chat wrapper ya pili ilikuwa na duplicate open guard/skeleton/modal state.

### REPAIRED
- `skhAbsoluteShowOnly` imebaki UI primitive.
- 34 inaiita; 81 haifunikwi tena juu ya `skhChatOpen`.
- Group/discover/close stack behavior imehifadhiwa.

### TESTED
Authority invariant; group/discover regressions katika suite.

---

## FILES: `68-chat-discover.js`, `69-chat-groups.js`, `73-group-soga.js`

**STATUS: CLOSED — NO SOURCE CHANGE REQUIRED**

- Discover → user → core chat contract imehakikiwa.
- Group chat ina schema/listener zake tofauti; direct listener repair haikuichanganya.
- Group create, conversation row, message send, group order create/join zimepita E2E.

---

## FILES: `37-negotiation.js`, `38-nego-form-logic.js`, `38-negotiation-form.js`

**STATUS: CLOSED — NO JS SOURCE CHANGE REQUIRED**

- 37 ni state/transition engine; 38 logic ni imported, si missing script.
- Product/service/transport validation na proposal persistence zipo.
- Form inatoka chat context na close behavior haivunji chat.
- State transitions, invalid actor/transition, offer/counter/accept/reject, order/booking pipelines zimepita tests.

---

## FILES: `39-product-showcase.js`, `39-showcase-logic.js`

**STATUS: CLOSED — NO SOURCE CHANGE REQUIRED**

- Showcase logic ni imported.
- `skhChatNegotiate` husubiri chat open na ina in-flight guard.
- Product → Chat → form ndani ya Chat imepita E2E.

---

## FILES: `40-token-box.js`, `41-request-inbox.js`, `52-transport-inbox.js`, `58-request-visibility.js`

**STATUS: CLOSED — NO SOURCE CHANGE REQUIRED**

- Token/request/transport flows hazikuwa direct-chat authority.
- Transport negotiation opener na `negotiationAllowed` contract zimehakikiwa.
- Routing/token/logistics/delivery suites zote zimepita; hakuna surgical change iliyohitajika.

---

## FILE: `html/21-scripts.html`

**STATUS: CLOSED — ORDER PRESERVED**

- Exact order imerekodiwa kwenye forensic report.
- Hakuna reorder hatari iliyofanywa.
- Competing direct wrappers zimeondolewa ndani ya repair files, hivyo order siyo tena source ya direct-chat authority race.
- `build_html.py check`: byte-exact PASS.

---

## FILE: `firestore.rules`

**STATUS: CLOSED**

### REPAIRED
1. Message create sasa inahitaji auth UID iwe participant wa parent conversation.
2. Conversation create inahitaji list ya UIDs mbili tofauti.
3. Legacy `/chats` read imefungwa kwa sender/receiver tu.
4. Legacy create inahitaji `senderUid == auth.uid` na valid receiver UID.
5. Legacy update/delete zimefungwa.

Hakuna `allow read, write: if true` iliyoongezwa.

---

## FILE: `firestore.indexes.json`

**STATUS: CLOSED — NO INDEX CHANGE REQUIRED**

- Direct messages query ni subcollection orderBy single field.
- Negotiation authority query ni equality ya `conversationId`, client-side sort.
- Pair-wide composite queries zimeondolewa.
- Hakuna missing composite index iliyothibitishwa; hakuna index ya kubahatisha iliyoongezwa.

---

## FILES: `css/14-chat-admin-polish.css`, `css/15-chat-comments.css`, `css/24-chat-ui-v2.css`, `css/17-negotiation-form.css`

**STATUS: CLOSED**

### FOUND
- Fixed `min-width` za cards/offers.
- `nowrap` ya negotiation values/actions.
- Rules nyingi za bubble katika cascade.
- Page overflow ilikuwa ikifichwa na body badala ya kuzuiwa kwenye children.

### REPAIRED
- Source-level max-width/min-width contracts.
- `overflow-wrap:anywhere` kwa messages, titles, URLs, terms.
- Negotiation/action buttons zina-wrap.
- Dedicated 420/380/340/330 breakpoints cover 320, 360, 375, 390, 412.
- Intentional strips pekee zina internal horizontal scroll.

### TESTED
20/20 mobile/authority/security contract checks. **Kumbuka:** sandbox haina Chromium/Firefox; kwa hiyo hii ni DOM/CSS contract test, si screenshot/layout-engine claim.

---

# TEST MATRIX COMPLETED

## Automated

- `npm test` — **PASS, exit 0**.
- Chat E2E — **37 pass, 0 fail**.
- Negotiation DOM — **76 pass, 0 fail**.
- Chat header/sides — **28 pass, 0 fail**.
- Chat authority/mobile/security — **20 pass**.
- Chat/nav authority — **18 pass, 0 fail**.
- Chat commerce cards — all pass.
- All existing negotiation, showcase, commerce, routing, token, logistics, delivery, functions-resilience suites pass.
- `node --check` — all **104 JS files pass**.
- `build_html.py check` — byte-exact pass.
- `git diff --check` — pass.

## Direct chat scenarios covered by executable mock

- New conversation.
- Existing conversation/reopen.
- Send + realtime echo.
- Optimistic UI without duplicate.
- Refresh-equivalent persistent store reload.
- Switch partner; stale callback does not leak.
- Permission-denied create; no infinite loading/fake listener.
- Product card.
- Service card.
- Transport card.
- Offer/counter/accept.
- Group create/send/order.

## Not claimed as executed

- Live production Firebase deploy.
- Two real browser sessions against production credentials.
- Physical Android/iPhone screenshots at all widths.
- Network interruption through a real browser DevTools session.

Hizi zinahitaji staging credentials/devices. App preview imeanzishwa kwa manual inspection, lakini hakuna deploy iliyofanywa.

---

# DEPLOYMENT NOTES

Mabadiliko ya `firestore.rules` lazima yadeployiwe pamoja na frontend ili security contract mpya itumike. Usifanye deploy ya frontend pekee kisha kudai rules zimefungwa.

Recommended staging gate:

1. Deploy hosting + rules kwenye staging.
2. Akaunti A/B kwenye browsers mbili.
3. Product, Service, Transport open/send/receive.
4. Offer/counter/accept/reject; refresh pande zote.
5. Chrome responsive screenshots 320/360/375/390/412.
6. Thibitisha legacy users bado wanaona conversations zilizomigratiwa.
7. Kisha production deploy.

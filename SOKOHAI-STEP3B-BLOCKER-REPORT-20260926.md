# SOKOHAI STEP 3B — SERVICES PRE-IMPLEMENTATION BLOCKER REPORT

**Date:** 2026-09-26
**Status:** STOPPED BEFORE IMPLEMENTATION

## Executive decision

Step 3B was not implemented. No Service, booking, request, payment, review, Chat, Discover, Dashboard, Product, POS, Inventory, or Firestore files were changed for this step.

The supplied instruction states that Step 3A was implemented/approved. The workspace/session source of truth does not support that statement: Step 3A is still explicitly marked `BLOCKED — implementation intentionally stopped before code changes` in `SOKOHAI-STEP3A-BLOCKER-REPORT-20260926.md`. Its unresolved Product/POS/inventory authority blocker remains relevant to Service transactions and POS integration.

The Service audit also found an existing legacy `services` system. It must be adapted, not replaced blindly.

## 1. Existing Service source of truth found

The existing Service collection is:

```text
services
```

Existing creation paths include:

```text
js/app/08-app-state.js
js/app/19-roles.js
```

Existing read/card/discovery paths include:

```text
js/app/00-bootstrap.js
js/app/07-product.js
js/app/39-showcase-logic.js
js/app/15-sp-live.js
js/app/16-pos-admin-jobs.js
```

Existing Chat/negotiation integration includes:

```text
js/app/34-chat-core.js
js/app/37-negotiation.js
js/app/38-negotiation-form.js
functions/negotiation.js
```

Existing order integration includes:

```text
orders
functions/negotiation.js
js/app/62-missing-features.js
```

No separate canonical Service engine was found for the requested complete lifecycle.

## 2. Existing legacy Service schema

The current service creation path writes fields including:

```text
title
price
groupType
category
subCategory
filters
description
location
pricingModel
availabilityStatus
travelAvailable
image
negotiationAllowed
createdAt
```

The current rules validate approximately:

```text
title
price > 0
userId
pricingModel
availabilityStatus
travelAvailable
```

The existing model does not yet prove support for the requested canonical fields:

```text
serviceId
businessId
ownerUid
servicePresenceId / storeId
name / slug
categoryId / subcategoryId
media roles / portfolio
pricing object with all supported modes
duration
 deliveryMode
availabilityMode
serviceArea
options/packages
requirements
status
visibility
sellerMode
```

This is a legacy Service listing model, not yet a complete authoritative Service system.

## 3. Ownership and Business integration blocker

Step 2 Business/Store context exists in:

```text
shared/business-context-core.js
functions/business.js
js/app/20-business-context.js
```

However, the existing Service write path still relies on the client-provided/legacy `userId` ownership pattern. The audited Service creation code does not establish a canonical server-resolved relationship for:

```text
ownerUid
businessId
servicePresenceId / storeId
provider authorization
management capability
```

The Service rules currently permit creation when `request.resource.data.userId == request.auth.uid` and permit updates through legacy ownership validation. That is insufficient to implement the requested Business/Store/provider authority without a migration and rule design.

## 4. Service presence blocker

The existing model has a plain `location` field and a `travelAvailable` flag. No complete shared Service Presence abstraction was confirmed for:

```text
physical provider location
customer-location service
online/remote service
mobile/travelling coverage
multiple locations
privacy-safe service area
contact policy
visibility
verification
opening/availability
```

Adding `servicePresenceId` without deciding whether existing `stores` documents are the canonical physical presence, or whether a shared presence adapter is required, would create duplicate location authority.

## 5. Taxonomy blocker

A large `skh.serviceDataMap` exists in `js/app/00-bootstrap.js`, with hardcoded group/category/subcategory/filter structures. Existing Service form logic consumes that map directly.

The requested architecture requires the central taxonomy system and canonical category/subcategory/attribute/filter/option relationships. The audit did not confirm that the current Service form is using a server-authoritative taxonomy contract rather than this legacy in-client map.

A Service taxonomy rewrite is explicitly out of scope. Therefore Step 3B must stop until the integration point with the central taxonomy is identified and safe.

## 6. Pricing blocker

Existing rules require a positive numeric `price`, while the existing UI supports only a subset through `pricingModel`.

The requested modes are:

```text
FIXED
STARTING_FROM
HOURLY
DAILY
PER_UNIT
QUOTE
NEGOTIABLE
CUSTOM
```

The current rules/model do not establish which fields are authoritative for:

```text
amount
currency
minimum
maximum
notes
```

Forcing quote/negotiable/custom services through `price > 0` would either reject legitimate services or encourage fake placeholder prices. Changing the rules is a security-sensitive change and must be designed before implementation.

## 7. Request / booking authority blocker

Existing service-related flows reuse general `requests`, `negotiations`, and `orders`. Existing code also contains service order creation after negotiation agreement.

The audit did not confirm one complete, server-authoritative Service lifecycle covering:

```text
INQUIRY
REQUEST
BOOKING
CONFIRMED
RESCHEDULE_REQUESTED
RESCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
REJECTED
EXPIRED
```

Current `orders` rules intentionally keep important payment and final status fields server-authoritative, but the existing service-specific request/booking state machine is not clearly separated from product orders and transport bookings.

Creating a new `service_bookings` collection now would risk duplicating `orders`/`requests`/`negotiations`. Reusing `orders` without mapping all current `kind`, `commerceType`, `serviceId`, payment, and completion paths would risk cross-domain status corruption.

## 8. Provider and staff blocker

Existing code recognizes provider-like identities through legacy fields such as:

```text
userId
providerId
sellerId
isProvider
serviceCategory
servicesOffered
```

No canonical Service Team/Provider authority was confirmed for:

```text
providerId
businessId
userId
services[]
availability
status
verification
assignment permissions
```

The requested owner/manager/provider separation cannot safely be implemented by trusting client-supplied `providerId`.

## 9. Availability and scheduling blocker

The current Service model has an `availabilityStatus` summary and `appointment_required` value. It does not provide a confirmed authoritative schedule with:

```text
timezone
weekly schedule
exceptions
holidays
temporary closure
booking limits
duration conflict prevention
provider-specific availability
```

Implementing bookings without this authority would permit conflicting appointments. Implementing a fake calendar is explicitly disallowed.

## 10. Payment blocker

Service orders are connected to existing order/payment flows, including SokoPay/PesaPal-related systems. The audit did not confirm a complete Service-specific mapping for:

```text
quote accepted
booking confirmed
payment pending
payment verified
held/escrow where applicable
completion
refund/cancellation
```

The current rules correctly restrict important order money/status changes. Step 3B cannot mark service payment or completion from browser state. A new Service payment path would risk rewriting or duplicating SokoPay/PesaPal, which is explicitly out of scope.

## 11. Transaction blocker inherited from Step 3A

The requested Service + POS integration requires authoritative transaction behavior for offline/walk-in service. Step 3A still has:

```text
multiple direct products.stock writers
multiple POS paths
broad shop_ledger client writes
no confirmed atomic POS sale/inventory authority
```

Therefore an offline Service transaction cannot safely be added to the existing POS or ledger. It would be unsafe to claim support for:

```text
OFFLINE service completed through POS
HYBRID online request + offline completion
service income
service profit
service + material integration
```

until the Step 3A authority decision is resolved.

## 12. Review eligibility blocker

The existing Review/Engagement system was not confirmed to have a Service-specific eligibility proof based on an authoritative completed Service interaction. Existing service views, chat, negotiation and order references are not sufficient by themselves to prove completion.

No new review system was created.

## 13. Security blocker

Current Service rules include public reads and legacy owner-based create/update validation. The audit did not confirm server-side capability checks for:

```text
Business ownership
Service ownership
Service Presence ownership
Provider assignment
Staff role
Booking participant access
Private location/service data
Payment state
Completion state
Transaction creation
```

Tightening rules without mapping all existing writers would break legacy flows; leaving them unchanged would fail the requested security requirements. This requires a deliberate migration/rules plan.

## 14. Nine-combination test status

The required matrix was not run because the canonical Service ownership, capability, booking, and payment authorities are not yet safe:

```text
ONLINE  + BASIC   — blocked
ONLINE  + PARTIAL — blocked
ONLINE  + FULL    — blocked
OFFLINE + BASIC   — blocked
OFFLINE + PARTIAL — blocked
OFFLINE + FULL    — blocked
HYBRID  + BASIC   — blocked
HYBRID  + PARTIAL — blocked
HYBRID  + FULL    — blocked
```

Running UI-only tests would not validate the required server authority.

## 15. Files audited

```text
firestore.rules
shared/business-context-core.js
functions/business.js
js/app/00-bootstrap.js
js/app/07-product.js
js/app/08-app-state.js
js/app/15-sp-live.js
js/app/16-pos-admin-jobs.js
js/app/19-roles.js
js/app/20-business-context.js
js/app/34-chat-core.js
js/app/37-negotiation.js
js/app/38-negotiation-form.js
js/app/39-showcase-logic.js
js/app/62-missing-features.js
functions/index.js
functions/negotiation.js
html/10-form-agent.html
```

## 16. Files modified for Step 3B

```text
None
```

## 17. Required next step

Before Step 3B implementation can safely begin, approve a focused pre-implementation decision:

```text
STEP 3B-0 — Service Authority and Legacy Adapter Design
```

It must define, without coding the full UI:

1. Whether `services` remains the canonical Service collection.
2. The canonical Business/Store/Service Presence references.
3. The canonical Service schema and legacy-field adapter.
4. Whether requests/bookings remain in `requests`/`orders`/`negotiations`, and the exact state machine.
5. Provider/team authority and capability checks.
6. Availability and duration authority.
7. Service transaction relation to the unresolved Step 3A sale authority.
8. Review eligibility proof.
9. Required Firestore rule changes and all affected writers.
10. Required indexes, only after real queries are fixed.

## Final decision

```text
STEP 3B — BLOCKED
IMPLEMENTATION STOPPED BEFORE CODE CHANGES
```

No duplicate Service engine, booking engine, payment system, review system, Chat system, location system, or dashboard was created. Existing data and existing systems were not modified.

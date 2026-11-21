# Server callable coverage (all 155 callables)

Source of truth: the exported endpoints of `functions/index.js` (`__endpoint.callableTrigger`).

- **155 callables**, all labelled and wrapped by the shared error contract (SERVER-ERROR-CONTRACT.md).
- Test references were recomputed on the final tree by scanning `tools/**` for each name (`'name'`, `.name(`, `fns.name.run`, …).
- "behavioural" means at least one test that **runs the handler**: an emulator suite (`FIRESTORE_EMULATOR_HOST`), an `e2e-emulator` journey, or a real-browser test. Static/contract tests are listed only when nothing behavioural exists.

## 1. Summary

| | Count |
|---|---|
| Callables | 155 |
| With a behavioural test | **155 / 155** |
| Static/contract test only | 0 |
| No test at all | 0 (the audit found 29) |
| Added in this remediation | G-1: 29 callables in 28 test cases. G-1b: 9 + `adminSetTrustBadge` in 11 test cases. |
| Without any client caller (server-ready, UI not wired) | 17 (§4) |

## 2. The "29 gaps versus 28/28" question

The audit's G-1 list had **29 callables** with no test referencing them. `tools/test_callables_g1_emulator.mjs` covers **all 29**:

- **27 behavioural tests.** Two of them each exercise two callables: `agentMemberStatus` + `agentListMembers`, and `assistedSessionValidate` + `assistedSessionEnd`. That makes 25 + 2×2 = 29 callables.
- **1 meta-test**, "all 29 G-1 callables were exercised". It fails if any name in `LIST` is not called, and asserts `LIST.length === 29`.

So 28/28 = 27 + 1 test cases, covering 29 callables. **No callable is missing, excluded or unresolved.**

The 29: `staffInviteCreate`, `staffInviteAccept`, `staffInviteRevoke`, `staffRemove`, `commentsModerate`, `auctionConfirmPayment`, `pesapalRegisterIpn`, `livePing`, `liveSetProducts`, `liveSetVideo`, `storyReact`, `chatOfferAction`, `deliveryDispute`, `deliveryPassengerBoard`, `deliveryRevokeTokens`, `deliveryRouteBooking`, `deliveryRouteRetry`, `deliveryRouteSweep`, `inventoryReconcile`, `inventoryReleaseReservation`, `adminRejectAgent`, `adminSetVerification`, `agentListMembers`, `agentMemberStatus`, `assistedSessionEnd`, `assistedSessionValidate`, `entitlementGrant`, `memberAuthenticate`, `memberSetPin`.

**Second pass on the final tree.** It found **9 callables** whose only tests were static/contract tests that never run the handler: `creativeModerate`, `creativePublish`, `creativeSaveDraft`, `creativeTrackEvent`, `adsTrackDeliveryEvent`, `posCreditAdjustment`, `posReceipt`, `posReconcile`, `posRefund`. `tools/test_callables_g1b_emulator.mjs` now runs them. It also adds a direct check for `adminSetTrustBadge`, which already had its own suite (`test_trust_badges_emulator`). Result: **11/11 passed** (10 callables + meta).

## 3. Per-callable table

Columns:

- **System**: the cross-system domain (1–15).
- **Callers**: number of client files that call it.
- **New**: the G-test added in this remediation.
- **Evidence**: up to 3 behavioural test files.

| Callable | System | File | Callers | Status | New | Evidence |
|---|---|---|---|---|---|---|
| `clientErrorReport` | 1 Marketplace & products | pilot-ops.js | 1 | behavioural | — | test_pilot_ops_emulator |
| `commentsEvidence` | 1 Marketplace & products | index.js | 1 | behavioural | — | test_comments_experience_browser, test_comments_retry_browser, test_staging_callable_adapter_emulator |
| `commentsLike` | 1 Marketplace & products | index.js | 1 | behavioural | — | g1/test_3k_final_sweep, test_comments_experience_browser, test_staging_callable_adapter_emulator |
| `commentsModerate` | 1 Marketplace & products | index.js | 1 | behavioural | G-1,G-6 | g1/test_3k_final_sweep, test_admin_authz_matrix_emulator, test_callables_g1_emulator |
| `commentsPublish` | 1 Marketplace & products | index.js | 3 | behavioural | — | test_comments_experience_browser, test_comments_retry_browser, test_comments_server_emulator (+3) |
| `disputeOpen` | 1 Marketplace & products | index.js | 3 | behavioural | — | test_dispute_refund_lifecycle, test_phase2_security |
| `productVariantsSave` | 1 Marketplace & products | inventory-authority.js | 2 | behavioural | — | test_inventory_reservation_emulator |
| `reviewsPublish` | 1 Marketplace & products | index.js | 1 | behavioural | — | g1/test_3k_final_sweep, test_r16_server_fixes |
| `sellerLifecycleChange` | 1 Marketplace & products | index.js | 2 | behavioural | — | e2e-emulator/s7, test_seller_lifecycle_emulator |
| `uploadSignature` | 1 Marketplace & products | upload-signing.js | 1 | behavioural | — | test_identity_verification, test_upload_signing |
| `creativeModerate` | 1 Marketplace & products (ads) | creative.js | 1 | behavioural | G-1b | test_callables_g1b_emulator |
| `creativeModerationQueue` | 1 Marketplace & products (ads) | creative.js | 1 | behavioural | G-6 | test_admin_authz_matrix_emulator |
| `creativePublish` | 1 Marketplace & products (ads) | creative.js | 3 | behavioural | G-1b | test_callables_g1b_emulator |
| `creativeSaveDraft` | 1 Marketplace & products (ads) | creative.js | 2 | behavioural | G-1b | test_callables_g1b_emulator |
| `creativeTrackEvent` | 1 Marketplace & products (ads) | creative.js | 1 | behavioural | G-1b | test_callables_g1b_emulator |
| `adsRequestDelivery` | 10 Transport & delivery | ads-delivery.js | 1 | behavioural | — | e2e-emulator/s5 |
| `adsTrackDeliveryEvent` | 10 Transport & delivery | ads-delivery.js | 1 | behavioural | G-1b | test_callables_g1b_emulator |
| `adsUpdateCampaignDelivery` | 10 Transport & delivery | ads-delivery.js | 1 | behavioural | G-6 | test_admin_authz_matrix_emulator |
| `deliveryAccept` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_delivery_lifecycle, g1/test_transport_market, test_national_safety_emulator (+4) |
| `deliveryCancel` | 10 Transport & delivery | index.js | 1 | behavioural | — | test_national_safety_emulator, test_phase2_security, test_routing_cancel_race_emulator |
| `deliveryComplete` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_delivery_lifecycle, test_phase1_security, test_phase2_security |
| `deliveryConfirmCustody` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_delivery_lifecycle, g1/test_transport_market, test_national_safety_emulator (+3) |
| `deliveryDispute` | 10 Transport & delivery | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `deliveryGenerateToken` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_delivery_lifecycle, test_national_safety_emulator, test_phase2_security (+2) |
| `deliveryOfferAccept` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_transport_market, test_national_safety_emulator, test_phase2_security (+2) |
| `deliveryOfferDecline` | 10 Transport & delivery | routing.js | 1 | behavioural | — | g1/test_3k_final_sweep, test_routing_cancel_race_emulator |
| `deliveryPassengerBoard` | 10 Transport & delivery | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `deliveryReportTransportFault` | 10 Transport & delivery | routing.js | 1 | behavioural | — | g1/test_3k_final_sweep, test_phase2_security, test_pickup_accept_emulator |
| `deliveryRevokeTokens` | 10 Transport & delivery | index.js | 1 | behavioural | G-1 | g1/test_transport_market, test_callables_g1_emulator |
| `deliveryRouteBooking` | 10 Transport & delivery | routing.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `deliveryRouteRetry` | 10 Transport & delivery | routing.js | 1 | behavioural | G-1 | test_callables_g1_emulator |
| `deliveryRouteSweep` | 10 Transport & delivery | routing.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `deliveryStartTransit` | 10 Transport & delivery | index.js | 1 | behavioural | — | g1/test_delivery_lifecycle, test_national_safety_emulator, test_phase2_security (+1) |
| `deliveryTokenVerify` | 10 Transport & delivery | index.js | 2 | behavioural | — | test_phase2_security, test_pickup_accept_emulator, test_transport_handover_emulator |
| `orderConfirmDelivery` | 10 Transport & delivery | index.js | 1 | behavioural | — | e2e-emulator/test_r16_service_journey, g1/test_service_orders, test_order_wallet_pay (+1) |
| `orderDeliveryCodeIssue` | 10 Transport & delivery | index.js | 1 | behavioural | — | e2e-emulator/s4, e2e-emulator/test_r16_service_journey, g1/test_service_orders (+2) |
| `inventoryAdjust` | 11 Inventory & POS | inventory-authority.js | 8 | behavioural | — | test_decimal_quantity_emulator, test_inventory_reservation_emulator, test_stock_comments_repairs_browser |
| `inventoryReconcile` | 11 Inventory & POS | inventory-reservation.js | 0 | behavioural | G-1,G-6 | test_admin_authz_matrix_emulator, test_callables_g1_emulator |
| `inventoryReleaseReservation` | 11 Inventory & POS | inventory-reservation.js | 0 | behavioural | G-1 | test_callables_g1_emulator |
| `inventoryReserve` | 11 Inventory & POS | inventory-reservation.js | 0 | behavioural | — | test_inventory_reservation_emulator |
| `posCreditAdjustment` | 11 Inventory & POS | inventory-authority.js | 1 | behavioural | G-1b | test_callables_g1b_emulator |
| `posReceipt` | 11 Inventory & POS | inventory-authority.js | 0 | behavioural | G-1b | test_callables_g1b_emulator |
| `posReconcile` | 11 Inventory & POS | inventory-authority.js | 0 | behavioural | G-1b | test_callables_g1b_emulator |
| `posRefund` | 11 Inventory & POS | inventory-authority.js | 1 | behavioural | G-1b | test_callables_g1b_emulator |
| `posReports` | 11 Inventory & POS | reporting-authority.js | 3 | behavioural | — | test_demand_insights_browser, test_my_products_kpi_browser, test_overview_recovery_browser (+7) |
| `posReturn` | 11 Inventory & POS | inventory-authority.js | 1 | behavioural | — | test_decimal_quantity_emulator |
| `posSale` | 11 Inventory & POS | inventory-authority.js | 3 | behavioural | — | g1/test_phase8_pos, g1/verify_money_adversarial, test_decimal_quantity_emulator (+1) |
| `posVoid` | 11 Inventory & POS | inventory-authority.js | 1 | behavioural | — | g1/verify_money_adversarial, test_decimal_quantity_emulator |
| `pushRegisterToken` | 12 Notifications | push.js | 1 | behavioural | — | test_push_emulator |
| `pushSetPrefs` | 12 Notifications | push.js | 1 | behavioural | — | test_push_emulator |
| `pushUnregisterToken` | 12 Notifications | push.js | 1 | behavioural | — | test_push_emulator |
| `adminApproveAgent` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | — | test_admin_agent_authority |
| `adminBackfillUserCards` | 13 Accounts & permissions | user-cards.js | 1 | behavioural | G-2 | e2e-emulator/s3, test_triggers_schedules_emulator, test_user_cards |
| `adminRejectAgent` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `adminSetAccountStatus` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | — | test_admin_agent_authority |
| `adminSetAgentStatus` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | — | test_admin_agent_authority |
| `adminSetRole` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | — | test_admin_agent_authority |
| `adminSetVerification` | 13 Accounts & permissions | index.js(re-export) | 1 | behavioural | G-1 | test_callables_g1_emulator |
| `adminVerificationDecide` | 13 Accounts & permissions | verification.js | 1 | behavioural | — | test_identity_verification |
| `adminVerificationDocUrls` | 13 Accounts & permissions | verification.js | 1 | behavioural | — | test_identity_verification |
| `adminVerificationQueue` | 13 Accounts & permissions | verification.js | 1 | behavioural | — | test_identity_verification |
| `agentListMembers` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `agentMemberStatus` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `assistedSessionEnd` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `assistedSessionValidate` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `entitlementGrant` | 13 Accounts & permissions | index.js | 3 | behavioural | G-1 | g1/test_phase9_boost, test_callables_g1_emulator |
| `memberAuthenticate` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1,G-3 | g1/test_3k_final_sweep, test_callables_g1_emulator, test_server_error_contract_emulator |
| `memberRegister` | 13 Accounts & permissions | index.js | 1 | behavioural | — | test_admin_agent_authority |
| `memberSetPin` | 13 Accounts & permissions | index.js | 1 | behavioural | G-1,G-3 | g1/test_3k_final_sweep, test_callables_g1_emulator, test_server_error_contract_emulator |
| `verificationSubmit` | 13 Accounts & permissions | verification.js | 1 | behavioural | — | test_identity_verification |
| `adminSearchBackfill` | 14 Search & taxonomy | search-index.js | 1 | behavioural | G-2 | e2e-emulator/test_pilot_completion, test_search_index_emulator, test_triggers_schedules_emulator |
| `locationAdminUpsert` | 14 Search & taxonomy | index.js | 0 | behavioural | — | test_national_safety_emulator |
| `locationSuggest` | 14 Search & taxonomy | index.js | 0 | behavioural | — | test_national_safety_emulator |
| `locationSuggestionResolve` | 14 Search & taxonomy | index.js | 0 | behavioural | — | test_national_safety_emulator |
| `adminAuditQuery` | 15 Admin & super-admin | index.js(re-export) | 1 | behavioural | G-6 | e2e-emulator/s5, test_admin_agent_authority, test_admin_authz_matrix_emulator |
| `adminModerateListing` | 15 Admin & super-admin | index.js(re-export) | 1 | behavioural | — | e2e-emulator/s5 |
| `adminMoneyWatch` | 15 Admin & super-admin | pilot-ops.js | 1 | behavioural | G-6 | test_admin_authz_matrix_emulator, test_pilot_ops_emulator |
| `adminResolveDispute` | 15 Admin & super-admin | index.js | 1 | behavioural | — | g1/verify_money_adversarial, test_dispute_refund_lifecycle |
| `adminSetTrustBadge` | 15 Admin & super-admin | index.js(re-export) | 1 | behavioural | G-1b | test_callables_g1b_emulator, test_trust_badges_emulator |
| `adminSetupStatus` | 15 Admin & super-admin | setup-status.js | 1 | behavioural | G-6 | test_admin_authz_matrix_emulator, test_pilot_ops_emulator, test_r16_server_fixes |
| `adminWhoAmI` | 15 Admin & super-admin | index.js(re-export) | 1 | behavioural | — | e2e-emulator/s5 |
| `platformStatsRefresh` | 15 Admin & super-admin | index.js | 1 | behavioural | — | e2e-emulator/s5 |
| `businessEnsureContext` | 2 Business OS & stores | business.js | 1 | behavioural | — | g1/test_business_os, test_staging_callable_adapter_emulator |
| `staffInviteAccept` | 2 Business OS & stores | business.js | 0 | behavioural | G-1 | g1/test_business_os, g1/verify_jj1_extra, test_callables_g1_emulator |
| `staffInviteCreate` | 2 Business OS & stores | business.js | 0 | behavioural | G-1 | g1/test_business_os, g1/verify_jj1_extra, test_callables_g1_emulator |
| `staffInviteRevoke` | 2 Business OS & stores | business.js | 0 | behavioural | G-1 | g1/test_business_os, test_callables_g1_emulator |
| `staffRemove` | 2 Business OS & stores | business.js | 0 | behavioural | G-1 | g1/test_business_os, g1/verify_jj1_extra, test_callables_g1_emulator |
| `adminApproveOrderPrice` | 3 Checkout & orders | index.js | 1 | behavioural | — | g1/verify_money_adversarial |
| `negotiationAction` | 3 Checkout & orders | negotiation.js | 1 | behavioural | — | g1/test_3k_final_sweep |
| `negotiationOrderAction` | 3 Checkout & orders | negotiation.js | 1 | behavioural | — | test_phase1_security, test_phase2_security |
| `negotiationSendOffer` | 3 Checkout & orders | negotiation.js | 1 | behavioural | — | g1/test_3k_final_sweep |
| `adminPaymentReviewResolve` | 4 SokoPay wallet & escrow | index.js | 0 | behavioural | — | test_inventory_reservation_emulator |
| `adminSetEscrowPolicy` | 4 SokoPay wallet & escrow | index.js(re-export) | 1 | behavioural | — | e2e-emulator/s5, test_admin_agent_authority, test_repair_rules (+1) |
| `auctionConfirmPayment` | 4 SokoPay wallet & escrow | commerce-modes.js | 0 | behavioural | G-1 | test_callables_g1_emulator |
| `escrowRelease` | 4 SokoPay wallet & escrow | index.js | 3 | behavioural | — | e2e-emulator/s4, e2e-emulator/test_r16_order_journey, e2e-emulator/test_r16_service_journey (+9) |
| `orderWalletPay` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | G-3 | e2e-emulator/test_r16_group_buy, test_archive_enforcement_emulator, test_group_buy_lifecycle (+2) |
| `serviceOrderWalletPay` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | — | e2e-emulator/test_r16_service_journey, g1/test_service_orders, g1/verify_money_reconcile |
| `sokopayLinkWalletPay` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | — | g1/verify_money_adversarial, test_phase1_security |
| `sokopayReleaseLink` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | — | g1/test_phase7_server_lifecycle, test_phase1_security |
| `walletAdjust` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | G-3 | g1/test_phase7_pesapal_stub, g1/test_phase7_server_lifecycle, g1/verify_money_adversarial (+5) |
| `withdrawalRequest` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | G-3 | e2e-emulator/test_pilot_completion, g1/test_phase5_evidence, g1/test_phase5_withdrawal (+4) |
| `withdrawalResolve` | 4 SokoPay wallet & escrow | index.js | 1 | behavioural | G-6 | e2e-emulator/test_pilot_completion, g1/test_phase5_evidence, g1/test_phase5_withdrawal (+4) |
| `pesapalCheckout` | 5 PesaPal | index.js | 1 | behavioural | G-2,G-3 | g1/test_phase7_pesapal_stub, g1/test_phase7_server_lifecycle, test_archive_enforcement_emulator (+3) |
| `pesapalRegisterIpn` | 5 PesaPal | index.js | 0 | behavioural | G-1 | g1/test_phase7_server_lifecycle, test_callables_g1_emulator |
| `pesapalTransactionStatus` | 5 PesaPal | index.js | 1 | behavioural | — | g1/test_phase6_negotiation, g1/test_phase7_server_lifecycle, test_commerce_modes (+2) |
| `adminAuctionAction` | 6 Auctions & price drop | auction-admin.js | 1 | behavioural | — | test_auction_admin_emulator |
| `adminAuctionDetail` | 6 Auctions & price drop | auction-admin.js | 1 | behavioural | — | test_auction_admin_emulator |
| `adminAuctionsList` | 6 Auctions & price drop | auction-admin.js | 1 | behavioural | — | test_auction_admin_emulator |
| `auctionCancel` | 6 Auctions & price drop | commerce-modes.js | 2 | behavioural | — | test_auction_admin_emulator |
| `auctionFinalize` | 6 Auctions & price drop | commerce-modes.js | 1 | behavioural | — | g1/verify_auction_adversarial, test_auction_live_impl_emulator, test_auction_pricedrop_emulator |
| `auctionPlaceBid` | 6 Auctions & price drop | commerce-modes.js | 1 | behavioural | — | e2e-emulator/test_auction_live_impl, e2e-emulator/test_r13b_live_stories_groupsoko, e2e-emulator/test_r13d_live_design (+7) |
| `priceDropMyRank` | 6 Auctions & price drop | price-drop-queue.js | 1 | behavioural | — | test_pricedrop_queue_emulator |
| `priceDropSettle` | 6 Auctions & price drop | price-drop-queue.js | 1 | behavioural | — | test_pricedrop_queue_emulator |
| `priceDropSubmit` | 6 Auctions & price drop | price-drop-queue.js | 1 | behavioural | — | e2e-emulator/test_r13d_live_design, test_pricedrop_queue_emulator |
| `adminLiveRemove` | 7 Live Commerce & stories | live-commerce.js | 0 | behavioural | G-6 | g1/test_live_commerce, test_admin_authz_matrix_emulator, test_live_stories_groupsoko_emulator |
| `liveComment` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, g1/test_live_commerce, test_auction_live_impl_emulator (+1) |
| `liveCreate` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/audit_visual, e2e-emulator/shot_auction_live_impl, e2e-emulator/test_auction_live_impl (+11) |
| `liveEnd` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, g1/test_live_commerce, test_auction_live_impl_emulator (+1) |
| `liveJoin` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_auction_live_impl_emulator, test_live_stories_groupsoko_emulator |
| `liveLeave` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_auction_live_impl_emulator, test_live_mini_compact_browser (+1) |
| `liveLike` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_auction_live_impl_emulator, test_pricedrop_queue_emulator |
| `liveModerate` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_live_stories_groupsoko_emulator |
| `livePause` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/shot_auction_live_impl, e2e-emulator/test_auction_live_impl, test_auction_live_impl_emulator |
| `livePin` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, g1/test_live_commerce, test_archive_enforcement_emulator (+1) |
| `livePing` | 7 Live Commerce & stories | live-commerce.js | 0 | behavioural | G-1 | test_callables_g1_emulator |
| `liveRemind` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_pricedrop_queue_emulator |
| `liveReport` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | g1/test_live_commerce, test_live_stories_groupsoko_emulator |
| `liveResume` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/shot_auction_live_impl, test_auction_live_impl_emulator |
| `liveSetProducts` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | G-1 | g1/test_live_commerce, test_callables_g1_emulator |
| `liveSetVideo` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | G-1 | test_callables_g1_emulator |
| `liveStart` | 7 Live Commerce & stories | live-commerce.js | 1 | behavioural | — | e2e-emulator/audit_visual, e2e-emulator/shot_auction_live_impl, e2e-emulator/test_auction_live_impl (+11) |
| `storyCreate` | 7 Live Commerce & stories | stories.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `storyReact` | 7 Live Commerce & stories | stories.js | 1 | behavioural | G-1 | g1/verify_story_react, test_callables_g1_emulator |
| `storyRemove` | 7 Live Commerce & stories | stories.js | 1 | behavioural | G-6 | test_admin_authz_matrix_emulator, test_live_stories_groupsoko_emulator |
| `storyReport` | 7 Live Commerce & stories | stories.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `storyView` | 7 Live Commerce & stories | stories.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `adminGroupBuyList` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `adminSetGroupBuyPolicy` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `chatOfferAction` | 8 Group Soko, group buy & chat | index.js | 1 | behavioural | G-1 | g1/test_3k_final_sweep, test_callables_g1_emulator |
| `groupBuyCancel` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `groupBuyCommitJoin` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `groupBuyJoin` | 8 Group Soko, group buy & chat | commerce-modes.js | 1 | behavioural | — | e2e-emulator/test_r16_group_buy, g1/test_phase10_market, test_commerce_modes (+1) |
| `groupBuyLeave` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `groupBuySettleNow` | 8 Group Soko, group buy & chat | group-buy.js | 1 | behavioural | — | test_group_buy_lifecycle |
| `groupSokoAccept` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `groupSokoAttachProduct` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `groupSokoCapitalConfirm` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `groupSokoCapitalRecord` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `groupSokoCreate` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `groupSokoExecute` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `groupSokoInvite` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `groupSokoPropose` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `groupSokoPurchaseStep` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |
| `groupSokoReport` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | test_live_stories_groupsoko_emulator |
| `groupSokoVote` | 8 Group Soko, group buy & chat | group-soko.js | 1 | behavioural | — | e2e-emulator/test_r13b_live_stories_groupsoko, test_live_stories_groupsoko_emulator |

## 4. Callables with no client caller (17)

The server is ready but no UI calls these names in `js/`, `html/` or `index.html`. This is **not a defect introduced here**: each is a server-side or admin tool, or a feature whose UI is not built yet. They are listed so the owner can decide; nothing was removed.

| Callable | Note |
|---|---|
| `staffInviteCreate`, `staffInviteAccept`, `staffInviteRevoke`, `staffRemove` | staff management UI not wired; behaviour proven by G-1 |
| `adminPaymentReviewResolve`, `pesapalRegisterIpn`, `adminLiveRemove`, `locationAdminUpsert`, `locationSuggestionResolve` | admin tools (console / future admin pages) |
| `auctionConfirmPayment`, `livePing`, `locationSuggest` | feature hooks without UI yet |
| `inventoryReserve`, `inventoryReleaseReservation`, `inventoryReconcile` | reservation is server-driven (order triggers); manual calls are admin/seller tools |
| `posReceipt`, `posReconcile` | POS projections; the POS UI uses local projections today |

## 5. Client ↔ server contract

- `tools/test_callable_names.mjs` (npm test) checks that every name the client calls exists as an export: **74 client names / 180 exports, 0 unknown**.
- The two names that do not exist (`translateContent`, `offlineMemberCustomToken`) are guarded by feature flags that default to `false` (SRV-12).
- No callable was renamed or removed. No duplicate export exists: `index.js` is a single object; the module-level duplicates in a grep are the `exports.x = module.x` re-exports.

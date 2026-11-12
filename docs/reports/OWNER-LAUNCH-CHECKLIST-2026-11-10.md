# OWNER LAUNCH CHECKLIST (10 Nov 2026) — hatua za mmiliki pekee

> Agent HAKUFANYA na HANA IDHINI ya kufanya: deploy, prod writes, backfill --fix,
> migration, live PesaPal, billing, commit/push/PR. Orodha hii ni kwa mmiliki.

## 0. Kabla ya yote (usalama)
- [ ] Hakiki branch + HEAD + diff: `git status`, `git diff --stat` (uncommitted 51 files — review + commit mwenyewe)
- [ ] Hakiki hakuna credentials kwenye repo: `grep -r "BEGIN PRIVATE KEY\|sk_live\|consumer_secret" --include="*.js" --include="*.json" . | grep -v node_modules`

## 1. Staging (project tofauti na prod — inapendekezwa)
- [ ] Unda/verify staging project: `firebase projects:list`
- [ ] Weka secrets za SANDBOX (PesaPal cybqa): `firebase functions:config:set` au functions/.env (staging)
- [ ] Deploy rules+indexes: `firebase deploy --only firestore --project <staging>`
- [ ] Deploy functions: `firebase deploy --only functions --project <staging>`
- [ ] Deploy hosting preview: Netlify branch deploy / `netlify deploy`
- [ ] Proof ya indexes: tembea flows 12 za Phase J (token-box, stories, group_soko, notifications...) — hakuna FAILED_PRECONDITION
- [ ] Endesha battery dhidi ya staging (badilisha env) — lazima 735/0/2

## 2. Production deploy (sokonet-3b847, europe-west1)
- [ ] Linganisha prod rules: `firebase firestore:rules:get --project sokonet-3b847 > /tmp/prod.rules && diff /tmp/prod.rules firestore.rules`
- [ ] Deploy firestore: `firebase deploy --only firestore --project sokonet-3b847`
- [ ] Weka PROD secrets (PesaPal LIVE keys + IPN URL/ID): functions env
- [ ] Deploy functions: `firebase deploy --only functions --project sokonet-3b847`
- [ ] Thibitisha schedules 5 zinaonekana: Cloud Scheduler console
- [ ] Deploy hosting: Netlify production (build `node tools/build_dist.mjs --minify --check`)
- [ ] Post-verify: fungua prod, ingia, nunua bidhaa ya majaribio (PesaPal SANDBOX kwanza), angalia escrow→release→ledger

## 3. Backfills (OWNER-RUN, baada ya deploy)
- [ ] Dry-run false completions (prod key, SOMO tu):
  `GOOGLE_APPLICATION_CREDENTIALS=/path/owner-key.json node tools/g1/owner_backfill_false_completions.mjs`
- [ ] Kagua manifest (CLASS A/B/D/E) — B ni manual review
- [ ] Fix (ukiridhika na A): `SKH_BACKFILL_PROJECT=sokonet-3b847 SKH_BACKFILL_I_UNDERSTAND_PROD=YES GOOGLE_APPLICATION_CREDENTIALS=/path/owner-key.json node tools/g1/owner_backfill_false_completions.mjs --fix --confirm`
- [ ] Vivyo hivyo kwa legacy sales: `owner_backfill_legacy_sales_scope.mjs` (STAMPABLE tu; AMBIGUOUS ni manual)

## 4. Live PesaPal/IPN proof (tazama PHASE C6 + test plan kwenye ripoti)
- [ ] Sandbox: checkout → lipa → IPN → GetTransactionStatus → settle → escrow → release (picha za Firestore docs)
- [ ] Live (kiasi kidogo TSh 1,000): vivyo hivyo + refund/cancel test
- [ ] Duplicate IPN: tuma IPN mara 2 → settle mara 1 (already_verified)
- [ ] Rekodi: trackingIds, orderIds, ledger markers, timestamps

## 5. Rollback (ikihitajika)
- [ ] Rules: Firebase console → Firestore Rules → History → revert to previous
- [ ] Functions: `firebase functions:delete <fn> --project sokonet-3b847` kwa zilizo na hitilafu, au redeploy toleo la awali (git tag ya pre-deploy — WEKA TAG KABLA YA DEPLOY)
- [ ] Hosting: Netlify → Deploys → Publish previous deploy
- [ ] Ukirollback functions lakini rules mpya zimebaki: hakiki compatibility (rules ni fail-closed — salama kwa ujumla)

## 6. Owner gates zilizobaki (0/4 → baada ya hapo juu)
- [ ] G1: prod deploy itself · G2: backfill manifest reviewed+executed · G3: live-IPN proof · G4: sitemap redirect target imethibitishwa

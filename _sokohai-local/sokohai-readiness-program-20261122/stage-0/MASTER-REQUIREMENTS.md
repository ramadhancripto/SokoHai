# Master requirements

**Date:** 22 Nov 2026.

| # | Requirement | Source | Applies to stage |
|---|---|---|---|
| R1 | Users can request account deletion **inside the app** and through a **public web link** | Google Play account-deletion policy (app creates accounts); PDPA 2022 right to deletion (stated in `privacy.html` "Your rights") | 1 |
| R2 | Deletion must not destroy financial, order or legally required records; those are retained or pseudonymised | owner rule; legal retention (LEGAL) | 1 |
| R3 | Spark-compatible: no deployed Cloud Functions; privileged steps via **owner-run Admin SDK script** or admin UI with rules | plan constraint | 1, 4 |
| R4 | Re-authentication before a deletion request is accepted | security | 1 |
| R5 | Only the account owner can request their own deletion; only admins execute it; every step audited | security | 1 |
| R6 | Privacy policy and terms describe exactly what happens (no false statements) | owner rule / PDPA | 2 |
| R7 | Legal facts come from the owner only | owner rule | 2 |
| R8 | OAuth branding: name, support e-mail, homepage, privacy URL, authorized domain, developer contact; logo only with brand verification | Google docs (sources in the readiness report) | 3 |
| R9 | Domain ownership of `sokohai.com` in Search Console before brand verification | Google | 3 |
| R10 | No billing, Blaze or free trial | owner rule | all |
| R11 | Existing sign-in must keep working; no `authDomain`, client or redirect changes | owner rule | 3, 4 |
| R12 | Tests on the emulator only; no production deletion tests | owner rule | 4 |

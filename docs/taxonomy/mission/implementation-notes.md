# Implementation / regression notes

- Existing canonical ID and live label routes coexist; test expecting absence of CAT-04 updated to check exactly one canonical route plus unchanged legacy route, and no duplicate option IDs. This is a UI routing policy extension, not a new alias.
- Added optional product SKU UI in existing builder. SKU state follows create/edit sessions and never overwrites a nonempty saved SKU. Barcode remains in existing form. Existing writer remains the authority.
- Canonical default-only/unsupported PARTIAL routes return no invented leaf recommendations; custom entry stays enabled. Scoped fieldEvidenceVerified PARTIAL entries may expose only evidenced informational fields without certifying the leaf.
- filters expose only references to schema attributes. Other native/selector/feature/unresolved links recorded for audit.
- New browser tests fail their process on any recorded failure; early test authoring failures retained in initial logs were repaired, not ignored.
- Earlier state-compatibility correction was insufficient to change core reconciliation because that core checks structural fields, not the PARTIAL sentinel. Protected core untouched; regression asserts its structural result AND independently asserts PARTIAL + UNSPECIFIED variant semantics.
- No Discover changes. No POS redesign. No commit/push.

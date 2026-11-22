# Owner requirements and decisions register

**Updated:** 22 Nov 2026, after Stage 0, Stage 1 and Stage 2. Stage 2 details: `stage-2\LEGAL-OWNER-INFORMATION-REQUIRED.md` (O1–O17).

**Status values:** OPEN / ANSWERED / NOT NEEDED YET.

## Technical access

| ID | Required | Why | Format | Priority | Status |
|---|---|---|---|---|---|
| T1 | Sign in to Google Cloud Console in the Claude browser **with the account that owns `sokonet-3b847`**; **do not start the free trial / billing** | read Branding, Audience, Data access, Clients (Stage 3) | say "nimeingia"; never share passwords | High | OPEN |
| T2 | Firebase Console access (same account) | providers, authorized domains, Firestore location | same | High | OPEN |
| T3 | Search Console: **a `google-site-verification` TXT record already exists on `sokohai.com`** (public DNS, 22 Nov). Confirm **which Google account** verified it and whether Search Console shows the Domain property for the project-owner account | brand verification | account + yes/no; no new DNS change unless the owner account is not verified | Medium | OPEN (corrected) |

## Business information

| ID | Required | Why | Format | Priority | Status |
|---|---|---|---|---|---|
| B1 | Operator legal name (company or individual / business name) | privacy, terms, contact; Google review credibility | text as registered | High | OPEN |
| B2 | BRELA registration number and TIN (if registered) | same | numbers | Medium | OPEN |
| B3 | Business or legal-notice address | same | postal address | Medium | OPEN |
| B4 | E-mail roles. Owner intention: `support@sokohai.com`, `admin@sokohai.com`, `info@sokohai.com`, `rshabansaid@gmail.com`. Assign roles (support, privacy, info, Google developer contact) | legal pages; OAuth | role table (`stage-2\LEGAL-OWNER-INFORMATION-REQUIRED.md`) | High | OPEN |
| B4a | Confirm each `sokohai.com` mailbox is **active and monitored**. DNS shows Google-hosted mail (MX `smtp.google.com`, SPF, DKIM; **no DMARC**); individual mailboxes are not verified | users and Google must reach a monitored address | yes/no per mailbox | High | OPEN |
| B5 | OAuth developer contact e-mail(s) | Google notices | address | High | OPEN |

## Legal information

| ID | Required | Why | Format | Priority | Status |
|---|---|---|---|---|---|
| L1 | Effective date of privacy and terms | both PENDING | date | High | OPEN |
| L2 | Minimum user age | privacy, terms, deletion of minors' data | number | High | OPEN |
| L3 | Retention periods per data class (orders, money, reports, chats, backups) | privacy, deletion design | table | High | OPEN |
| L4 | Lawyer review of the LEGAL markers (PDPA bases, transfers, liability, forum, payments) | drafts | lawyer's notes | Medium | OPEN |
| L5 | PDPC registration status / DPO | privacy | text | Medium | OPEN |
| L6 | Deletion response deadline (D2) | PDPA | days | High | OPEN |

## Branding decisions

| ID | Required | Why | Format | Priority | Status |
|---|---|---|---|---|---|
| BR1 | Display name on Google: **SOKOHAI** or **SokoHai** | must match the product | choice | High | OPEN |
| BR2 | Approve the 120×120 logo export from the approved 1024 px icon | branding upload | yes/no | Medium | NOT NEEDED YET |
| BR3 | Submit brand verification | shows name and logo | yes/no (after T1–T3, L1) | Medium | NOT NEEDED YET |

## Security decisions (Stage 2 additions)

| ID | Required | Why | Options | Priority | Status |
|---|---|---|---|---|---|
| S9 | Approve the fix for **search events exposing `userId` + query to all signed-in users** (`recommendationEvents`, rules lines 2079–2082) | privacy exposure not described in the policy | **remove `userId` from shared signals (recommended)** / disclose | High | OPEN |
| S10 | Narrow the `notificationPreferences` read; replace `via.placeholder.com` | minor exposure | approve / defer | Low | OPEN |
| S11 | Optional DMARC record for `sokohai.com` (owner DNS change) | mail spoofing protection, deliverability | add / defer | Low | OPEN |

## Security decisions

| ID | Required | Why | Options | Priority | Status |
|---|---|---|---|---|---|
| S1 (D1) | Deletion pending period | abuse protection | 0 / 7 / **14** / 30 days | High | OPEN |
| S2 (D3) | Chats of deleted users | other party's record | **anonymise** / delete for all | High | OPEN |
| S3 (D4) | Stores with staff or sales | business records | **block until transferred/closed** / close automatically | High | OPEN |
| S4 (D5) | Sellers with past orders | history | **archive listings** | Medium | OPEN |
| S5 (D6) | Backup retention after deletion | appeal vs minimisation | e.g. 30 days | Medium | OPEN |
| S6 (D7) | Delete Cloudinary media | completeness | yes (needs your Cloudinary key on your PC) / no | Medium | OPEN |
| S7 (D8) | Who executes deletions | control | **owner only** / owner + admins | High | OPEN |
| S8 | Purpose of the three `…europe-west2.run.app` authorized domains | possible exposure | keep / retire | Medium | OPEN |

## Legal (Stage 2 additions)

| ID | Required | Why | Priority | Status |
|---|---|---|---|---|
| L7 | Engage a Tanzanian lawyer for `stage-2\TANZANIA-LEGAL-QUESTIONS.md` (24 questions) | legal texts cannot be finalised without it | High | OPEN |
| L8 | Paid promotions prices/channels (only if switched on) | terms PENDING | Medium | OPEN |
| L9 | Jurisdiction / forum preference | terms | Medium | OPEN |

## Financial / paid-service decisions

| ID | Required | Why | Note | Status |
|---|---|---|---|---|
| F1 | Stay on Spark (no Blaze, no trial) | owner rule | the whole design is Spark-compatible; Blaze would only automate the executor | ANSWERED (stay on Spark) |

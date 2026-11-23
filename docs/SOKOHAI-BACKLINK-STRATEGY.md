# SokoHai — Backlink strategy

| | |
|---|---|
| Date | 23 Nov 2026 |
| Site | `https://sokohai.com` |
| Status | Plan and tracking template. **No outreach has been done and no backlink has been verified.** |
| Corrected | 24 Nov 2026: added the backlink tools that already exist (section 1a) and the Search Console status. Earlier versions of this file did not mention them |

## 1. What this document is

This document is a plan for earning links from other websites to SokoHai, plus a template for tracking them.

It **does not** report rankings, traffic or existing backlinks. Those can only be read from:

- Google Search Console: Links → External links;
- a crawler tool such as Ahrefs or Semrush.

Neither was available when this document was written.

### Four things that are often confused

| Term | Meaning | Who controls it | Current state |
|---|---|---|---|
| **Verified backlink** | A live link on another site to `sokohai.com`, confirmed in Search Console or by opening the page | The other site | **None verified.** Search Console was not accessible. |
| **Prospect** | A site that *could* link to SokoHai once contacted | Nobody yet | Categories are listed in section 3. No named site has agreed. |
| **Internal link** | A link from one SokoHai page to another | SokoHai | Exists: home → `/soko/`, `/mwongozo/`, `/about.html`; static pages link to each other (see section 5) |
| **Sitelinks** | Extra links Google *may* show under the main result | Google, automatically | **Cannot be requested or guaranteed.** A clear navigation and indexable section pages only make them more likely |

## 1a. What already exists (verified in `main` 077e70f and on production, 24 Nov 2026)

| Item | Where | Verified |
|---|---|---|
| Backlink register | Kituo cha Udhibiti → **SEO & Viungo** (`js/app/131-search-insights.js`, collection `seo_backlinks`, admin-only rule in `firestore.rules`). Records source, domain, target, anchor, rel type, quality, status; imports the Search Console "Top linking sites" CSV | Code: yes. **Its contents: NOT VERIFIED** (admin sign-in needed; it may be empty) |
| Partners page | `https://sokohai.com/washirika.html` (built by `tools/build_seo.mjs`) explains how to link legitimately | Production: 200 |
| Seller share kit | Wasifu → "Shiriki duka lako": shop link + optional "Tupo SokoHai" badge (`/assets/badges/tupo-sokohai.svg`) | Production badge: 200 |
| Sitemap | `https://sokohai.com/sitemap.xml` → 4 child sitemaps, 94 URLs (pages 16, listings 55, sellers 6, categories 17) | Production: 200 `application/xml` |
| Search Console | A `google-site-verification` TXT record exists on `sokohai.com` (public DNS, 22 Nov). **Which account owns the property, and whether the sitemap was submitted: NOT VERIFIED** | DNS only |
| Web search for pages linking to `sokohai.com` | Only the owner's own GitHub repositories mention SokoHai, and they contain **no link** to `sokohai.com` (checked 24 Nov) | 0 external links found |

## 2. Rules

1. **No paid links, link exchanges, private blog networks, comment spam, forum signature spam or automated directory submission.**
   - These break Google's spam policies and can cause a manual action.
   - A paid placement (advertising, sponsorship) is allowed only with `rel="sponsored"` or `rel="nofollow"`.
2. **No invented claims in outreach.**
   - Do not give numbers of users, sellers or transactions unless they come from real data.
   - Do not cite reviews, awards or certifications that do not exist.
   - Do not describe escrow or SokoPay as fully operational until it is switched on in production.
3. **One contact per prospect, and a single follow-up at most.**
4. **Every link we receive is checked** (section 6) before it is counted.

## 3. Sources (prospect categories)

Ranked by relevance to a Tanzanian marketplace. Each category needs a real, named site before outreach starts.

| # | Category | Why relevant | Page on SokoHai to link to | Effort |
|---|---|---|---|---|
| 1 | Tanzanian business and SME directories (chambers of commerce, sector associations, municipal business listings) | Local authority; editorially reviewed | `/` or `/about.html` | Low |
| 2 | Tanzanian tech and startup media (blogs, newsletters, podcasts covering local startups) | A launch story is newsworthy | `/about.html` | Medium |
| 3 | Universities and incubators (entrepreneurship centres, innovation hubs) | Student sellers and providers; guides are useful teaching material | `/mwongozo/` guides | Medium |
| 4 | Consumer-protection and digital-safety organisations | Buying-safety guides fit their mission | `/mwongozo/kununua-simu-iliyotumika/` | Medium |
| 5 | Trade groups for artisans (fundi), electricians, transport operators | Their members can list services | `/soko/huduma/` (when it has enough listings) and `/mwongozo/kuchagua-fundi-umeme/` | Medium |
| 6 | Partners SokoHai really works with (payment provider, logistics partner, suppliers) | "Where to buy us" / partner pages | `/` | Low, **only if the partnership is real** |
| 7 | Local news (business section) | Reaches buyers directly | `/about.html` | High |

## 4. Content worth linking to

Links are earned by pages that are useful on their own. Existing and proposed:

| Page | Status | Link-worthy because |
|---|---|---|
| `/mwongozo/kununua-simu-iliyotumika/` | Live in the static build | Practical checklist for buying a used phone safely |
| `/mwongozo/kuchagua-fundi-umeme/` | Live in the static build | How to choose an electrician |
| `/mwongozo/kuuza-haraka-sokohai/` | Live in the static build | Seller guide |
| `/soko/` and category pages | Live; only categories with enough real listings are published | Browsable public marketplace |
| Guide: avoiding scams when paying online in Tanzania | **Proposed** | High public interest; must use verifiable facts only |
| Guide: how to price second-hand goods | **Proposed** | Useful to sellers |
| English versions of the guides | **Proposed** | Only with their own URLs; then `hreflang` can be added |

**Landing pages:**

- **Products, Transportation, SokoPay and Business Management** do not have static, indexable landing pages yet. They are app screens on `/`.
- Before outreach that targets them, each needs its own indexable page with real content, so we do not send links to thin pages.

## 5. Internal links (in our control)

- **Home intro links:** Vinjari Kategoria (`/soko/`), Gundua Bidhaa, Gundua Huduma, Tafuta Usafiri, Miongozo ya Ununuzi (`/mwongozo/`).
  - "Gundua Bidhaa", "Gundua Huduma" and "Tafuta Usafiri" open in-app tabs.
- **Static page header:** Soko, Miongozo, Kuhusu, Msaada.
- **Static page footer:** about, help centre, contact, Soko, guides and legal pages.
- **Guides:** each guide should link to the matching category page and to one related guide.

## 6. Spam and quality checks for each incoming link

Before a link is marked **verified**, open the page and check:

| Check | Pass |
|---|---|
| The page is live and returns 200 | ✓ |
| The link points to `sokohai.com` (not a look-alike domain) | ✓ |
| The site is real and on-topic: Tanzania, commerce, technology or the community | ✓ |
| No signs of a link farm: pages full of unrelated outbound links, spun text, casino or pharma content | ✓ |
| The anchor text is natural (brand or descriptive, not stuffed keywords) | ✓ |
| If paid or sponsored, the link carries `rel="sponsored"` or `nofollow` | ✓ |
| The link also appears in Search Console → Links (may take weeks) | ✓ |

If a harmful site links to SokoHai, record it. Use Google's disavow tool **only** if there is a manual action or a clear pattern of spam links. Disavowing is rarely needed.

## 7. Tracking template

Copy this table into a shared spreadsheet. **Status** values: `prospect` → `contacted` → `replied` → `live` → `verified` (or `declined` or `removed`).

| Date | Site | Page URL (theirs) | Category (section 3) | Target URL (ours) | Anchor text | rel | Contact (role, not personal data) | Status | Verified on | Checked by | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | prospect | | | |

**Monthly review:**

- export Search Console → Links → External links;
- compare it with the table;
- mark any link that has disappeared as `removed`.

## 8. Owner actions needed (NEEDS MANUAL ACTION)

1. **Search Console:** verify the `sokohai.com` domain property, if that is not done yet, and submit `https://sokohai.com/sitemap.xml`. This is the only reliable source for verified backlinks and for sitelink eligibility.
2. **Named prospects:** pick named prospects for categories 1–3 and assign one person to outreach.
3. **Escrow and "Most Trusted" claims:** decide whether outreach may mention escrow. It is currently switched off in the production launch scope. The "Most Trusted" wording is positioning, not a verified fact.
4. **Landing pages:** approve building indexable landing pages for Products, Transportation, SokoPay and Business Management before targeting links at them.

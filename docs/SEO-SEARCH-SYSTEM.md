# SokoHai — Search intelligence, SEO and backlinks (2026-11-21)

This document describes how the system is built and how to operate it. The full completion report, with test results, sits in the owner's `_sokohai-local` folder.

## 1. Internal search

| Piece | File |
|---|---|
| Language data (Kiswahili/English synonym groups, phrases, intents, filler words, regions, noun-class plurals) | `shared/search-dictionary.js` |
| Understanding + ranking engine (pure; browser, build and tests) | `shared/search-engine.js` |
| Server catalogue tokens (Cloud Functions; same dictionary) | `shared/search-tokens.js` → `functions/shared/` |
| Search panel (suggestions, filters, "Je, ulimaanisha", related, sponsored label) | `js/23-smart-search.js` |
| Feed search (typo/plural/phrase matching + relevance order) | `js/app/00-bootstrap.js` (`renderFeedUI` step 5) |
| Analytics, admin views, `/?q=`, share kit | `js/app/131-search-insights.js` |

To teach search a new word, add it to a group in `shared/search-dictionary.js`. Do not add `if` conditions in UI code. Run `node functions/build-shared.js` so the server copy matches.

### Matching

For each query word the engine tries these match types, in this order of strength:

1. exact word
2. Kiswahili singular/plural form, or English plural
3. prefix (3 or more letters)
4. dictionary synonym or phrase
5. typo: 1 edit for words of 4–6 letters, 2 edits for 7 or more (Damerau-Levenshtein)

Matches are weighted by field: title 1.0, brand/model 0.9, category/attributes 0.75, category group 0.55, location/seller 0.5, description 0.45.

Every query word must match, except in queries of 3 or more words, where 2 of every 3 words are enough. The intent parser extracts the following from the query, and removes conversational filler:

- price limits: "chini ya 300k", "kuanzia 1m", ranges
- region: names and towns, e.g. Kariakoo → Dar es Salaam
- route: "Dodoma kwenda Tabora"
- sort intents: "bei nafuu" sorts cheapest first, "karibu nami" sorts nearest first
- condition: "mpya" (new) / "mtumba" (used)
- "waliothibitishwa": verified sellers only
- "inapatikana": in stock only

### Ranking (`WEIGHTS`, each factor 0..1)

| Factor | Weight | Source |
|---|---|---|
| relevance | .44 | text match above |
| intent | .04 | collection, category, condition match |
| location | .10 | region match, or distance from approximate coordinates |
| availability | .10 | stock > 0 = 1, low stock .85, made to order .65, stock not confirmed .55, out of stock .1 (and the score is halved) |
| completeness | .07 | photos, description, price, category, location, attributes |
| sellerTrust | .06 | server-owned verification flags only; clients cannot write these (`listingTrustKeys` in `firestore.rules`) |
| reputation | .05 | distinct non-owner reviewers; Bayesian average with prior 3.5 and weight 5 |
| transactions | .04 | server counters (`orderCount` / `soldCount` / `completedOrders`), log-scaled, capped at 50 |
| freshness | .06 | exponential decay with a 30-day time constant |
| engagement | .04 | views / likes / saves, log-scaled and capped |

Safeguards:

- **Paid boosts:** a boost adds no organic score. A relevant, active boost appears in a separate slot labelled "Imefadhiliwa", at most once per 10 results.
- **Keyword stuffing:** titles with repeated words, or very long titles, are penalised (×0.7 / ×0.8).
- **Duplicates:** listings from the same seller with the same title and price collapse to one.

## 2. Public pages (technical SEO)

`tools/build_seo.mjs` runs on Netlify after `build_dist`, as set in `netlify.toml`:

```
node tools/build_dist.mjs --minify --check && node tools/build_seo.mjs --out dist
```

It reads public listings through the Firestore REST API. It uses the public web key and only what the read rules allow, with a field mask so no phone numbers, e-mails or coordinates are fetched. It then writes the following.

| URL | Content |
|---|---|
| `/bidhaa/<slug>-<id>/` | Product page with Product, Offer and BreadcrumbList JSON-LD |
| `/huduma/<slug>-<id>/` | Service page with BreadcrumbList JSON-LD |
| `/duka/<slug>-<uid>/` | Public seller page: name and listings only |
| `/soko/<category>/` | Category page |
| `/soko/<category>/<region>/` | Category in one region; built only with 3 or more listings |
| `/chapa/<brand>/` | Brand page; built only with 3 or more listings |
| `/soko/`, `/soko/huduma/` | Marketplace hubs |
| `/mwongozo/…` | Guides |
| `/washirika.html` | Partners page |
| `/404.html` | Not-found page |
| `/sitemap.xml` + `sitemap-{pages,listings,sellers,categories}.xml` | Sitemap index and child sitemaps, with image entries |
| `/robots.txt` | Crawling rules |

Rules the build follows:

- **Missing pages:** a page that does not exist returns HTTP 404 (`netlify.toml`).
- **Unknown app paths:** marked `noindex` in the app.
- **Listing canonical:** an open listing in the app points its canonical at its static page.
- **Deploy previews:** they build static pages only (no production data).
- **Data source down:** the static pages and sitemap are still written, so the deploy never fails.

### Freshness and cost

Pages are as fresh as the last deploy. Recommended: a daily Netlify build hook, for example called from a scheduled job. Each build reads every product and service document once (N reads). On the Spark plan the free quota is 50,000 reads per day, so daily builds are fine up to tens of thousands of listings. For more than that, move to incremental generation; that is a future upgrade path.

## 3. Analytics (`search_logs`) and admin

- **Event types:** search, click, filter, cart, contact. They are written only by signed-in browsers, at most 40 events per tab session.
- **What is stored:** no uid, e-mail or location. Digit runs in queries (for example phone numbers) are masked. Events are create-only, and only admins can read them (`firestore.rules`).
- **Admin views:** Kituo cha Udhibiti → **Utafutaji** shows totals, zero-result rate, top and zero-result queries, search→click and search→cart/contact conversion, categories, filters and latency. It reads up to 1,500 events per open.
- **Purchases:** not measured, because checkout is off.
- **Retention:** admins may delete old events. Owner decision: how long to keep them (suggested 90 days).

## 4. Backlinks (ethical)

- **Linkable assets:** listing, seller, category and brand pages, guides, and the partners page.
- **Seller share kit:** Wasifu → "Shiriki duka lako" gives the seller their shop link and an optional "Tupo SokoHai" badge for their own site.
- **Backlink register:** Kituo cha Udhibiti → **SEO & Viungo** (`seo_backlinks`, admin-only) records the source page, domain, target, anchor, type (follow / nofollow / ugc / sponsored), quality 1–5, kind and status. It shows referring domains and monthly growth, and imports the Search Console "Top linking sites" CSV.
- **Never:** bought links, private blog networks, automated link building, comment spam, hidden links, link exchanges, or claimed partnerships without written permission.

## 5. Owner actions after deploy

1. **Google Search Console:** verify `sokohai.com`, submit `https://sokohai.com/sitemap.xml`, and watch Coverage and Enhancements.
2. **Netlify:** make `sokohai.com` the primary domain, so other hosts redirect to it. Before that, confirm that Firebase Auth → Authorized domains includes `sokohai.com`.
3. **Daily rebuild:** add a build hook and schedule it once per day.
4. **Retention:** decide how long `search_logs` are kept.

# SokoHai Visual + Real Listings + Boost Closure

Date: 2026-09-22

## Architecture preserved

This repair extends the existing Home, Discover, cards, announcement collection, search activity, and boost payment flow. It does not create a second marketplace, duplicate collection, or replacement route.

## Repaired behavior

### White-first visual hierarchy

- Added `css/33-white-marketplace.css` as the final marketplace visual layer.
- Main surfaces, cards, discovery, menus, Chat surfaces, and listing sections remain white.
- Green is used for primary/selected actions.
- Blue remains for secondary navigation/information.
- Gold is restricted to boosted/premium accents.
- Red remains semantic for failures/destructive actions.

### Announcement story card

- Removed the heavy animated marquee implementation.
- Active Firestore `announcements` records now render as a white story card.
- Real campaign image fields (`image`, `imageUrl`, `mediaUrl`, `photo`) are supported.
- No hardcoded promotional announcements are shown as if they were database campaigns.
- If no active database announcement exists, the card is hidden instead of showing fake campaign content.
- Admin announcement form now requires a valid HTTPS campaign-image URL and persists it.

### Centralized real listing ranking

Added `js/app/39-market-ranking.js` as the single ranking implementation for:

- Nearby
- Trending
- Most searched
- Boosted
- Recommended

The UI only renders records returned by this ranking layer.

Ranking uses available real fields including:

- coordinates/region
- recency
- recent views
- searches
- likes
- saves
- shares
- recent orders
- ratings/reviews
- verification
- listing availability
- category/query relevance

No dummy products, sellers, services, or transport listings are created. Missing data produces a proper empty state.

### Search activity

- Marketplace and Discover searches now write deduplicated `recommendationEvents` records of type `search` for authenticated users.
- Recent search events use a 14-day window.
- Most-searched ranking matches actual recent query terms against actual listing content.
- The signal loader is cached for two minutes and capped at 250 recent events.

### Nearby

- Uses Haversine distance when both user and listing coordinates exist.
- Falls back to an actual region match when coordinates are unavailable.
- Distance appears only when it was actually calculated.
- No invented distance is displayed.

### Boost eligibility and ranking

A listing receives boosted placement only when:

- it is a real eligible listing;
- `isBoosted` is true;
- the boost has not expired;
- its target views have not already been delivered;
- it remains active and not deleted, archived, suspended, blocked, rejected, inactive, or draft;
- it remains relevant to an active query/category.

New free and paid boosts now persist:

- `boostDays`
- `boostedAt`
- `boostExpiresAt`
- `boostTargetViews`
- `boostedViewsCount`

Legacy boosts with `boostedAt` but no expiry receive only their old default 3-day Product or 7-day Service/Transport window; they cannot rank forever.

Boost adds placement weight but does not override zero search relevance. Product, Service, and Transport cards use the same active-boost disclosure rule.

## Real discovery sections

Home now renders four independent sections from the centralized engine:

1. Zinazovuma Sasa
2. Karibu Nawe
3. Zinazotafutwa Sana
4. Boosted

Cross-section deduplication is applied where results permit it. Reuse occurs only when a section would otherwise be empty and the content is intentionally relevant to that distinct section.

## Verification

- Market ranking tests: **13 passed, 0 failed**
- Market visual contract: **12 passed, 0 failed**
- Full repository `npm test`: **exit 0**
- Chat E2E: **57 passed, 0 failed**
- Chat authority contract: **32 passed**
- HTML build: byte-exact
- JavaScript syntax: passed
- `git diff --check`: passed

## Honest visual-test boundary

The sandbox has no Chrome, Chromium, Firefox, Playwright, Puppeteer, or Cypress runtime. Automated DOM, CSS-contract, responsive-contract, and logic tests were performed, but device screenshots were not fabricated or claimed. Final visual screenshot inspection must be done after the repaired root build is deployed or opened in a real browser.

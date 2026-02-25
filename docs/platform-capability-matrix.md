# Platform Capability Matrix for Lead Generation Scrapers

## Overview
All adapters implement the same `UnifiedLeadRequest` / `UnifiedLead[]` interface.  
Discovery: keyword + location search.  
Enrichment: bio/website crawl (shared `leadEnricher`).  
Stop condition: leads.length >= leadsCount or no more results.  
Scale target: 3000–5000/run on Render free (low concurrency, Cheerio-first).

| Platform                  | Discoverable Entities          | Likely Contact Fields                  | Required Inputs          | Optional Filters                  | Limitations / ToS Risk | Confidence (0-100) | Fallback Routes                          | Maintenance Notes (2026) |
|---------------------------|--------------------------------|----------------------------------------|--------------------------|-----------------------------------|------------------------|--------------------|------------------------------------------|--------------------------|
| Google Maps              | Places, businesses            | name, phone, website, address, hours   | keywords, location      | radius, category, minRating      | CAPTCHA, geo-blocks   | 95                 | Website → contact page crawl            | Update card selectors |
| Yellow Pages             | Businesses                    | name, phone, address, website, email   | keywords, location      | category, radius                 | Pagination changes    | 90                 | Direct listing parse                    | YP search URL params |
| Justdial                 | Businesses (India focus)      | name, phone, address, website          | keywords, location      | category                         | JS heavy              | 85                 | Puppeteer list + detail                 | Selector updates frequent |
| Instagram                | Profiles, business accounts   | username, bio (email/phone), website   | keywords                | minFollowers, location tags      | Strong anti-bot, login| 65                 | Bio regex → website crawl               | Infinite scroll, GraphQL endpoints |
| Facebook                 | Pages, groups                 | page name, about, phone, email, website| keywords, location      | minLikes, category               | Login walls           | 60                 | About section → website                 | Dynamic IDs |
| LinkedIn                 | People, companies             | name, headline, website, company size  | keywords, location      | minConnections, industry         | Very strict, login    | 50                 | Company page → website                  | Cookies + stealth critical |
| X (Twitter)              | Users, tweets                 | username, bio, location, website       | keywords                | minFollowers, location           | Rate limits           | 70                 | Bio → website                           | Advanced search URL |
| TikTok                   | Users, videos                 | username, bio, links, followers        | keywords                | minLikes, location               | Mobile emulation      | 65                 | Bio → link-in-bio crawl                 | Signature params |
| Google Ads Transparency  | Advertisers, campaigns        | advertiser name, website, ad details   | keywords                | country, date range              | Public but rate-limited| 80                | Advertiser site crawl                   | Reverse-engineered API endpoints |
| Meta Ads Library         | Pages, ads                    | page name, website, funding, ad text   | keywords                | country, active/inactive         | Public                | 75                 | Page profile → contact                  | Search URL + infinite scroll |

**Confidence Expectations**: Directories/Maps = production-ready. Social = test weekly. Ads libs = stable public data.

## Fallback Strategy
Shared fallback flow across adapters:
1. Discovery page/profile parse.
2. If profile includes website, send website to `leadEnricher.crawlWebsite(...)`.
3. Extract contact data from landing + internal links (depth=2, Cheerio).
4. Merge discovered social links and normalize into `UnifiedLead`.

## Maintenance
- Update selectors every 2–4 weeks (use Playwright Inspector).
- Monitor breakage patterns: infinite scroll selectors, GraphQL changes, CAPTCHA triggers.
- Track adapter-level version metadata (`lastUpdated`, parser version).
- Maintain canary test keywords by platform to detect silent parser drift.

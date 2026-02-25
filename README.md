# acqz (lead-gen-scrapers)

Production-ready TypeScript Node.js lead generation scraping API using Crawlee + Playwright + stealth fingerprints, optimized for Render free tier.

## Features
- 10 platform adapters with a universal input contract.
- Crawlee Cheerio-first for fast directory/ads extraction.
- Playwright + fingerprint-suite-style stealth for social scraping.
- Shared lead enrichment crawler for email/phone/social discovery.
- Early abort at `leadsCount`, retries, timeout, API-key auth.

## Install & Run
```bash
npm install
npm run build
npm run start
```

Dev mode:
```bash
npm run dev
```

## API
### `POST /leads/:platform`
Header:
- `x-api-key: <API_KEY>`

Body (`UnifiedLeadRequest`):
```json
{
  "leadsCount": 100,
  "keywords": ["plumber", "hvac"],
  "location": "New York, NY",
  "filters": { "minRating": 4, "country": "US" },
  "extractDetails": true,
  "extractSocialLinks": true,
  "maxConcurrency": 3,
  "proxy": "http://user:pass@host:port"
}
```

Response:
```json
{
  "success": true,
  "leadsFound": 100,
  "leads": [],
  "runtimeSeconds": 21.4
}
```

## n8n Usage Example
Use **HTTP Request** node:
- Method: `POST`
- URL: `https://<your-render-url>/leads/google_maps`
- Headers: `x-api-key={{$env.API_KEY}}`
- JSON body: map upstream keyword + location fields to `UnifiedLeadRequest`

Then pass `{{$json.leads}}` to downstream CRM/Sheets/Email nodes.

## Supported Platforms
- instagram
- facebook
- linkedin
- google_maps
- google_ads_transparency
- meta_ads_library
- x
- tiktok
- yellowpages
- justdial

# Job data sources and terms review

**Status: pending sign-off by Roman before any live ingest beyond the one-time seed collection.**
The seed snapshot (`convex/seedData/snapshot.json`, 200 listings) was collected on 2026-10-24 from the public endpoints below, at 1 request per second, with a descriptive User-Agent.

| Source | Endpoint | Access | Stored fields | Terms reviewed | Reviewer | Date |
|---|---|---|---|---|---|---|
| Greenhouse Job Board API | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` and `/jobs/{id}` | Public, no auth | title, location, description text, apply URL, updated time | [ ] | Roman | |
| Lever Postings API | `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU: `api.eu.lever.co`) | Public, no key | title, location, workplace type, description text, hosted/apply URL, created time | [ ] | Roman | |
| Apify Store Actor `bovi/greenhouse-lever-ashby-job-scraper` | Apify API `run-sync-get-dataset-items` | `APIFY_TOKEN` | same as above | [ ] | Roman | |

## Curated employers (proposed, probed 2026-10-24)

Greenhouse: stripe, coinbase, airbnb, figma, discord, robinhood, databricks, cloudflare, gitlab, duolingo, reddit, asana, instacart, pinterest, lyft, datadog, mongodb, elastic, gusto, affirm, doordashusa.
Lever: palantir, spotify, zoox, matchgroup.
Each board was public and listed at least one computer science role on 2026-10-24.

## Not integrated

- **Microsoft, Apple and other company career sites** without a public jobs API: the team asked to scrape them once into the seed. Not done: the brief excludes scraping sites without a public API or permission. Needs a terms review and sign-off here first; the seed builder (`npx convex run ingest/run:run` then `seed:exportSnapshot`) accepts new sources once one is approved.
- LinkedIn, Indeed: no sanctioned public listing API.
- Adzuna: terms are restrictive for a product that stores listings.
- Disability-focused boards: no public API or feed terms verified; future partnership feeds.

## Rules

Documented public endpoints only; honor any employer exclusion request; store only fields needed to display, match and link back; missing accommodation information is never evidence that an employer cannot provide one.

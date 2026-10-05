# MetrixIQ SEO launch checklist

Updated: 28 September 2026

## Canonical property

Use the canonical production host:

- `https://www.metrixiq.co.uk`

Do not add an application-level host redirect. Vercel owns the primary-domain redirect to avoid redirect loops.

## Google Search Console

1. Add or open the `https://www.metrixiq.co.uk` URL-prefix property, or verify the domain property if DNS verification is preferred.
2. Copy the verification token into Vercel as `GOOGLE_SITE_VERIFICATION`.
3. Deploy the verified production build.
4. Confirm the verification tag is present on the public homepage.
5. Submit:
   - `https://www.metrixiq.co.uk/sitemap.xml`
6. Confirm:
   - `https://www.metrixiq.co.uk/robots.txt`
   - public pages are indexable;
   - `/app`, `/auth`, `/login` and `/api` remain excluded/noindex.

## First URLs to request indexing

Request indexing in this order after the production deployment is healthy:

1. `https://www.metrixiq.co.uk/`
2. `https://www.metrixiq.co.uk/solutions`
3. `https://www.metrixiq.co.uk/pricing`
4. `https://www.metrixiq.co.uk/fleet-performance-management`
5. `https://www.metrixiq.co.uk/driver-performance-scorecards`
6. `https://www.metrixiq.co.uk/fleet-compliance-monitoring`
7. `https://www.metrixiq.co.uk/delivery-operations-software`
8. `https://www.metrixiq.co.uk/driver-coaching-software`
9. `https://www.metrixiq.co.uk/fleet-data-analytics`
10. `https://www.metrixiq.co.uk/use-cases`
11. `https://www.metrixiq.co.uk/use-cases/fleet-performance-dashboard`
12. `https://www.metrixiq.co.uk/use-cases/multi-site-delivery-performance`
13. `https://www.metrixiq.co.uk/compare/spreadsheets-vs-fleet-performance-software`

The remaining resource and trust pages can be discovered through the sitemap and internal links. Do not repeatedly request indexing for unchanged URLs.

## Analytics

Optional GA4 is controlled by:

- `NEXT_PUBLIC_GA_MEASUREMENT_ID`

GA4 is not loaded until the visitor accepts analytics cookies. Conversion events use the `cta_click` event and include CTA location/label context.

## Public contact

Set a real public address only when ready:

- `CONTACT_EMAIL`

Do not publish placeholder email, phone, address or social-profile data.

## Pre-launch checks

Before promoting a deployment to production:

- CI tests and production build are green.
- Homepage returns 200.
- Primary public landing pages return 200.
- Invalid public URL returns a real 404 and is noindex.
- `sitemap.xml` contains canonical `www` URLs only.
- `robots.txt` points to the canonical sitemap.
- No `www ↔ non-www` redirect loop exists.
- Every public page has a unique purpose/title/description.
- Breadcrumbs and internal links connect solution, use-case and resource clusters.
- Structured data renders without malformed JSON.
- Private/auth routes stay excluded from indexing.

## Ongoing Search Console review

After launch, review Search Console weekly at first:

- Pages indexed vs submitted.
- Crawled - currently not indexed.
- Duplicate/canonical warnings.
- 404 or redirect errors.
- Search queries generating impressions.
- Pages with impressions but weak CTR.
- Mobile Core Web Vitals.

Use real query/impression data to decide the next content pages instead of creating large numbers of speculative keyword pages.


## IndexNow / Bing discovery

MetrixIQ now publishes an IndexNow verification key at:

- `https://www.metrixiq.co.uk/ef82465f539835b58ac06a883439c0c0.txt`

After the deployment containing that file is promoted to production:

1. Run `npm run seo:indexnow` to verify the live key file and canonical sitemap.
2. Run `npm run seo:indexnow:submit` to submit up to 100 canonical sitemap URLs to IndexNow.
3. The GitHub workflow **IndexNow Submit** provides the same flow manually and requires an explicit `submit=true` confirmation.
4. A `202` response means the batch was accepted for key validation; it does not guarantee indexing.
5. Bing Webmaster API access is optional and can be connected later for Bing-specific crawl/index reporting.

Do not rotate the IndexNow key casually. If it is rotated, update both the public key file and the configured key before submitting new batches.


IndexNow production submission trigger prepared after the 28 September 2026 production promotion.

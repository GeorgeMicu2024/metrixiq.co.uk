# MetrixIQ Stable

A standalone MetrixIQ front-end and operational analytics demo designed to run reliably on Windows and deploy as a standard Next.js application.

## Important architectural choice
The UI uses regular CSS from `app/globals.css`. There is no Tailwind, shadcn CSS, PostCSS plugin, Cloudflare Worker binding, D1 or Wrangler dependency in this build.

## Included
- Professional marketing site
- Local sign in / registration demo
- Fleet dashboard
- Drivers, performance, coaching and AI insight views
- Multi-file Smart Import
- XLS/XLSX/CSV/JSON analysis
- Digital PDF text review
- TRID → driver mapping from schedule/master files
- DCR, POD, IADC, CC, FICO, eMentor, PSB, reattempts, concessions and LoR parsing
- Reports, plans and workspace settings UI

Production authentication, database persistence and Stripe billing should be connected before commercial customer launch.

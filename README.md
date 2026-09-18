# MetrixIQ

MetrixIQ is a fleet and driver performance intelligence platform built for delivery operations teams. It combines secure multi-tenant workspaces, operational data ingestion, driver scorecards, coaching workflows, historical analytics, billing, and team administration in a single Next.js application.

## Stack

- Next.js 16 / React 19
- Supabase Auth + PostgreSQL + Row Level Security
- Stripe Checkout, Billing Portal and webhooks
- XLSX / CSV / HTML / PDF ingestion
- GitHub Actions CI
- Vercel-ready deployment

## Core product areas

- Fleet command dashboard
- Driver directory and scorecards
- DCR, POD, IADC, CC, FICO/eMentor, PSB, reattempts, concessions and LoR analytics
- Historical performance analytics
- Performance alerts and coaching workflows
- Smart Import with TRID/driver identity resolution
- Team roles and workspace access
- Plans, trials and subscription billing
- Platform administration

## Development

```bash
npm ci
npm run dev
```

Run the automated integrity tests:

```bash
npm test
```

Create a production bundle:

```bash
npm run build
```

## Environment

Copy `.env.example` to `.env.local` and configure the required Supabase and Stripe values. Never commit live secrets.

## Branch strategy

Active development is currently performed on:

`feature/driver-scorecard-auth`

`main` remains the production baseline until the feature branch has passed CI, preview deployment verification, security checks and final acceptance.

## Security

MetrixIQ uses Supabase RLS and authenticated RPCs for tenant isolation and privileged operations. Sensitive billing and platform administration data is not intended for direct anonymous Data API access.

## CI

`.github/workflows/ci.yml` runs:

1. `npm ci`
2. `npm test`
3. `npm run build`

on pushes to the active feature branch and on pull requests.

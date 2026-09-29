# Car Rentals Phase 1 — Isolated Preview Evidence

Recorded: 2026-08-19

## Release identity

- Car Rentals source commit: `e87a4eb360645027d77a2b3e1d7a0fd9e851bc24`
- Reconciled private branch commit: `0722f82082ba2cdc60f2b22e986ba313156ff7cd`
- Private branch: `agent/align-homepage-pilot-claims`
- Private remote: `IratePilotAdmin/iratepilot-private-laptop-backup-2026-08-16`
- Publication mode: normal fast-forward push after a non-force merge reconciliation
- Local and private remote HEAD after publication: `0722f82082ba2cdc60f2b22e986ba313156ff7cd`

## Isolated Preview deployment

- Vercel project: `iratepilotadmin-private-preview`
- Environment: Preview
- Deployment ID: `HSLpTzWocPQfvaY41YKoq4uM7c1Y`
- Deployment commit: `0722f82082ba2cdc60f2b22e986ba313156ff7cd`
- Deployment status: Ready
- Build duration shown by Vercel: 49 seconds
- Preview origin: `https://iratepilotadmin-private-preview-pdyyzz3jf-irate-pilot.vercel.app`
- Accepted route: `/cars`

No Production flag, promotion, alias, domain change, migration, supplier credential, supplier traffic, reservation, or payment action was used.

## Browser acceptance

- The page loaded with title `Car rental planning preview | iRatePilot`.
- Customer navigation and the footer both exposed `Car rentals` at `/cars`.
- The initial form exposed pickup and return locations, dates, times, primary-driver age, and vehicle class.
- The initial disclosure stated `Supplier-offline planning preview` and `No rental-company API request or payment is made`.
- An invalid past-date request displayed both `Pickup date cannot be in the past` and `Return must be at least one hour after pickup`.
- A valid request rendered Miami International Airport to Miami International Airport, Aug 20–22, 2026, an SUV, age 25 or older, and three rental days.
- The valid summary stated `Live vehicles and rates are unavailable` and confirmed that nothing was externally searched, priced, held, or reserved.
- Browser console errors: `0`.

## Boundary retained

Phase 1 validates and displays planning details only. Supplier selection, contracts, accounts, credentials, live inventory, rates, protection products, eligibility decisions, reservations, payments, migrations, and Production remain outside this release.

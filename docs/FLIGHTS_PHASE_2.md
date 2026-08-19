# iRatePilot Flights — Phase 2

Status: Supplier-readiness software, Git publication, isolated Preview deployment, and authenticated browser acceptance complete; all external activation gates remain closed

## Purpose

Phase 2 adds a protected, read-only flight supplier-readiness workspace at `/admin/flights`. It gives administrators a neutral framework for comparing supply models, defining required capabilities, and sequencing external approvals before any integration is selected.

The workspace is an evaluation tool. It does not name an approved supplier, record a contract, store evidence, accept credentials, contact a provider, or activate a runtime.

## Supply paths under evaluation

- NDC aggregator: direct airline content through one contracted integration surface.
- Global distribution system: broad schedule, fare, ticketing, and agency workflows through an established network.
- Ticketing consolidator: contracted ticketing and settlement when iRatePilot does not hold its own issuing authority.

Listing a path does not claim a relationship or approval. Commercial, legal, coverage, servicing, accreditation, settlement, security, and support diligence remain required.

## Capability scope

The readiness workspace groups certification requirements into:

- shopping and pricing;
- orders and ticketing;
- post-booking servicing; and
- operational controls.

These requirements cover schedules, fares, taxes, baggage, fare rules, repricing, traveler validation, order creation, ticket issuance, provider confirmations, idempotency, schedule changes, exchanges, cancellations, refunds, webhook verification, audit evidence, and outage fallback.

## Fail-closed boundary

The Phase 2 model always returns these activation states as disabled:

- sandbox supplier traffic;
- Production supplier traffic;
- ticketing; and
- flight payments.

Even complete evaluation evidence cannot change those states. Enabling any one of them requires a later implementation and a separate approval.

Phase 2 adds no database migration, API route, server action, environment variable, credential field, external request, provider SDK, payment flow, ticketing function, or Production configuration.

## Software acceptance gates

- [x] Add a protected `/admin/flights` supplier-readiness workspace.
- [x] Define neutral NDC aggregator, GDS, and consolidator evaluation paths without supplier claims.
- [x] Define shopping, orders, servicing, and operational certification capabilities.
- [x] Define ten separately owned activation gates.
- [x] Prove that completing every evaluation gate still leaves sandbox traffic, Production traffic, ticketing, and payment disabled.
- [x] Keep the workspace read-only and free of network, credential, database, and mutation code.
- [x] Pass ESLint, TypeScript, 987 tests across 229 files, and the optimized 113-page Next.js build.

## Release gates

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## External activation gates

- [ ] Select one authorized supply and ticketing path.
- [ ] Approve contract, content rights, accreditation, settlement, liability, and support ownership.
- [ ] Receive sandbox credentials through an approved secure channel.
- [ ] Implement a sandbox-only adapter behind explicit application and database kill switches.
- [ ] Complete shopping, order, ticketing, servicing, payment, security, privacy, and support certification.
- [ ] Complete controlled isolated Preview acceptance with rollback evidence.
- [ ] Make a separate Production decision before enabling supplier traffic, ticketing, or flight payments.

Phase 2 software completion is not supplier approval and never authorizes a live flight sale.

The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_2_PREVIEW_EVIDENCE_2026-08-18.md`.

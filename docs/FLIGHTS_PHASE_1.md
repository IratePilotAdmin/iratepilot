# iRatePilot Flights — Phase 1

Status: Phase 1 software and isolated Preview browser acceptance complete; all airline content, ticketing, payment, and Production traffic remain disabled

## Purpose

Phase 1 adds an honest consumer flight-planning surface at `/flights`. Travelers can prepare a route, date, cabin, and party-size request. The request is validated locally and rendered as a planning summary only.

## Safety boundary

This phase contains no airline, NDC, GDS, consolidator, ticketing, settlement, or servicing adapter. It cannot:

- query schedules, fares, seats, availability, baggage, or fare rules;
- claim an airline partnership or quote a live or guaranteed price;
- hold, reserve, ticket, exchange, cancel, or refund a flight;
- collect payment or traveler identity documents;
- send passenger data or make an external network request.

## Software acceptance gates

- [x] Add `/flights` to customer navigation, the footer, and the sitemap.
- [x] Validate airport codes, dates, trip type, traveler count, and cabin without external traffic.
- [x] Display a validated planning summary while clearly stating that live fares and booking are unavailable.
- [x] Add focused tests proving supplier-offline behavior and consumer disclosure coverage.
- [x] Pass ESLint, TypeScript, 982 tests across 228 files, and the optimized 112-page Next.js build.

## Release gates

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy to the isolated Preview project after separate approval and complete browser acceptance without adding provider credentials or traffic.

The isolated Preview deployment and browser evidence are recorded in `docs/FLIGHTS_PHASE_1_PREVIEW_EVIDENCE_2026-08-18.md`.

## External activation gates

- [ ] Select and contract an authorized airline-content and ticketing path.
- [ ] Receive sandbox credentials through an approved secure channel and define allowed endpoints.
- [ ] Complete provider certification for shopping, repricing, order creation, ticketing, schedule changes, exchanges, cancellations, refunds, and webhook security.
- [ ] Approve passenger-data, fraud, payment, settlement, chargeback, accessibility, legal, support, and incident-response procedures.
- [ ] Complete a controlled sandbox acceptance with recorded evidence and rollback support.
- [ ] Make a separate Production decision before enabling airline traffic, flight payments, or ticketing.

Software completion never authorizes a provider connection or live flight sale.

The next supplier-readiness phase is recorded separately in `docs/FLIGHTS_PHASE_2.md` and does not change this Phase 1 consumer-planning boundary.

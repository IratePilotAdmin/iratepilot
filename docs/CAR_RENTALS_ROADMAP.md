# iRatePilot Car Rentals — Complete Package Roadmap

Prepared: August 19, 2026

Status: **Phases 1–2 released and accepted in isolated Preview; supplier contact, contracts, accounts, credentials, traffic, reservations, payments, and Production remain pending**

## Package objective

Build a commercially credible car-rental vertical while separating completed software from supplier approval and live authority. Every phase must remain truthful about unavailable inventory and must fail closed until the applicable provider, legal, operational, payment, security, and release gates are satisfied.

## Development sequence

1. **Consumer planning foundation** — supplier-offline location, date, time, driver-age-band, and vehicle-class planning at `/cars`.
2. **Supplier-readiness workspace** — protected admin view for neutral rental-company, broker, aggregator, and GDS evaluation paths.
3. **Inventory normalization** — locations, opening hours, vehicle-class equivalency, capacity, transmission, fuel or powertrain, accessibility, and feature contracts.
4. **Total-price and policy model** — base rate, taxes, mandatory fees, one-way fees, airport surcharges, mileage, fuel or charging, deposits, protection products, and exclusions.
5. **Quote and reprice safety** — immutable quote identifiers, expiry, availability recheck, price-change consent, policy snapshots, and no-guarantee handling.
6. **Driver eligibility and privacy** — minimum age, license rules, residency, additional drivers, geographic restrictions, data minimization, retention, and deletion.
7. **Reservation lifecycle** — create, confirm, modify, cancel, no-show, pickup, extension, early return, late return, refund, and supplier-reference reconciliation.
8. **Payment and risk controls** — pay-now versus pay-at-counter, deposits, authorization holds, fraud, chargebacks, refunds, currency, taxes, and receipt accuracy.
9. **Operations and customer support** — pickup failure, counter disputes, unavailable class, upgrades, breakdowns, accidents, roadside assistance, damage claims, and emergency escalation.
10. **Provider adapter and sandbox certification** — allowlisted operations, scoped credentials, idempotency, retries, timeouts, webhooks, audit evidence, and fail-closed kill switches.
11. **Commercial and compliance readiness** — contracts, commissions or markups, disclosures, insurance or protection wording, accessibility, consumer law, support ownership, SLAs, and incident response.
12. **Controlled launch** — isolated Preview acceptance, sandbox evidence, limited pilot, observability, rollback, independent release review, and a separate Production decision.

## Current phase evidence

- Phase 1 software, private publication, isolated Preview deployment, and browser acceptance are complete. Its boundary is recorded in `docs/CAR_RENTALS_PHASE_1.md`, and its Preview evidence is recorded in `docs/CAR_RENTALS_PHASE_1_PREVIEW_EVIDENCE_2026-08-19.md`.
- Phase 2 introduces the protected, read-only supplier-readiness workspace. Its software and release boundaries are recorded in `docs/CAR_RENTALS_PHASE_2.md`, and its Preview evidence is recorded in `docs/CAR_RENTALS_PHASE_2_PREVIEW_EVIDENCE_2026-08-20.md`.
- Phase 2 commit, private publication, isolated Preview deployment, and authenticated browser acceptance are complete. Named-provider research, supplier contact, accounts, contracts, credentials, traffic, reservations, payments, and Production remain pending.

## Overall completion model

- Phase completion proves only the software and evidence explicitly listed for that phase.
- No phase may infer a supplier relationship, live rate, vehicle availability, total price, driver eligibility, protection coverage, confirmed reservation, payment authority, or Production readiness.
- Supplier research, contact, account creation, contract acceptance, credential receipt, payment, deployment, migration, Preview release, and Production release each require their own explicit approval boundary.
- The package is commercially complete only after all 12 phases, supplier sandbox certification, operational acceptance, legal and payment approvals, controlled-pilot evidence, and a separate Production launch decision are complete.

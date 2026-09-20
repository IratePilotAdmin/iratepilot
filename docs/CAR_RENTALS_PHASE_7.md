# iRatePilot Car Rentals — Phase 7 Reservation Lifecycle Safety

Prepared: August 20, 2026

Status: **Software, private publication, isolated Preview deployment, and authenticated browser acceptance complete; evidence publication is approved and every external-action gate remains pending**

## Purpose

Phase 7 defines provider-neutral contracts for create, confirm, modify, cancel, no-show, pickup, extension, early return, late return, refund, and supplier-reference reconciliation. It validates sanitized or synthetic append-only records only. It cannot contact a supplier, create or change a live reservation, confirm pickup or return, issue a refund, move money, accept credentials, make an external request, deploy software, migrate data, or change Production.

## Reservation lifecycle contracts

The contract covers all eleven Phase 7 roadmap areas:

1. Create intent — one stable lifecycle and quote identity moving from planning to confirmation pending.
2. Confirmation evidence — explicit recorded, rejected, or manual-review outcomes plus sanitized reference reconciliation.
3. Modification — append-only events with unique identities and request fingerprints rather than mutation of prior facts.
4. Cancellation — controlled terminal transitions from pending, confirmed, or modified states.
5. No-show — controlled terminal handling without inferring charges, liability, or refund rights.
6. Pickup — an exact ordered transition from confirmed or modified to picked up without identity or vehicle-condition claims.
7. Extension — recorded, rejected, or manual-review handling from a picked-up or extended state.
8. Early return — a terminal outcome from picked-up or extended without vehicle-return, condition, charge, or refund claims.
9. Late return — a terminal outcome from picked-up or extended without estimating fees or policy consequences.
10. Refund — positive integer-minor-unit synthetic evidence bounded by the refundable total without money movement.
11. Supplier-reference reconciliation — digest-only not-available, pending, matched, mismatched, or manual-review evidence with no raw reference.

## Fail-closed behavior

- Blank or malformed lifecycle IDs, quote IDs, fingerprints, currencies, amounts, states, event IDs, outcomes, timestamps, or reconciliation evidence are rejected.
- The event timeline contains one through 32 events with unique event IDs, unique request fingerprints, and strictly increasing exact UTC instants.
- Every event from-state must match the calculated current state.
- Recorded events must follow the explicit transition map; rejected or manual-review events cannot change state and require a sanitized reason code.
- Cancellation, no-show, early return, late return, and refund states remain terminal for unsupported later operations.
- A recorded refund must use positive integer minor units and cannot exceed the refundable total.
- Recorded-field inventory must exactly match the minimized allowlist and reject duplicates, unsupported fields, traveler data, license data, payment data, credentials, or raw supplier references.
- Reference reconciliation uses lowercase digests only, preserves pending or mismatch states, and cannot precede the final event.
- A recorded confirmation requires explicit reference-reconciliation evidence, while only a valid matched digest satisfies the local contract check.
- A complete synthetic timeline remains non-transactional and cannot prove supplier confirmation, vehicle pickup or return, cancellation, refund, or payment.
- Completing every Phase 7 review gate completes only a contract review.

The model always reports the following as false:

- supplier contact authorized;
- provider mapping created;
- credential acceptance authorized;
- sandbox traffic authorized;
- Production traffic authorized;
- reservation create authorized;
- reservation confirmation authorized;
- reservation modification authorized;
- reservation cancellation authorized;
- refund authorized; and
- payment authorized.

## Software gates

- [x] Define the eleven provider-neutral reservation-lifecycle contracts required by the package roadmap.
- [x] Define controlled lifecycle states, event kinds, recorded, rejected, and manual-review outcomes, and reference-reconciliation states.
- [x] Define twelve independently owned review gates that start incomplete.
- [x] Add a pure local append-only validator for transitions, event identity, request binding, exact UTC ordering, refund bounds, field minimization, and reference reconciliation.
- [x] Add three sanitized fixtures for confirmed, cancelled-and-refunded, and modified-pickup-extension-late-return timelines.
- [x] Reject malformed, duplicate, out-of-order, unsupported, excessive, prohibited, mismatched, and internally inconsistent evidence.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 6, Phase 5, Phase 4, Phase 3, and Phase 2 references.
- [x] Pass 13 focused tests, ESLint, TypeScript, 1,164 tests across 255 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 7 software and documentation after separate approval at `ea22b4c933f68e6d5a6c7b9cbddd79b02c29eacd`.
- [x] Reconcile and push the approved private branch without force-push after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval as `dpl_Dnxb9YWJgszvXpAiz9kzTwT7a9zu`.
- [x] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier research and contact separately.
- [ ] Approve contracts, content and booking rights, account creation, credential receipt, provider mapping, and isolated sandbox verification separately.
- [ ] Certify live create, confirmation, modification, cancellation, no-show, pickup, extension, return, refund, supplier-reference, webhook, support, and audit behavior separately.
- [ ] Approve payment, legal, privacy, accessibility, fraud, dispute, incident, migration, deployment, and Production decisions through their own later gates.

No release, supplier, reservation, refund, payment, migration, deployment, or Production authority is created by this document.

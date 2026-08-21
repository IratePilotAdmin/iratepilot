# iRatePilot Car Rentals — Phase 5 Quote and Reprice Safety

Prepared: August 20, 2026

Status: **Software, private publication, isolated Preview deployment, and authenticated browser acceptance complete; evidence publication and every external-action gate remain pending**

## Purpose

Phase 5 defines a provider-neutral safety contract for immutable car-rental quote versions, expiry, availability rechecks, exact repricing, traveler price-change consent, policy snapshots, supersession, and no-guarantee handling. It validates sanitized or synthetic records only. It does not ingest or reprice a supplier quote, contact a supplier, accept credentials, make an external request, capture live consent, reserve a vehicle, authorize payment, deploy software, migrate data, or change Production.

## Quote and reprice contracts

The contract covers all ten Phase 5 safety areas:

1. Quote identity — a stable opaque ID, positive version, and exact issue time.
2. Search-request fingerprint — one lowercase 64-character digest that binds a quote to its original search without retaining traveler or provider data.
3. Expiry — exact UTC issue, expiry, reprice, and observation instants with strict ordering and boundary rejection.
4. Availability recheck — explicit not-checked, available, unavailable, or unknown state with bounded evidence for checked outcomes.
5. Exact reprice — one three-letter currency and non-negative integer minor-unit original and repriced totals.
6. Price-change classification — exact unchanged, decrease, or increase calculation without tolerance or hidden adjustment.
7. Price-change consent — explicit increase-consent states bound to the exact repriced total and quote window.
8. Policy snapshot — immutable snapshot identity, digest, capture time, change state, and disclosure when changed or unknown.
9. Supersession — append-only quote versions with one distinct predecessor for every version after the first.
10. No-guarantee handling — a mandatory disclosure that price, availability, vehicle class, and policies require fresh supplier confirmation.

## Fail-closed behavior

- Blank or malformed quote IDs, versions, request fingerprints, policy IDs, digests, currencies, totals, or timestamps are rejected.
- Quote issue, availability check, policy capture, reprice, consent, observation, and expiry use exact UTC instants with deterministic ordering.
- Observation at or after expiry is stale, and an expired quote cannot be revived by a newer observation or mutable field.
- Availability remains unconfirmed unless the explicit state is `available`; unchecked or unknown evidence is preserved rather than inferred.
- Price direction is derived from exact integer minor-unit totals and must equal the declared classification.
- A price increase requires explicit consent; accepted consent must match the exact repriced total and occur after reprice but before observation and expiry.
- Changed or unknown policy state requires a traveler disclosure and cannot become silent policy acceptance.
- Supersession preserves append-only lineage and cannot mutate an earlier quote or create availability.
- A complete local record remains non-guaranteed and non-transactional.
- Completing every Phase 5 review gate completes only a contract review.

The model always reports the following as false:

- supplier quote ingested;
- provider mapping created;
- live availability recheck authorized;
- live reprice authorized;
- price-consent capture authorized;
- policy acceptance authorized;
- credential acceptance authorized;
- sandbox traffic authorized;
- Production traffic authorized;
- reservation authorized; and
- payment authorized.

## Software gates

- [x] Define the ten provider-neutral quote and reprice contracts required by the package roadmap.
- [x] Define controlled availability, price-change, consent, and policy-change states with explicit incomplete or unknown outcomes.
- [x] Define twelve independently owned contract-review gates that start incomplete.
- [x] Add a pure local validator for immutable identity, request binding, expiry, availability evidence, exact repricing, price-change consent, policy snapshots, supersession, and no-guarantee disclosure.
- [x] Validate sanitized or synthetic records without network access, credentials, personal data, provider data, supplier claims, or external effects.
- [x] Reject malformed, stale, out-of-order, unconfirmed, mismatched, unsupported, and internally inconsistent quote or reprice facts.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 4, Phase 3, and Phase 2 references.
- [x] Pass focused tests, ESLint, TypeScript, 1,139 tests across 253 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 5 software and documentation after separate approval at `dfa2556950ee77871498e7046362290b4f43e906`.
- [x] Reconcile and push the approved private branch without force-push after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval as `dpl_13g9pq1jyjBGShbf2xCFjbRnmZRN`.
- [x] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier research and contact separately.
- [ ] Approve contracts, content rights, account creation, credential receipt, and named-provider mapping separately.
- [ ] Authorize isolated sandbox quote, availability, and reprice traffic only after separate approval.
- [ ] Certify live availability, exact price-change consent, policy disclosure and acceptance, privacy, monitoring, incident response, and audit evidence in later package phases.
- [ ] Approve reservations, payments, migrations, deployment, and Production through their own later gates.

No release or external authority is created by this document.

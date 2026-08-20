# iRatePilot Car Rentals — Phase 4 Total Price and Policy Model

Prepared: August 20, 2026

Status: **Software, private publication, isolated Preview deployment, and authenticated browser acceptance complete; evidence publication and every external-action gate remain pending**

## Purpose

Phase 4 defines a provider-neutral canonical contract for car-rental total pricing and policy disclosure. It allows iRatePilot to validate sanitized or synthetic price composition and policy facts consistently before any provider mapping, supplier quote ingest, credential receipt, external traffic, live price, policy acceptance, reservation, payment, deployment, or Production authority exists.

## Pricing and policy contracts

The contract covers all ten Phase 4 roadmap areas:

1. Base rate — exactly one non-negative line in integer minor units with an explicit rental duration.
2. Taxes — separate named lines, including an explicit zero-value line in sanitized fixtures when no tax applies.
3. Mandatory fees — every unavoidable fee is separate and included in the advertised total.
4. One-way fee — exactly one explicit line for a one-way trip, including zero when applicable, and none for a same-location return.
5. Airport surcharge — exactly one explicit line when pickup or return is at an airport, including zero when applicable, and none for non-airport rentals.
6. Mileage — unlimited, limited, or unknown; limited mileage requires distance, unit, and excess-rate terms.
7. Fuel or charging — a controlled return policy plus a non-empty traveler disclosure without estimating an unknown future charge.
8. Deposit or authorization hold — known or unknown, kept outside the rental total, with amount, due point, refundability, and disclosure required when known.
9. Protection products — included, selected, optional, or declined, with exact price-line linkage only for included or selected products.
10. Exclusions — unique, categorized, plain-language disclosures for known amounts or events outside the total.

## Fail-closed behavior

- Currency amounts use non-negative integer minor units; floating-point prices are rejected.
- The advertised total must equal the exact sum of included line items.
- Mandatory price lines cannot be hidden outside the advertised total.
- Route and airport surcharge lines must match the rental context.
- Deposits remain separate from the rental total and unknown deposits cannot acquire inferred terms.
- Optional or declined protection products cannot be priced as selected.
- Product names and prices never establish insurance status, coverage, eligibility, or legal advice.
- Completing every Phase 4 review gate completes only a contract review. It never creates a supplier quote, provider mapping, live price, accepted policy, reservation, payment, or traffic authority.

The model always reports the following as false:

- supplier quote ingested;
- provider mapping created;
- live total price available;
- policy acceptance authorized;
- credential acceptance authorized;
- sandbox traffic authorized;
- Production traffic authorized;
- reservation authorized; and
- payment authorized.

## Software gates

- [x] Define the ten provider-neutral pricing and policy contracts required by the package roadmap.
- [x] Define controlled line-item, trip, mileage, fuel or charging, deposit, protection, and exclusion vocabularies with explicit unknown states where needed.
- [x] Define twelve independently owned contract-review gates that start incomplete.
- [x] Use exact integer minor-unit arithmetic and require total reconciliation.
- [x] Validate complete synthetic records without network, credentials, personal data, provider data, or supplier claims.
- [x] Reject malformed, incomplete, hidden, duplicate, mismatched, unsupported, and internally inconsistent pricing or policy facts.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 3 and Phase 2 references.
- [x] Pass focused tests, ESLint, TypeScript, 1,128 tests across 252 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 4 software and documentation after separate approval at `989b27935a0fd3923a20a7f975159b7aa910cc62`.
- [x] Reconcile and push the approved private branch without force-push after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval as `dpl_8YwNVxQtgbZcCksVw2uGAM8jjJBP`.
- [x] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier research and contact separately.
- [ ] Approve contracts, content rights, account creation, and credential receipt separately.
- [ ] Build a named-provider pricing mapping only after separate technical and commercial approval.
- [ ] Authorize isolated sandbox traffic and supplier-quote ingest only after separate approval.
- [ ] Certify live total pricing, policies, repricing, reservations, payments, privacy, operations, and security in later package phases.
- [ ] Make a separate Production decision.

The isolated Preview acceptance evidence is recorded in `docs/CAR_RENTALS_PHASE_4_PREVIEW_EVIDENCE_2026-08-20.md`. No external activation is authorized by this document.

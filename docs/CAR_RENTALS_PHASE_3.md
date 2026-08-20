# iRatePilot Car Rentals — Phase 3 Inventory Normalization

Prepared: August 20, 2026

Status: **Software, private publication, isolated Preview deployment, authenticated browser acceptance, and Preview evidence documentation complete; every external-action gate remains pending**

## Purpose

Phase 3 defines a provider-neutral canonical contract for car-rental inventory. It allows iRatePilot to validate sanitized or synthetic location and vehicle facts consistently before any provider mapping, supplier data ingest, credential receipt, external traffic, live inventory, reservation, payment, deployment, or Production authority exists.

## Normalization contracts

The contract covers eight roadmap areas:

1. Location identity — stable source identity, name, location kind, country code, time zone, and pickup instructions.
2. Opening hours and access — all seven local days with explicit open, closed, or unknown states.
3. Vehicle-class equivalency — source code to the existing consumer taxonomy with mapping evidence and no make-or-model guarantee.
4. Capacity — separate non-negative whole-number passenger and luggage values.
5. Transmission — automatic, manual, or unspecified without class-based inference.
6. Fuel or powertrain — combustion, hybrid, plug-in hybrid, electric, or unspecified.
7. Accessibility — confirmed, unavailable, or unknown plus an allowlisted feature vocabulary and supplier-confirmation boundary.
8. Vehicle features — reviewed allowlisted terms with duplicate rejection and class-level versus supplied-vehicle disclosure boundaries.

## Fail-closed behavior

- Missing operating hours remain unknown; they are not converted into open or closed.
- Ambiguous transmission or powertrain values remain unspecified.
- The consumer `electric` vehicle class is not treated as proof of an electric powertrain.
- Accessibility features require an explicit confirmed state and never become a guarantee without supplier confirmation.
- Malformed, incomplete, conflicting, unsupported, or duplicate facts are rejected by a pure local validator.
- Completing every Phase 3 gate completes only a contract review. It never creates a provider mapping or runtime authority.

The model always reports the following as false:

- supplier data ingested;
- provider mapping created;
- live inventory available;
- credential acceptance authorized;
- sandbox traffic authorized;
- Production traffic authorized;
- reservation authorized; and
- payment authorized.

## Software gates

- [x] Define the eight provider-neutral normalization contracts required by the package roadmap.
- [x] Define controlled vocabularies with explicit unknown or unspecified states.
- [x] Define ten independently owned contract-review gates that start incomplete.
- [x] Validate complete synthetic records without network, credentials, personal data, or provider claims.
- [x] Reject malformed, incomplete, conflicting, unsupported, and duplicate inventory facts.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 2 reference.
- [x] Pass focused tests, ESLint, TypeScript, 1,120 tests across 251 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 3 software and documentation after separate approval.
- [x] Reconcile and push the approved private branch without force-push after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier research and contact separately.
- [ ] Approve contracts, content rights, account creation, and credential receipt separately.
- [ ] Build a named-provider mapping only after separate technical and commercial approval.
- [ ] Authorize isolated sandbox traffic and supplier-data ingest only after separate approval.
- [ ] Certify live inventory, pricing, policies, reservations, payments, privacy, accessibility, operations, and security in later package phases.
- [ ] Make a separate Production decision.

The release evidence is recorded in `docs/CAR_RENTALS_PHASE_3_PREVIEW_EVIDENCE_2026-08-20.md`. No external activation is authorized by this document.

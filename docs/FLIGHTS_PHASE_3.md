# iRatePilot Flights — Phase 3

Status: Supplier-selection planning software, Git publication, isolated Preview deployment, and authenticated browser acceptance complete; all external activation gates remain closed

## Purpose

Phase 3 extends the protected `/admin/flights` workspace with a vendor-neutral supplier-selection rubric and a design-only sandbox adapter contract. It prepares a consistent decision process without naming, scoring, shortlisting, approving, or contacting a supplier.

This phase does not select an NDC aggregator, GDS, consolidator, airline, ticketing authority, payment service, or settlement path. It records no candidate, score, evidence, contract, credential, endpoint, or passenger data.

## Selection rubric

The read-only rubric allocates 100 points across seven categories:

- content coverage: 20%;
- shopping quality: 15%;
- ticketing authority: 15%;
- servicing depth: 20%;
- commercial fit: 10%;
- security and privacy: 10%; and
- operational support: 10%.

Weights and diligence questions are planning guidance only. No scoring or ranking storage exists, and the model always reports `not_selected` with zero candidates.

## Sandbox adapter contract

The future provider-neutral boundary is divided into four design-only operations:

- shopping request;
- price confirmation;
- order draft; and
- servicing quote.

These are documentation-level contracts. Phase 3 adds no implementation, API route, server action, provider SDK, database migration, environment variable, secret, network request, webhook, schedule, fare, availability result, order, ticket, payment, settlement, exchange, cancellation, refund, or traveler notification.

## Fail-closed boundary

Eight separately owned decision gates sequence rubric approval, evidence collection, shortlisting, legal authority, security architecture, contract mapping, credential-channel approval, and separate adapter-build authorization.

Even when every planning gate is marked complete in the pure model, all of these remain false:

- supplier selected;
- credentials accepted;
- sandbox adapter implemented;
- sandbox supplier traffic authorized;
- Production supplier traffic authorized;
- ticketing authorized; and
- flight payments authorized.

## Software acceptance gates

- [x] Define a unique 100-point, seven-category supplier-selection rubric.
- [x] Define four inert provider-neutral adapter operations with explicit safety boundaries.
- [x] Define eight separately owned decision gates.
- [x] Prove that completed planning cannot select a supplier or authorize credentials, implementation, traffic, ticketing, or payments.
- [x] Extend the protected administrator workspace without adding a client mutation surface.
- [x] Pass ESLint, TypeScript, 993 tests across 230 files, and the optimized 113-page Next.js build.

## Release gates

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

The isolated Preview deployment and authenticated acceptance evidence are recorded in `docs/FLIGHTS_PHASE_3_PREVIEW_EVIDENCE_2026-08-18.md`.

## External activation gates

- [ ] Approve the selection rubric before evaluating a named supplier.
- [ ] Collect attributable supplier evidence and approve a commercial shortlist.
- [ ] Approve contract, content rights, ticketing authority, accreditation, settlement, liability, and support ownership.
- [ ] Approve passenger-data, credential, webhook, retention, and incident-response architecture.
- [ ] Approve a secure sandbox-only credential channel.
- [ ] Make a separate implementation decision before adding an adapter, persistence, endpoints, secrets, SDKs, or traffic.
- [ ] Make a separate Production decision before enabling airline traffic, ticketing, or flight payments.

Phase 3 software completion is not supplier approval and never authorizes a live flight search or sale.

# iRatePilot Flights — Phase 5

Status: Local evaluation-governance software and repository verification complete; Git and isolated Preview release pending separate approval; all external activation gates remain closed

## Purpose

Phase 5 extends the protected `/admin/flights` workspace with a vendor-neutral evaluation-governance design. It defines the evidence-admissibility rules, reviewer separation, decision-record safeguards, and approval sequence that would be required before a named supplier evaluation could begin.

This phase does not open evidence intake or store a supplier identity, response, document, representation, score, ranking, recommendation, shortlist, contract, credential, endpoint, passenger record, schedule, fare, availability result, order, ticket, or payment.

## Evidence admissibility controls

Six controls define future governance requirements:

- evidence provenance;
- evidence freshness;
- comparable evaluation scope;
- confidentiality and data handling;
- reviewer independence; and
- exception handling.

Each control identifies an accountable owner, a required rule, and an explicit fail-closed boundary. These controls do not create an intake channel, receive material, assign a reviewer, approve an exception, or communicate with a supplier.

## Decision-record safeguards

Five safeguards keep future decisions separate:

- evidence admissibility;
- scoring separation;
- conflicts and reviewer independence;
- exception concurrence; and
- recommendation authority.

The design separates evidence review, scoring, risk exceptions, commercial recommendations, shortlist approval, contracting, supplier selection, implementation, and release. It creates none of those records or authorizations.

## Fail-closed boundary

Ten separately owned evaluation-governance gates sequence policy approval, evidence standards, data handling, reviewer roles, conflicts, comparability, exceptions, decision templates, recommendation boundaries, and a separate named-evaluation authorization.

Even when every governance gate is marked complete in the pure model, all of these remain unchanged:

- evaluation intake: `closed`;
- candidate state: `not_recorded`;
- candidate count: zero;
- evaluation case state: `not_created`;
- evidence item count: zero;
- score state: `not_calculated`;
- recommendation state: `not_issued`;
- shortlist state: `not_created`;
- contract state: `not_received`;
- supplier selection state: `not_selected`;
- credentials accepted: false;
- sandbox adapter implemented: false;
- sandbox supplier traffic authorized: false;
- Production supplier traffic authorized: false;
- ticketing authorized: false; and
- flight payments authorized: false.

Phase 5 adds no client component, form, API route, server action, database migration, environment variable, secret, provider SDK, network request, webhook, external message, or Production configuration.

## Software acceptance gates

- [x] Define six unique evidence-admissibility controls with accountable owners and explicit fail-closed boundaries.
- [x] Define five decision-record safeguards that cannot authorize evaluation or supplier capabilities.
- [x] Define ten separately owned evaluation-governance gates.
- [x] Prove that completed governance cannot open intake, create a candidate or evaluation case, receive evidence, calculate a score, issue a recommendation, create a shortlist, select a supplier, accept credentials, implement an adapter, enable traffic, issue tickets, or authorize payment.
- [x] Extend the protected administrator workspace while preserving the Phase 4, Phase 3, and Phase 2 references.
- [x] Keep the workspace server-rendered, read-only, and free of supplier data, sensitive data, mutations, and network access.
- [x] Pass ESLint, TypeScript, 1,007 tests across 232 files, and the optimized 113-page Next.js build.

## Release gates

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## External activation gates

- [ ] Approve the evaluation policy, evidence standard, handling standard, reviewer roles, conflicts process, comparability method, exception process, decision template, and recommendation boundary.
- [ ] Make a separate named-evaluation decision before recording a candidate or receiving supplier evidence.
- [ ] Receive attributable supplier evidence through an approved business process without credentials or passenger data.
- [ ] Complete the separately owned evidence, commercial, legal, finance, operations, security, privacy, risk, and executive reviews.
- [ ] Make separate shortlist, contract, supplier-selection, credential-channel, implementation, and Production decisions.

Phase 5 software completion is not authorization to evaluate a named supplier, receive supplier material, select a supplier, accept a contract, or enable a live flight search or sale.

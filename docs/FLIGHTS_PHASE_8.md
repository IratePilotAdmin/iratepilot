# iRatePilot Flights — Phase 8

Status: Synthetic rehearsal preflight-design software and repository verification complete; release gates pending

## Purpose

Phase 8 extends the protected `/admin/flights` workspace with the static preflight controls, immediate-stop rules, isolation proof, fictional-fixture manifest, role checks, sanitized evidence schema, and teardown boundary that would be required after a separate Phase 7 authorization and before any future fictional tabletop could be considered.

This phase does not satisfy or record an authorization prerequisite. It does not create or inspect a fictional fixture, name or assign a participant, start preflight, run a scenario, record a result, create a receipt, record a finding, open supplier evaluation intake, contact a supplier, receive supplier material, accept passenger data, store a credential, call an endpoint, display live schedules or fares, issue a ticket, collect payment, or change Production.

## Preflight control artifacts

Seven static controls define the future readiness boundary:

- authorization scope card;
- fictional fixture manifest;
- offline isolation proof;
- role check-in plan;
- scenario control cards;
- sanitized evidence schema; and
- teardown and closeout plan.

Every control has an accountable owner, a future readiness requirement, and an explicit non-execution boundary. The control definitions create no database record, fixture, workflow, form, assignment, upload, message, execution engine, or external effect.

## Immediate-stop safeguards

Five safeguards keep a future preflight fail closed:

- authorization prerequisite lock;
- real-data contamination stop;
- connectivity stop;
- role-conflict stop; and
- evidence and teardown lock.

Missing, expired, ambiguous, contaminated, connected, conflicted, incomplete, or unresolved evidence keeps preflight blocked. No standing, reusable, scheduled, delegated, Sandbox, or Production authorization can be created by this software phase.

## Preflight-readiness gates

Ten separately owned gates cover the Phase 7 prerequisite, authorization scope, fictional-fixture manifest, no-real-data recheck, offline isolation proof, role independence, observer and stop controls, sanitized evidence schema, teardown and closeout, and the separate rehearsal-execution boundary.

Even if every design gate is supplied as complete to the pure model, all of these remain unchanged:

- plan state: `design_only`;
- preflight state: `blocked`;
- authorization prerequisite state: `not_satisfied`;
- authorization reference and scope binding: `not_recorded`;
- fixture manifest and synthetic fixture: `not_created`;
- isolation proof: `not_recorded`;
- role and observer states: `not_assigned`;
- rehearsal state: `not_run`;
- scenario results, receipts, and findings: zero;
- evaluation intake: `closed`;
- candidate and evaluation case: not created;
- score, recommendation, shortlist, contract, and supplier selection: not created or issued;
- real supplier data, passenger data, and credentials accepted: false;
- external network access and external side effects: false;
- Sandbox adapter implemented: false;
- Sandbox and Production supplier traffic authorized: false;
- ticketing authorized: false; and
- flight payments authorized: false.

Phase 8 adds no client component, form, route handler, server action, database migration, environment variable, secret, provider SDK, network request, webhook, scheduled job, external message, or Production configuration.

## Software acceptance gates

- [x] Define seven unique preflight-control artifacts with accountable owners and explicit non-execution boundaries.
- [x] Define five unique immediate-stop safeguards for authorization, contamination, connectivity, role conflicts, evidence, and teardown.
- [x] Define ten separately owned preflight-readiness gates.
- [x] Prove that completed design gates cannot satisfy authorization, start preflight, create a fixture, assign roles, run a rehearsal, record results or findings, open intake, accept data or credentials, enable external effects, authorize traffic, issue tickets, or authorize payment.
- [x] Extend the protected administrator workspace while preserving the Phase 7 through Phase 2 references.
- [x] Keep the workspace server-rendered, read-only, and free of supplier data, passenger data, participant data, sensitive data, mutations, and network access.
- [x] Pass ESLint, TypeScript, 1,028 tests across 235 files, and the optimized 113-page Next.js build.

## Release gates

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## Preflight decision gates

- [ ] Satisfy the separately controlled Phase 7 authorization prerequisite through accountable internal processes.
- [ ] Approve the authorization scope, fictional-fixture manifest, no-real-data recheck, offline isolation proof, independent-role plan, observer controls, sanitized evidence schema, and teardown plan.
- [ ] Make a separate action-time decision before creating any fictional fixture, assigning any participant, or starting any rehearsal activity.
- [ ] Record only sanitized results and resolve every finding without opening named supplier evaluation intake.

## External activation gates

- [ ] Make a separate named-evaluation decision before recording a candidate or receiving supplier evidence.
- [ ] Complete separately owned commercial, legal, finance, operations, security, privacy, risk, support, data, settlement, fraud, servicing, and executive reviews.
- [ ] Make separate shortlist, contract, supplier-selection, credential-channel, implementation, Sandbox, ticketing, payment, and Production decisions.

Phase 8 software completion is not authorization to satisfy preflight, create or run a rehearsal, evaluate a named supplier, receive supplier material, select a supplier, accept a contract, enable a live flight search, issue a ticket, or collect payment.

The Phase 7 rehearsal-authorization readiness boundary remains recorded in `docs/FLIGHTS_PHASE_7.md`.

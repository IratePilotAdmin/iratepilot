# iRatePilot Flights — Phase 9

Status: Synthetic rehearsal execution-control design software and repository verification complete; release gates pending

## Purpose

Phase 9 extends the protected `/admin/flights` workspace with the static entry, one-scenario-at-a-time release, observer checkpoint, immediate-stop, sanitized-observation, evidence-quarantine, teardown, and closeout controls that a future fictional tabletop would require after separately satisfying both the Phase 7 authorization and Phase 8 preflight prerequisites.

This phase does not satisfy or record either prerequisite. It does not create an execution decision or window, bind a scope, create or inspect a fixture, name or assign a participant, release or run a scenario, record an observation or result, create a receipt, record or close a finding, start teardown, create closeout, open supplier evaluation intake, contact a supplier, receive supplier material, accept passenger data, store a credential, call an endpoint, display live schedules or fares, issue a ticket, collect payment, or change Production.

## Controlled rehearsal stages

Six static stages define the future run-control boundary:

- entry checkpoint;
- scenario release card;
- observer checkpoint ledger;
- immediate-stop protocol;
- sanitized observation protocol; and
- teardown and closeout checkpoint.

Every stage has an accountable owner, a future control requirement, and an explicit non-execution boundary. The stage definitions create no database record, authorization, preflight approval, fixture, workflow, form, assignment, upload, message, execution engine, observation, or external effect.

## Pause-and-abort safeguards

Five safeguards keep a future fictional rehearsal fail closed:

- no-implicit-start lock;
- one-scenario-at-a-time lock;
- observer-veto lock;
- evidence-quarantine lock; and
- abort-and-no-restart lock.

Missing, expired, ambiguous, reusable, out-of-scope, parallel, automatic, unobserved, contaminated, connected, conflicted, aborted, incomplete, or unresolved evidence keeps the execution window closed. No standing, reusable, scheduled, delegated, Sandbox, or Production authority can be created by this software phase.

## Execution-control gates

Ten separately owned gates cover the Phase 7 authorization prerequisite, Phase 8 preflight prerequisite, one-time scope and expiration, fictional fixture and deletion plan, independent roles and observer authority, offline isolation, scenario sequence and stop triggers, sanitized observations, abort and teardown closeout, and the separate action-time start decision.

Even if every design gate is supplied as complete to the pure model, all of these remain unchanged:

- plan state: `design_only`;
- execution-control state: `blocked`;
- authorization and preflight prerequisite states: `not_satisfied`;
- execution decision and scope binding: `not_recorded`;
- execution window: `not_opened`;
- fixture manifest and synthetic fixture: `not_created`;
- isolation proof: `not_recorded`;
- role and observer states: `not_assigned`;
- rehearsal state: `not_run`;
- released scenarios, results, observations, receipts, and findings: zero or not created;
- teardown: `not_started`;
- closeout: `not_created`;
- evaluation intake: `closed`;
- candidate and evaluation case: not created;
- score, recommendation, shortlist, contract, and supplier selection: not created or issued;
- real supplier data, passenger data, and credentials accepted: false;
- external network access and external side effects: false;
- Sandbox adapter implemented: false;
- Sandbox and Production supplier traffic authorized: false;
- ticketing authorized: false; and
- flight payments authorized: false.

Phase 9 adds no client component, form, route handler, server action, database migration, environment variable, secret, provider SDK, network request, webhook, scheduled job, external message, or Production configuration.

## Software acceptance gates

- [x] Define six unique execution-control stages with accountable owners and explicit non-execution boundaries.
- [x] Define five unique pause-and-abort safeguards for start authority, sequencing, observer veto, evidence quarantine, abort, and restart.
- [x] Define ten separately owned execution-control gates.
- [x] Prove that completed design gates cannot satisfy authorization or preflight, open an execution window, create a fixture, assign roles, release a scenario, run a rehearsal, record observations, results, receipts, or findings, open intake, accept data or credentials, enable external effects, authorize traffic, issue tickets, or authorize payment.
- [x] Extend the protected administrator workspace while preserving the Phase 8 through Phase 2 references.
- [x] Keep the workspace server-rendered, read-only, and free of supplier data, passenger data, participant data, sensitive data, mutations, and network access.
- [x] Pass ESLint, TypeScript, 1,034 tests across 236 files, and the optimized 113-page Next.js build.

## Release gates

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## Execution-control decision gates

- [ ] Satisfy the separately controlled Phase 7 authorization prerequisite through accountable internal processes.
- [ ] Satisfy the separately controlled Phase 8 preflight prerequisite through accountable internal processes.
- [ ] Approve the one-time scope, fictional-fixture and deletion plan, independent-role and observer controls, offline isolation, one-scenario-at-a-time sequence, sanitized observation schema, abort response, teardown, and closeout.
- [ ] Make a separate action-time decision before opening an execution window, creating any fictional fixture, assigning any participant, or releasing one scenario.
- [ ] Stop immediately on any prerequisite, scope, contamination, connectivity, role, observer, evidence, sequence, teardown, or closeout failure; require a new authorization and preflight cycle before any restart could be considered.

## External activation gates

- [ ] Make a separate named-evaluation decision before recording a candidate or receiving supplier evidence.
- [ ] Complete separately owned commercial, legal, finance, operations, security, privacy, risk, support, data, settlement, fraud, servicing, and executive reviews.
- [ ] Make separate shortlist, contract, supplier-selection, credential-channel, implementation, Sandbox, ticketing, payment, and Production decisions.

Phase 9 software completion is not authorization to satisfy authorization or preflight, create or run a rehearsal, evaluate a named supplier, receive supplier material, select a supplier, accept a contract, enable a live flight search, issue a ticket, or collect payment.

The Phase 8 synthetic preflight-design boundary remains recorded in `docs/FLIGHTS_PHASE_8.md`.

# iRatePilot Flights — Phase 12

Status: Supplier-evaluation intake preflight design repository-verified, Git-published, deployed, and authenticated browser-accepted in isolated Preview; action-time decision gates pending

## Purpose

Phase 12 extends the protected `/admin/flights` workspace with a static, candidate-neutral preflight boundary for a future supplier-evaluation intake. It defines what would have to be rechecked immediately before any separately authorized intake-opening decision could be considered.

Phase 11 software is repository-verified, Git-published, deployed, and authenticated browser-accepted in isolated Preview. That proves the protected software surface works; it does not create an actual intake-opening authorization. No separately approved Phase 11 authorization reference exists, so the Phase 12 prerequisite remains unsatisfied and preflight remains blocked.

This phase does not authorize intake, contact a supplier, identify or create a candidate, create an evaluation case or submission channel, receive or store supplier material, assign a reviewer or observer, resolve a conflict, open an authorization window, score or recommend a supplier, create a shortlist, receive a contract, select a supplier, accept passenger data, store a credential, call an endpoint, display live schedules or fares, issue a ticket, collect payment, or change Production.

## Intake preflight control artifacts

Seven static controls define the future preflight boundary:

- Phase 11 authorization reference;
- candidate-neutral scope recheck;
- contact and identity boundary;
- submission-channel isolation proof;
- evidence taxonomy and prohibited-data manifest;
- independent-role and conflict check-in; and
- stop, revocation, expiry, and closeout plan.

Every control has an accountable owner, a future preflight requirement, and an explicit non-opening boundary. The definitions create no authorization, database record, supplier identity, candidate, evaluation case, form, upload, mailbox, storage path, role assignment, message, decision, approval, credential, request, response, or external effect.

## Immediate-stop intake safeguards

Five safeguards keep a future intake preflight fail closed:

- authorization-prerequisite lock;
- identity and contact stop;
- channel and data-contamination stop;
- role, conflict, and dissent stop; and
- evidence closeout and no-release lock.

Missing, inferred, expired, disputed, reused, broadened, conflicted, unallowlisted, contaminated, incomplete, or out-of-scope authority or evidence keeps preflight blocked and intake closed. No design, commit, deployment, page view, browser acceptance, future preflight, or future intake decision can create standing, reusable, delegated, scoring, selection, commercial, implementation, Sandbox, ticketing, payment, or Production authority.

## Intake-preflight gates

Ten separately owned gates cover the actual Phase 11 authorization prerequisite, one-time scope and expiry, candidate neutrality, contact and identity controls, submission-channel isolation, evidence taxonomy and prohibited data, independent roles and conflicts, stop and quarantine controls, retention and closeout, and a separate action-time intake-opening decision.

Even if every design gate is supplied as complete to the pure model, all of these remain unchanged:

- plan state: `design_only`;
- preflight state: `blocked`;
- Phase 11 authorization prerequisite: `not_satisfied`;
- Phase 11 software acceptance: `accepted_in_preview`;
- authorization reference and scope binding: `not_recorded`;
- candidate-neutrality and conflict checks: `not_started`;
- contact plan, evidence taxonomy, stop plan, and closeout plan: `not_approved`;
- submission channel and evaluation case: `not_created`;
- isolation proof: `not_recorded`;
- reviewer and observer: `not_assigned`;
- evaluation intake: `closed`;
- supplier contact: `not_started`;
- candidate: `not_recorded`;
- supplier evidence count: zero;
- authorization window: `not_opened`;
- score, recommendation, shortlist, contract, and supplier selection: not created, received, issued, or selected;
- real supplier data, passenger data, and credentials accepted: false;
- external network access and external side effects: false;
- Sandbox adapter implemented: false;
- Sandbox and Production supplier traffic authorized: false;
- ticketing authorized: false; and
- flight payments authorized: false.

Phase 12 adds no client component, form, route handler, server action, database migration, environment variable, secret, provider SDK, network request, webhook, scheduled job, external message, upload, mailbox, storage path, supplier identity, or Production configuration.

## Software acceptance gates

- [x] Define seven unique intake-preflight controls with accountable owners and explicit non-opening boundaries.
- [x] Define five unique immediate-stop safeguards for missing authority, supplier identity and contact, channel or data contamination, role conflicts and dissent, incomplete closeout, and downstream release.
- [x] Define ten separately owned intake-preflight gates.
- [x] Prove that completed design gates cannot create Phase 11 authorization, open preflight or intake, contact a supplier, create a candidate or case, create a channel, receive evidence, assign a reviewer, open an authorization window, score or select a supplier, accept data or credentials, enable external effects, authorize traffic, issue tickets, or authorize payment.
- [x] Extend the protected administrator workspace while preserving the Phase 11 through Phase 2 references.
- [x] Keep the workspace server-rendered, read-only, and free of supplier identities, supplier data, passenger data, reviewer identities, sensitive data, mutations, uploads, storage, and network access.
- [x] Pass ESLint, TypeScript, 1,052 tests across 239 files, and the optimized 113-page Next.js build.

## Release gates

- [x] Commit and push the approved laptop changes at `44c3d2c` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## Intake-preflight decision gates

- [ ] Create and separately approve an actual, current, one-time Phase 11 intake-opening authorization only after every prerequisite and accountable review is satisfied.
- [ ] Bind the permitted supplier path, objective candidate-neutral eligibility, exclusions, evidence classes, owners, duration, expiry, revocation, and no-selection boundary.
- [ ] Approve the future contact owner, message, channel, disclosure, identity-minimization rule, jurisdiction, stop condition, and no-commercial-commitment statement.
- [ ] Approve action-time isolation proof, minimal evidence taxonomy, prohibited-data rules, least-privilege access, sanitation, malware, logging, retention, deletion, incident, and privacy controls.
- [ ] Confirm independent reviewer and observer roles, conflicts, recusals, replacements, dissent, exceptions, escalation, stop, revocation, quarantine, closeout, no-restart, and no-downstream-authority controls.
- [ ] Make a new, one-time, scoped, expiring, revocable action-time decision outside this preflight immediately before intake could open.

## External activation gates

- [ ] Make a separate decision before identifying, contacting, inviting, or recording any supplier or receiving any supplier material.
- [ ] Complete separately owned evidence review, scoring, recommendation, shortlist, commercial, legal, finance, operations, security, privacy, risk, support, data, settlement, fraud, servicing, and executive decisions.
- [ ] Make separate contract, supplier-selection, credential-channel, implementation, Sandbox, ticketing, payment, and Production decisions.

Phase 12 software completion would not be evidence that a Phase 11 authorization exists and would not authorize supplier evaluation intake, supplier contact, evidence receipt, scoring, supplier selection, live flight search, ticketing, payment, or Production traffic.

The Phase 11 supplier-evaluation intake authorization and non-opening boundary remains recorded in `docs/FLIGHTS_PHASE_11.md`. Its isolated Preview acceptance evidence remains recorded in `docs/FLIGHTS_PHASE_11_PREVIEW_EVIDENCE_2026-08-19.md`. The Phase 12 isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_12_PREVIEW_EVIDENCE_2026-08-19.md`.

# Roadmap and completion status

Last reviewed: 2026-08-19

iRatePilot is application-ready for a controlled private-pilot preview. It is not yet commercially complete: real inventory, public booking, live payments, partner payouts, and supplier traffic remain behind explicit release gates.

Flights Phases 1–21 are repository-verified, Git-published, deployed, and accepted in isolated Preview. No provider contact or Production action is authorized.

## Phase 1 — Curated inventory and lead capture

Status: **application and Preview baseline complete; first real pilot activation pending**

Completed in the repository:

- Public hotel and vacation-home discovery with clearly separated approved and demonstration inventory.
- Functional destination/date search, price and star filters, and result sorting.
- Source-aware property, room, rate, availability, rating, and booking disclosures.
- Contact and partner-application flows backed by Supabase when an authorized environment is configured.
- A shareable hotel-manager intake at `/hotel-intake` that collects verification-ready details without requesting credentials, guest data, government IDs, or payment information.
- Admin verification that requires an explicit authority/content review, matches the manager's registered business email, and creates one inactive property draft without publishing it.
- Draft property, room, rate, future-inventory, partner-review, and scoped manager workflows.

Verified Preview gates:

- [x] Configure and verify the isolated Supabase Preview environment.
- [x] Run the network-free commercial sandbox preflight and Preview acceptance checks.
- [x] Record repository migrations through `202608170063` and reconcile the corresponding Preview database contracts without changing migration history.
- [x] Submit, inspect, and remove a clearly labelled synthetic hotel intake while confirming that it remained pending and created no property.

Remaining activation gates:

- [ ] Complete the first real pilot-hotel intake from information supplied by an authorized representative and keep its draft inactive until separately approved.
- [x] Verify contact and partner-application submissions, support routing, and transactional email in Preview. Both labelled fixtures were removed after review; the single email job was provider-accepted in one attempt with no persisted error.
- [ ] Have a verified pilot partner exercise the scoped portal workflows and approve the operator experience.

The recorded Preview baseline is in `docs/PREVIEW_PILOT_EVIDENCE_2026-08-17.md`.

## Phase 2 — Live booking and payments

Status: **software, Stripe Sandbox acceptance, and linked Preview ledger reconciliation complete; external release approvals pending**

The repository includes booking requests, approved-reservation checkout, Stripe test and live-mode guards, refunds, webhook reconciliation, and payout controls. Public booking and live money movement must remain disabled until supplier, Stripe, legal, support, and end-to-end sandbox evidence is approved.

Verified software gates:

- [x] Fail closed when test/live payment flags or Stripe key modes conflict.
- [x] Revalidate approved reservations before idempotent PaymentIntent creation and finalization.
- [x] Verify webhook signatures and deduplicate or safely retry financial events.
- [x] Reconcile refunds, transfer failures, reversals, and refunded-before-transfer outcomes.
- [x] Expose an admin-only read-only audit that separates test readiness, production configuration, and production authorization.

Remaining activation gates:

- [x] Verify approved Stripe test credentials and one valid signed webhook delivery in Preview. The app reports 10/10 test safeguards, and Stripe Sandbox received HTTP 200 from the stable protected Preview webhook through the approved bypass.
- [x] Complete success, decline, 3DS, duplicate/out-of-order webhook, refund, transfer, and reversal scenarios in the Stripe sandbox. All fresh signed deliveries reached the stable Preview endpoint with HTTP 200 in test mode; the transfer retry and full reversal were confirmed in Stripe Sandbox.
- [x] Reconcile sanitized Stripe evidence against booking and financial ledgers. One inactive USD 25.00 Preview fixture links the same test PaymentIntent across the signed webhook, confirmed booking, and eligible financial row; no transfer, payout, or email job was created.
- [ ] Obtain hotel, Stripe, supplier, legal, support, and production-release approvals.

The recorded software evidence is in `docs/PAYMENT_PHASE_EVIDENCE_2026-08-17.md`.

Required external gates are maintained in `docs/DEPLOYMENT.md`, `docs/PAYMENTS.md`, and `docs/COMMERCIAL_SANDBOX_TEST_PLAN.md`.

## Phase 3 — Partner portal and revenue tools

Status: **software and private-pilot progress model complete; verified partner acceptance pending**

The partner portal includes onboarding, properties, rooms, rates, inventory, reservations, promotions, analytics, finance, messaging, team access, subscription controls, PMS preparation, and revenue recommendations. Completion requires a verified pilot partner to exercise these workflows in preview and approve the operator experience.

Verified software gates:

- [x] Scope partner and delegated-manager access to authorized hotel organizations.
- [x] Support complete inactive property content, room, rate, and future-inventory preparation.
- [x] Keep publication, payout, invitation, billing, deletion, and supplier activation outside delegated-manager scope.
- [x] Separate 100% private-pilot preparation from publication and payout activation.
- [x] Preserve reservation, messaging, finance, analytics, promotion, subscription, and integration-preparation surfaces.

Remaining acceptance gates:

- [ ] Have a verified pilot partner exercise the portal in Preview.
- [ ] Record operator feedback and the partner's acceptance decision.
- [ ] Resolve any acceptance findings without enabling publication, payouts, or supplier traffic.

The recorded software evidence is in `docs/PARTNER_PORTAL_PHASE_EVIDENCE_2026-08-17.md`.

## Phase 4 — Broader supplier connectivity

Status: **software framework and read-only certification audit complete; vendor certification pending**

The repository includes guarded supplier adapters, PMS credential storage, readiness checks, SynXis certification evidence, and production-traffic authorization. No live supplier traffic is authorized. Completion depends on vendor-issued credentials, approved endpoint mappings, sandbox certification, operational support contacts, and a separate production activation decision.

Verified software gates:

- [x] Cover all 22 registered PMS providers with unique strict production launch manifests.
- [x] Keep configuration and credential values server-side while reporting only missing or invalid key names.
- [x] Require ordered vendor approval, verified activation details, property mapping, sandbox, webhook, and production test-property evidence.
- [x] Fail closed at the independent SynXis certification, production-smoke, and live-traffic runtime gates.
- [x] Expose a read-only operator summary that separates software coverage from external certification and cannot authorize traffic.

Remaining certification and activation gates:

- [ ] Select the first real pilot hotel's authorized PMS/CRS integration path and obtain vendor approval.
- [ ] Receive vendor-issued Preview/sandbox credentials, approved endpoints, property mappings, and support contacts.
- [ ] Complete the vendor's sandbox certification scenarios and validate signed or authenticated webhooks where supported.
- [ ] Complete a controlled production test-property smoke test with recorded evidence and rollback support.
- [ ] Make a separate production decision before enabling any real-property supplier traffic.

The recorded software evidence is in `docs/SUPPLIER_PHASE_EVIDENCE_2026-08-17.md`.

## Phase 5 — Automation Operations Center

Status: **Phases 1–5 accepted in isolated Preview and Git-published; optional locked synthetic check awaits a third administrator and separate approval**

Phase 1 adds an admin-only, read-only command center over existing iRatePilot operational ledgers. Phase 2 adds bounded runbooks and accountable incident coordination. Phase 3 adds an idempotent, dual-approved retry rehearsal. Phase 4 adds fixed SLO policies and internal escalation ownership. Phase 5 adds one doubly locked, internal read-only email receipt adapter with no network access or external side effects.

Phase 1 software gates:

- [x] Add the `/admin/operations` surface and admin navigation entry.
- [x] Require administrator authorization before service-role ledger access.
- [x] Normalize communications, bookings, partners, support, payments, and suppliers into six operational lanes.
- [x] Show explicit private-pilot safety locks and a non-mutating attention queue.
- [x] Keep Phase 1 read-only with no execute, retry, send, publish, payment, payout, or supplier-activation controls.
- [x] Add unit coverage for queue health, safety conflicts, receipt ordering, authorization order, and GET-only behavior.

Completed Phase 1 release gates:

- [x] Pass the full repository check with the completed Operations Center changes: ESLint, TypeScript, 954 tests across 223 files, and the optimized 111-route Next.js build.
- [x] Commit and push after separate approval.
- [x] Deploy to Preview after separate approval and verify the authenticated page against live Preview ledgers.

The Phase 1 design and safety boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_1.md`.

Phase 2 software gates:

- [x] Add six lane-specific operator runbooks with explicit completion checks and prohibited actions.
- [x] Add admin-only incident creation, acknowledgment, assignment, immutable notes, and resolution.
- [x] Re-check administrator authorization inside every server action and database transaction.
- [x] Reject credential-, token-, and payment-card-shaped incident text at the application and database boundaries.
- [x] Keep all execution, retry, send, publish, payment, payout, credential, and supplier-activation controls excluded.
- [x] Keep Phase 1 available in runbooks-only mode before migration 064 is applied.

Phase 2 release gates:

- [x] Pass the full repository verification with Phase 2: ESLint, TypeScript, 960 tests across 224 files, and the optimized 111-route Next.js build.
- [x] Apply migration `202608170064` to the isolated Preview database after separate approval.
- [x] Deploy to isolated Preview and complete authenticated browser acceptance after separate approval.
- [x] Reconcile this laptop branch with the deployed source; all 73 changed Git blobs match from the common base.
- [x] Publish the approved laptop branch and verify local/remote synchronization at `0c7540d`.

The Phase 2 design and safety boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_2.md`.

Phase 3 software gates:

- [x] Require an acknowledged, unresolved incident before a dry-run request can be created.
- [x] Generate a deterministic SHA-256 idempotency fingerprint and reject duplicate logical requests.
- [x] Require two distinct administrator approvals and prohibit requester self-approval.
- [x] Preserve immutable approval, quorum, cancellation, and dry-run validation receipts.
- [x] Constrain the entire phase to `dry_run_only` with `validated_no_executor` as the sole completion result.
- [x] Keep email, money movement, booking mutation, supplier traffic, deployment, and Production actions excluded.
- [x] Keep Phases 1–2 available when migration 065 is not yet present.

Phase 3 release gates:

- [x] Pass the full repository verification with Phase 3: ESLint, TypeScript, 966 tests across 225 files, and the optimized 111-route Next.js build.
- [x] Apply migrations `202608170064` and `202608170065` to the isolated Preview database after separate approval.
- [x] Deploy to isolated Preview and complete authenticated browser acceptance after separate approval.
- [x] Reconcile this laptop branch with the deployed source; all 73 changed Git blobs match from the common base.
- [x] Publish the approved laptop branch and verify local/remote synchronization at `0c7540d`.

The Phase 3 design and execution boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_3.md`.

Phase 4 software gates:

- [x] Add six fixed acknowledgment and resolution SLO policies for critical, warning, and review incidents.
- [x] Record one idempotent observation-only scan per UTC date.
- [x] Create internal escalations for breached SLOs and resolve them when source incidents reach their policy checkpoints.
- [x] Require administrator authorization and a sanitized note for escalation acknowledgment.
- [x] Derive provider-health snapshots only from existing email, Stripe, PMS, and SynXis ledgers.
- [x] Require both `CRON_SECRET` and a disabled-by-default scanner flag before service-role access.
- [x] Keep notification, retry, payment, booking mutation, supplier traffic, and manual scan controls excluded.
- [x] Keep Phases 1–3 available when migration 066 is not yet present.

Phase 4 release gates:

- [x] Pass the full repository verification with Phase 4: ESLint, TypeScript, 972 tests across 226 files, and the optimized 111-page Next.js build.
- [x] Apply migrations `202608170064` through `202608170066` to the isolated Preview database after separate approval.
- [x] Deploy to isolated Preview and complete authenticated browser acceptance after separate approval.
- [x] Reconcile this laptop branch with the deployed source; all 73 changed Git blobs match from the common base.
- [x] Publish the approved laptop branch and verify local/remote synchronization at `0c7540d`.
- [x] Verify the main Production project has no Project or Shared `AUTOMATION_POLICY_SCANNER_ENABLED` entry; the scanner remains fail-closed unless a separate Production scheduling decision explicitly enables it.

The Phase 4 design and scheduling boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_4.md`.

Phase 5 software gates:

- [x] Allowlist exactly one internal read-only adapter for sanitized email-outbox receipt validation.
- [x] Require a dual-approved, completed Phase 3 email-delivery dry run.
- [x] Enforce one execution per approved request and derive its idempotency key from the Phase 3 fingerprint.
- [x] Default both application and database kill switches to disabled.
- [x] Read and retain only the allowlisted outbox status, never recipient or message data.
- [x] Constrain network access, external side effects, message sending, and money movement to false.
- [x] Keep execution and event history immutable and administrator-owned.
- [x] Keep Phases 1–4 available when migration 067 is not yet present.

Phase 5 release gates:

- [x] Pass the full repository verification with Phase 5: ESLint, TypeScript, 978 tests across 227 files, and the optimized 111-page Next.js build.
- [x] Apply migrations `202608170064` through `202608170067` to the isolated Preview database after separate approval.
- [x] Deploy to isolated Preview and complete authenticated browser acceptance with both executor kill switches disabled after separate approval.
- [x] Reconcile this laptop branch with the deployed source; all 73 changed Git blobs match from the common base.
- [x] Publish the approved laptop branch and verify local/remote synchronization at `0c7540d`.
- [x] Verify both isolated Preview sandbox-executor kill switches remain disabled, the effective executor is locked, and zero executions are recorded; any synthetic check still requires separate approval.
- [x] Verify the main Production project has no Project or Shared `AUTOMATION_SANDBOX_EXECUTOR_ENABLED` entry; the adapter remains fail-closed unless a separate Production authorization decision explicitly enables it.

The Phase 5 design and double-kill-switch boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_5.md`.

The combined isolated Preview acceptance evidence for Phases 2–5 is recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PREVIEW_EVIDENCE_2026-08-18.md`.

The optional synthetic receipt-check closeout is defined in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_5_SYNTHETIC_CHECK_RUNBOOK.md`. It requires three independently authenticated Preview administrators; the current two-operator environment cannot satisfy the requester-plus-two-approver quorum.

## Phase 6 — Flight planning and supplier readiness

Status: **Flights Phases 1–20 repository-verified, Git-published, and accepted in isolated Preview; all provider contact, review execution, recommendation, supplier selection, airline content, credentials, ticketing, payment, and Production traffic disabled**

The first Flights phase adds a supplier-offline consumer planning surface. It validates route, date, cabin, and traveler details without contacting an airline or displaying schedules, fares, availability, or tickets.

Software gates:

- [x] Add the `/flights` planning surface and customer navigation.
- [x] Validate flight-planning input without external network traffic.
- [x] Clearly disclose that live fares, inventory, ticketing, and payment are unavailable.
- [x] Pass ESLint, TypeScript, 982 tests across 228 files, and the optimized 112-page Next.js build.

Release gates:

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy to isolated Preview after separate approval and complete browser acceptance with no provider credentials or traffic.

External activation gates:

- [ ] Select and contract an authorized airline-content and ticketing path.
- [ ] Complete provider sandbox certification and servicing-readiness acceptance.
- [ ] Obtain passenger-data, payment, fraud, settlement, legal, support, and Production-release approvals.
- [ ] Make a separate Production decision before enabling airline traffic, flight payments, or ticketing.

The Flights Phase 1 design and safety boundary are recorded in `docs/FLIGHTS_PHASE_1.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_1_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 2 supplier-readiness software gates:

- [x] Add the protected, read-only `/admin/flights` supplier-readiness workspace.
- [x] Define neutral NDC aggregator, GDS, and consolidator evaluation paths without claiming a supplier relationship.
- [x] Define shopping, order, ticketing, servicing, and operational certification requirements.
- [x] Define ten separately owned activation gates while keeping sandbox traffic, Production traffic, ticketing, and payment disabled.
- [x] Pass ESLint, TypeScript, 987 tests across 229 files, and the optimized 113-page Next.js build.

Phase 2 release gates:

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

The Flights Phase 2 supplier-readiness design and fail-closed boundary are recorded in `docs/FLIGHTS_PHASE_2.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_2_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 3 supplier-selection planning software gates:

- [x] Define a vendor-neutral, one-hundred-point supplier-selection rubric without recording a candidate, score, shortlist, or selection.
- [x] Define four provider-neutral sandbox adapter operations as design contracts only.
- [x] Define eight separately owned decision gates while keeping supplier selection, credentials, implementation, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, mutation, environment variable, provider SDK, or network request.
- [x] Pass ESLint, TypeScript, 993 tests across 230 files, and the optimized 113-page Next.js build.

Phase 3 release gates:

- [x] Commit and push the approved laptop changes after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

The Flights Phase 3 selection and adapter-planning boundary is recorded in `docs/FLIGHTS_PHASE_3.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_3_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 4 supplier due-diligence software gates:

- [x] Define seven candidate-evidence workstreams without recording a supplier identity, response, document, quote, score, shortlist, or representation.
- [x] Define six contract-review lanes without receiving, negotiating, approving, signing, or activating an agreement.
- [x] Define nine separately owned diligence gates while keeping candidate, contract, supplier selection, credentials, implementation, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, or network request.
- [x] Pass ESLint, TypeScript, 1,000 tests across 231 files, and the optimized 113-page Next.js build.

Phase 4 release gates:

- [x] Commit and push the approved laptop changes at `041301c` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

The Flights Phase 4 due-diligence and contracting-readiness boundary is recorded in `docs/FLIGHTS_PHASE_4.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_4_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 5 evaluation-governance software gates:

- [x] Define six evidence-admissibility controls without opening intake or recording a supplier identity, response, document, representation, score, ranking, recommendation, or shortlist.
- [x] Define five decision-record safeguards that separate admissibility, scoring, conflicts, exceptions, recommendations, shortlist approval, contracting, supplier selection, implementation, and release.
- [x] Define ten separately owned evaluation-governance gates while keeping intake, candidate records, evaluation cases, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, implementation, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, or network request.
- [x] Pass ESLint, TypeScript, 1,007 tests across 232 files, and the optimized 113-page Next.js build.

Phase 5 release gates:

- [x] Commit and push the approved laptop changes at `b78a6f7` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

The Flights Phase 5 evaluation-governance boundary is recorded in `docs/FLIGHTS_PHASE_5.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_5_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 6 synthetic evaluation-rehearsal software gates:

- [x] Define six fictional rehearsal scenarios for evidence rejection, freshness, comparability, recusal, exception concurrence, and recommendation authority without using supplier or passenger data.
- [x] Define five sanitized receipt safeguards without creating a fixture, receipt, storage path, reviewer assignment, or execution engine.
- [x] Define ten separately owned rehearsal-design gates while keeping rehearsal execution, intake, candidates, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, implementation, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, or network request.
- [x] Pass ESLint, TypeScript, 1,014 tests across 233 files, and the optimized 113-page Next.js build.

Phase 6 release gates:

- [x] Commit and push the approved laptop changes at `6981d01` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 6 rehearsal-execution gates:

- [ ] Approve a fictional fixture standard and attest that no real supplier, passenger, credential, endpoint, schedule, fare, availability, or commercial data is present.
- [ ] Name separately accountable reviewers and observers through an approved internal process.
- [ ] Make a separate decision before creating a fictional fixture or running any synthetic scenario.
- [ ] Record sanitized rehearsal results and resolve findings without opening named supplier evaluation intake.

The Flights Phase 6 synthetic-rehearsal boundary is recorded in `docs/FLIGHTS_PHASE_6.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_6_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 7 rehearsal-authorization readiness software gates:

- [x] Define six authorization-packet artifacts without requesting or recording a rehearsal authorization, creating a fixture, assigning a participant, or opening supplier evaluation intake.
- [x] Define five fail-closed safeguards for fictional data, no external connectivity, role separation, one-time scope, and findings closure.
- [x] Define ten separately owned authorization-readiness gates while keeping authorization, fixtures, roles, rehearsal execution, results, receipts, findings, candidates, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, network request, external message, or Production change.
- [x] Pass ESLint, TypeScript, 1,021 tests across 234 files, and the optimized 113-page Next.js build.

Phase 7 release gates:

- [x] Commit and push the approved laptop changes at `97d0199` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 7 rehearsal-decision gates:

- [ ] Approve the synthetic rehearsal policy, fictional fixture standard, no-real-data attestation, no-connectivity attestation, independent role matrix, stop plan, receipt standard, and closeout process through accountable internal processes.
- [ ] Make a separate one-time decision before creating any fictional fixture or running any synthetic scenario.
- [ ] Record only sanitized results and resolve every finding without opening named supplier evaluation intake.

The Flights Phase 7 rehearsal-authorization readiness and non-execution boundary is recorded in `docs/FLIGHTS_PHASE_7.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_7_PREVIEW_EVIDENCE_2026-08-18.md`.

Phase 8 synthetic rehearsal preflight-design software gates:

- [x] Define seven preflight-control artifacts without satisfying authorization, creating or inspecting a fixture, assigning a participant, starting preflight, or opening supplier evaluation intake.
- [x] Define five immediate-stop safeguards for authorization prerequisites, real-data contamination, external connectivity, role conflicts, evidence handling, and teardown.
- [x] Define ten separately owned preflight-readiness gates while keeping authorization unsatisfied and preflight, fixtures, roles, rehearsal execution, results, receipts, findings, candidates, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, network request, external message, or Production change.
- [x] Pass ESLint, TypeScript, 1,028 tests across 235 files, and the optimized 113-page Next.js build.

Phase 8 release gates:

- [x] Commit and push the approved laptop changes at `b11764c` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 8 preflight-decision gates:

- [ ] Satisfy the separately controlled Phase 7 authorization prerequisite through accountable internal processes.
- [ ] Approve the authorization scope, fictional-fixture manifest, no-real-data recheck, offline isolation proof, independent-role plan, observer controls, sanitized evidence schema, and teardown plan.
- [ ] Make a separate action-time decision before creating any fictional fixture, assigning any participant, or starting any rehearsal activity.
- [ ] Record only sanitized results and resolve every finding without opening named supplier evaluation intake.

The Flights Phase 8 synthetic preflight-design and non-execution boundary is recorded in `docs/FLIGHTS_PHASE_8.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_8_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 9 synthetic rehearsal execution-control design software gates:

- [x] Define six execution-control stages without satisfying authorization or preflight, opening an execution window, creating or inspecting a fixture, assigning a participant, releasing or running a scenario, recording an observation, or opening supplier evaluation intake.
- [x] Define five pause-and-abort safeguards for start authority, one-scenario-at-a-time sequencing, observer veto, evidence quarantine, abort, and restart.
- [x] Define ten separately owned execution-control gates while keeping authorization, preflight, execution decision and window, fixtures, roles, rehearsal execution, released scenarios, results, observations, receipts, findings, teardown, closeout, candidates, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, environment variable, provider SDK, network request, external message, or Production change.
- [x] Pass ESLint, TypeScript, 1,034 tests across 236 files, and the optimized 113-page Next.js build.

Phase 9 release gates:

- [x] Commit and push the approved laptop changes at `41ad1b3` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 9 execution-control decision gates:

- [ ] Satisfy the separately controlled Phase 7 authorization and Phase 8 preflight prerequisites through accountable internal processes.
- [ ] Approve the one-time scope, fictional-fixture and deletion plan, independent-role and observer controls, offline isolation, one-scenario-at-a-time sequence, sanitized observation schema, abort response, teardown, and closeout.
- [ ] Make a separate action-time decision before opening an execution window, creating any fictional fixture, assigning any participant, or releasing one scenario.
- [ ] Stop immediately on any prerequisite, scope, contamination, connectivity, role, observer, evidence, sequence, teardown, or closeout failure; require a new authorization and preflight cycle before any restart could be considered.

The Flights Phase 9 synthetic rehearsal execution-control design and non-execution boundary is recorded in `docs/FLIGHTS_PHASE_9.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_9_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 10 synthetic rehearsal closeout and findings-disposition design software gates:

- [x] Define six closeout evidence artifacts without creating an execution record, implying that a rehearsal ran, recording an observation, creating a receipt or finding, starting teardown, confirming deletion, approving closeout, or opening supplier evaluation intake.
- [x] Define five findings-disposition safeguards for implied execution, incomplete teardown, unresolved findings, dissent, recusals, exceptions, no restart, and no downstream authority.
- [x] Define ten separately owned closeout-control gates while keeping authorization, preflight, execution evidence, the execution window, fixtures, roles, rehearsal execution, released scenarios, results, observations, receipts, findings, findings disposition, contamination review, teardown, fixture deletion, closeout, candidates, evidence, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, deletion action, environment variable, provider SDK, network request, external message, or Production change.
- [x] Pass ESLint, TypeScript, 1,040 tests across 237 files, and the optimized 113-page Next.js build.

Phase 10 release gates:

- [x] Commit and push the approved laptop changes at `0f83a63` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 10 closeout decision gates:

- [ ] Create a Phase 9 execution record only after separately satisfying its authorization, preflight, and action-time start decisions through accountable internal processes.
- [ ] Reconcile every separately released fictional scenario, stop, observer checkpoint, sanitized observation, and result without accepting real or sensitive data.
- [ ] Confirm contamination review, fictional-fixture deletion, evidence sanitation, findings ownership, dissent, recusals, exceptions, authorization expiration, and no restart through separate accountable reviews.
- [ ] Resolve every blocking finding and independent objection without waiver, suppression, or conversion into downstream authority.
- [ ] Make a separate closeout decision before creating a closeout receipt; require a new authorization and preflight cycle before any future rehearsal could be considered.

The Flights Phase 10 synthetic rehearsal closeout, findings-disposition, and non-activation boundary is recorded in `docs/FLIGHTS_PHASE_10.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_10_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 11 supplier-evaluation intake authorization design software gates:

- [x] Define six intake-authorization artifacts without satisfying Phase 10 closeout, opening intake, contacting a supplier, creating a candidate or case, creating a submission channel, receiving evidence, assigning a reviewer, opening an authorization window, scoring or selecting a supplier, or authorizing an external capability.
- [x] Define five intake-opening safeguards for implied intake, supplier contact, candidate neutrality, data minimization, evidence channels, downstream decisions, and external release.
- [x] Define ten separately owned intake-authorization gates while keeping closeout, intake, supplier contact, candidates, cases, channels, evidence, roles, conflict review, authorization, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, environment variable, provider SDK, network request, external message, supplier identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,046 tests across 238 files, and the optimized 113-page Next.js build.

Phase 11 release gates:

- [x] Commit and push the approved laptop changes at `435573d` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 11 intake-opening decision gates:

- [ ] Create and separately approve an actual Phase 10 closeout only after a separately authorized rehearsal has run and all closeout evidence, teardown, findings, dissent, expiration, and no-restart requirements are satisfied.
- [ ] Approve a narrow evaluation purpose, supplier path, objective eligibility criteria, exclusions, owners, duration, and explicit no-selection boundary.
- [ ] Approve legal and commercial authority, the contact model, an allowlisted evidence channel and taxonomy, least-privilege access, retention, deletion, sanitation, prohibited-data, malware, incident, and privacy controls.
- [ ] Approve independent reviewer and observer roles, conflicts, recusals, replacement, dissent, exception, stop, revocation, expiry, quarantine, closeout, and no-restart controls.
- [ ] Make a new, one-time, scoped, expiring, revocable action-time decision outside this design immediately before intake could open.

The Flights Phase 11 supplier-evaluation intake authorization and non-opening boundary is recorded in `docs/FLIGHTS_PHASE_11.md`. The isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_11_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 12 supplier-evaluation intake preflight design software gates:

- [x] Define seven intake-preflight controls without creating or satisfying Phase 11 authorization, opening preflight or intake, contacting a supplier, creating a candidate or case, creating a submission channel, receiving evidence, assigning a reviewer, scoring or selecting a supplier, or authorizing an external capability.
- [x] Define five immediate-stop safeguards for missing authority, supplier identity and contact, channel or data contamination, role conflicts and dissent, incomplete closeout, and downstream release.
- [x] Define ten separately owned intake-preflight gates while keeping authorization, preflight, intake, supplier contact, candidates, cases, channels, evidence, roles, conflict review, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, environment variable, provider SDK, network request, external message, supplier identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,052 tests across 239 files, and the optimized 113-page Next.js build.

Phase 12 release gates:

- [x] Commit and push the approved laptop changes at `44c3d2c` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 12 intake-preflight decision gates:

- [ ] Create and separately approve an actual, current, one-time Phase 11 intake-opening authorization after every prerequisite and accountable review is satisfied.
- [ ] Bind the permitted supplier path, objective candidate-neutral eligibility, exclusions, evidence classes, owners, duration, expiry, revocation, and no-selection boundary.
- [ ] Approve the future contact owner, message, channel, disclosure, identity-minimization rule, jurisdiction, stop condition, and no-commercial-commitment statement.
- [ ] Approve action-time channel-isolation proof, evidence taxonomy, prohibited-data, least-privilege, sanitation, malware, logging, retention, deletion, incident, and privacy controls.
- [ ] Confirm independent roles, conflicts, recusals, replacements, dissent, exceptions, escalation, stop, revocation, quarantine, closeout, no restart, and no downstream authority.
- [ ] Make a new, one-time, scoped, expiring, revocable action-time decision outside this preflight immediately before intake could open.

The Flights Phase 12 supplier-evaluation intake preflight and non-opening boundary is recorded in `docs/FLIGHTS_PHASE_12.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_12_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 13 supplier-evaluation intake execution-control design software gates:

- [x] Define seven intake execution controls without creating or satisfying Phase 11 authorization or a Phase 12 preflight receipt, opening an intake window, contacting a supplier, creating a candidate or case, creating a submission channel, receiving evidence, assigning a reviewer, sanitizing or quarantining evidence, scoring or selecting a supplier, or authorizing an external capability.
- [x] Define five immediate-stop safeguards for missing prerequisites, widened scope, supplier or channel exposure, prohibited data, role conflicts and dissent, incomplete teardown, and downstream release.
- [x] Define ten separately owned intake-execution gates while keeping authorization, preflight, execution decisions, intake, supplier contact, candidates, cases, channels, evidence, sanitation, quarantine, incidents, roles, conflict review, teardown, closeout, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, environment variable, provider SDK, network request, external message, supplier identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,058 tests across 240 files, and the optimized 113-page Next.js build.

Phase 13 release gates:

- [x] Commit and publish the approved Phase 13 source at private-branch commit `83537fa` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 13 intake-execution decision gates:

- [ ] Create and separately approve actual, current, one-time Phase 11 authorization and Phase 12 preflight receipts after every prerequisite and accountable review is satisfied.
- [ ] Bind one candidate-neutral purpose, one separately identified supplier, allowed evidence, exclusions, owners, start, expiry, revocation, no delegation, no reuse, and no-selection boundary.
- [ ] Approve one contact handoff and verify the isolated, least-privilege, logged, time-limited submission channel immediately before use.
- [ ] Confirm evidence taxonomy, prohibited-data detection, sanitation, malware, quarantine, access, retention, deletion, incident, privacy, and contamination controls.
- [ ] Confirm independent roles, conflicts, recusals, replacements, preserved dissent, exceptions, escalation, immediate-stop, no-restart, teardown, closeout, and no-downstream authority.
- [ ] Make a new, one-time, scoped, expiring, revocable action-time decision outside this design immediately before contacting one supplier or opening one isolated intake window.

The Flights Phase 13 supplier-evaluation intake execution-control design and non-execution boundary is recorded in `docs/FLIGHTS_PHASE_13.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_13_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 14 supplier-evaluation intake closeout design software gates:

- [x] Define seven intake closeout evidence artifacts without creating or satisfying Phase 11 authorization, a Phase 12 preflight receipt, or a Phase 13 execution record; contacting a supplier; creating a candidate, case, or channel; receiving evidence; reconciling an intake; deleting material; resolving incidents or findings; completing teardown; creating closeout; scoring or selecting a supplier; or authorizing an external capability.
- [x] Define five findings-disposition safeguards for missing execution evidence, unreconciled data, incidents, findings, dissent, incomplete deletion or teardown, restart, scoring, selection, and downstream release.
- [x] Define ten separately owned intake-closeout gates while keeping authorization, preflight, execution records, intake, supplier contact, candidates, cases, channels, evidence, sanitation, quarantine, incidents, roles, conflict review, retention, deletion, access removal, findings, teardown, closeout, scoring, recommendations, shortlist, contract, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, deletion action, upload, storage path, environment variable, provider SDK, network request, external message, supplier identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,064 tests across 241 files, and the optimized 113-page Next.js build.

Phase 14 release gates:

- [x] Commit and publish the approved Phase 14 source at private-branch commit `c8bfb04` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 14 intake-closeout decision gates:

- [ ] Create and separately approve actual, current, one-time Phase 11 authorization, Phase 12 preflight, and Phase 13 execution records after every prerequisite and accountable review is satisfied.
- [ ] Reconcile one authorized purpose, scope, window, contact handoff, candidate-neutral record, evaluation case, channel, receipt, evidence inventory, stop, and final disposition.
- [ ] Confirm prohibited-data detection, malware review, sanitation, quarantine, isolation, incidents, contamination review, access history, permitted retention, copy inventory, deletion, and access removal through separate accountable reviews.
- [ ] Reconcile independent roles, conflicts, recusals, replacements, preserved dissent, exceptions, overrides, stop decisions, findings, remediation owners, due dates, verification, and blockers.
- [ ] Confirm authorization expiry, channel closure, teardown, no reuse, and no restart; any future intake requires new authorization, preflight, and execution decisions.
- [ ] Make a new closeout decision outside this design only after every prerequisite and reconciliation requirement is satisfied.

The Flights Phase 14 supplier-evaluation intake closeout, findings-disposition, and non-activation boundary is recorded in `docs/FLIGHTS_PHASE_14.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_14_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 15 supplier-evidence review authorization design software gates:

- [x] Define seven evidence-review authorization artifacts without creating or approving Phase 14 closeout; reopening intake; contacting a supplier; creating a candidate, case, or channel; admitting evidence; approving a rubric; assigning a reviewer; granting access; opening a review; scoring or selecting a supplier; or authorizing an external capability.
- [x] Define five review-integrity safeguards for implied authority, evidence admissibility, new intake, retrofitted criteria, conflicted review, suppressed dissent, recommendation, selection, and downstream release.
- [x] Define ten separately owned evidence-review authorization gates while keeping closeout, evidence, rubrics, review roles, access, review, scoring, recommendations, shortlist, commercial diligence, contracts, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, scoring engine, environment variable, provider SDK, network request, external message, supplier identity, reviewer identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,070 tests across 242 files, and the optimized 113-page Next.js build.

Phase 15 release gates:

- [x] Commit and publish the approved Phase 15 source at private-branch commit `56bcf22` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 15 evidence-review authorization decision gates:

- [ ] Create and separately approve an actual, current Phase 14 closeout after every prerequisite, reconciliation, deletion, incident, finding, dissent, expiry, teardown, and no-restart requirement is satisfied.
- [ ] Approve one fixed, sanitized, lineaged, allowlisted evidence inventory with permitted use, exclusions, access, retention, deletion, prohibited-data, contamination, and reproducibility controls; do not reopen intake or add material.
- [ ] Approve and freeze the objective review purpose, rubric version, criteria, weights, thresholds, missing-evidence rules, change control, and no-retrofitting boundary before any evidence is inspected.
- [ ] Confirm legal, commercial, privacy, security, confidentiality, jurisdiction, and data-use authority for the narrow review without accepting a proposal or contract.
- [ ] Approve independent reviewers and observers, conflicts, recusals, replacements, blind-review rules, variance treatment, preserved dissent, exceptions, explicit overrides, findings, escalation, and unconditional stop authority.
- [ ] Make a new, one-time, scoped, expiring, revocable action-time decision outside this design immediately before a fixed evidence inventory could enter review.

The Flights Phase 15 supplier-evidence review authorization and non-review boundary is recorded in `docs/FLIGHTS_PHASE_15.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_15_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 16 supplier-evidence review preflight design software gates:

- [x] Define seven review-preflight controls without creating or verifying Phase 15 authorization; reopening intake; contacting a supplier; creating a candidate, case, or channel; admitting evidence; hashing supplier material; approving a rubric; assigning a reviewer; granting access; opening review; scoring or selecting a supplier; or authorizing an external capability.
- [x] Define five immediate-stop safeguards for missing authority, inventory or rubric drift, new intake, conflicts, overprivileged access, suppressed dissent, incomplete closeout, recommendation, selection, and downstream release.
- [x] Define ten separately owned review-preflight gates while keeping authorization, evidence, rubrics, review roles, access, review, scoring, recommendations, shortlist, commercial diligence, contracts, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, scoring engine, environment variable, provider SDK, network request, external message, supplier identity, reviewer identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,076 tests across 243 files, and the optimized 113-page Next.js build.

Phase 16 release gates:

- [x] Commit and publish the approved Phase 16 source at private-branch commit `41f942f` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 16 evidence-review preflight decision gates:

- [ ] Create and separately approve an actual, current, scoped, expiring, revocable Phase 15 authorization after every Phase 15 decision prerequisite is satisfied.
- [ ] Fix and verify one sanitized, lineaged, hashed, allowlisted evidence inventory with permitted use, exclusions, access, retention, deletion, prohibited-data, incident, contamination, and reproducibility controls; do not reopen intake or add material.
- [ ] Verify the objective review purpose and frozen rubric version, criteria, weights, thresholds, missing-evidence treatment, calculation rules, change control, and no-retrofitting boundary before any evidence is inspected.
- [ ] Recheck legal, commercial, privacy, security, confidentiality, jurisdiction, and data-use authority without accepting a proposal or contract.
- [ ] Verify independent reviewers and observer, acknowledgments, current conflicts, recusals, replacements, blind-review rules, least-privilege access, isolated sessions, variance treatment, preserved dissent, controlled exceptions, explicit overrides, findings, escalation, and stop authority.
- [ ] Make a new one-time action-time decision outside this design only after every preflight item is independently verified; review opening remains separate.

The Flights Phase 16 supplier-evidence review preflight and no-opening boundary is recorded in `docs/FLIGHTS_PHASE_16.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_16_PREVIEW_EVIDENCE_2026-08-19.md`.

Phase 17 supplier-evidence review execution-control design software gates:

- [x] Define seven controlled evidence-review stages without creating or verifying Phase 15 authorization or Phase 16 preflight; contacting a supplier; admitting or reviewing evidence; approving or running a rubric; assigning a reviewer; granting access; opening review; calculating a score; recommending or selecting a supplier; or authorizing an external capability.
- [x] Define five immediate-stop safeguards for missing authority, inventory or rubric drift, role conflicts, overprivileged access, contamination, uncontrolled work product, suppressed dissent, incomplete closeout, recommendation, selection, and downstream release.
- [x] Define ten separately owned evidence-review execution-control gates while keeping authorization, preflight, evidence, rubrics, review roles, access, sessions, review, scoring, recommendations, shortlist, commercial diligence, contracts, supplier selection, credentials, traffic, ticketing, and payment disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, scoring engine, environment variable, provider SDK, network request, external message, supplier identity, reviewer identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,082 tests across 244 files, and the optimized 113-page Next.js build.

Phase 17 release gates:

- [x] Commit and publish the approved Phase 17 source at private-branch commit `af82ff7` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 17 evidence-review execution decision gates:

- [ ] Create and separately approve an actual Phase 15 authorization and a separately approved Phase 16 preflight receipt after every prerequisite is satisfied.
- [ ] Bind one fixed evidence inventory, immutable hashes and lineage, rubric version, independent roles, isolated access, criterion sequence, review window, expiry, revocation, stop, closeout, and no-restart boundary.
- [ ] Reverify prohibited-data, privacy, security, retention, deletion, work-product, incident, contamination, variance, dissent, finding, audit, reproducibility, access-removal, and closeout controls.
- [ ] Make a new one-time action-time decision outside this design before opening one fixed review window or releasing one criterion.
- [ ] Keep every score, recommendation, shortlist, commercial-diligence, contract, supplier-selection, credential, Sandbox, ticketing, payment, and Production decision separately controlled.

The Flights Phase 17 supplier-evidence review execution-control and no-execution boundary is recorded in `docs/FLIGHTS_PHASE_17.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_17_PREVIEW_EVIDENCE_2026-08-19.md`.

Public-source provider research and an unscored, non-selection preliminary shortlist are recorded in `docs/FLIGHTS_PROVIDER_RESEARCH_SHORTLIST_2026-08-19.md`. No supplier was contacted, scored, recommended, selected, contracted, credentialed, or connected.

A separately approved named-provider public-evidence matrix and conservative provisional scores are recorded in `docs/FLIGHTS_PROVIDER_PUBLIC_EVIDENCE_MATRIX_2026-08-19.md`. The scores measure public documentation completeness only and create no formal score, recommendation, selection, contact, contract, account, credential, traffic, payment, deployment, or Production authority.

The executive documentation-only provider-path preference is recorded in `docs/FLIGHTS_PROVIDER_PATH_DECISION_2026-08-19.md`: Duffel is the primary intended diligence and launch path, and Sabre is the secondary intended expansion path. No provider contact, formal recommendation, contracted selection, account, credential, implementation, traffic, payment, deployment, or Production authority was created.

Phase 18 Duffel provider-contact authorization design software gates:

- [x] Define six authorization artifacts without assigning a sender or approver; identifying a recipient; creating or approving a message, disclosure, channel, or contact window; contacting Duffel; receiving a response; or authorizing an external capability.
- [x] Define five immediate-stop safeguards for implied authority, provider or purpose drift, recipient or channel mismatch, unapproved text, sensitive data, impersonation, retries, incidents, commitments, evidence intake, and downstream release.
- [x] Define ten separately owned provider-contact authorization gates while keeping contact, responses, intake, cases, recommendations, selection, contracts, accounts, credentials, traffic, ticketing, and payments disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, environment variable, provider SDK, network request, external message, recipient identity, sender identity, or Production change.
- [x] Pass ESLint, TypeScript, 1,087 tests across 245 files, and the optimized 113-page Next.js build.

Phase 18 release gates:

- [x] Commit and publish the approved Phase 18 source at private-branch commit `f1d40e9` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 18 provider-contact decision gates:

- [ ] Approve one narrow Duffel diligence purpose, one accountable organizational sender, independent approvers, one official recipient role, one allowlisted channel, one immutable message, truthful disclosures, data minimization, start, expiry, revocation, stop, incident, no-retry, response-disposition, closeout, and no-commitment controls.
- [ ] Make a new one-time action-time decision outside the design immediately before one approved contact attempt.
- [ ] Keep every response, evidence intake, scoring, recommendation, selection, contract, account, credential, Sandbox, ticketing, payment, deployment, and Production decision separately controlled.

The Flights Phase 18 Duffel provider-contact authorization and non-contact boundary is recorded in `docs/FLIGHTS_PHASE_18.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_18_PREVIEW_EVIDENCE_2026-08-19.md`. Provider contact remains blocked.

Phase 19 Duffel provider-contact preflight design software gates:

- [x] Define seven preflight controls without creating or verifying Phase 18 authorization; assigning or authenticating a sender or approver; identifying a recipient; creating or approving a message, disclosure, channel, or window; contacting Duffel; receiving a response; or authorizing an external capability.
- [x] Define five immediate-stop safeguards for implied opening, authority or scope drift, identity or channel mismatch, conflicts, sensitive content, attachments, credentials, commitments, expiry, retries, incidents, responses, and downstream release.
- [x] Define ten separately owned provider-contact preflight gates while keeping authorization, contact, responses, intake, cases, recommendations, selection, contracts, accounts, credentials, traffic, ticketing, and payments disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, mutation, upload, storage path, environment variable, provider SDK, network request, external message, recipient identity, sender identity, or Production change.
- [x] Pass the focused Phase 19 test, ESLint, TypeScript, 1,092 tests across 246 files, and the optimized 113-page Next.js build.

Phase 19 release gates:

- [x] Commit and publish the approved Phase 19 source at private-branch commit `80c8e7a` after separate approval.
- [x] Deploy only to the isolated Preview project as deployment `dpl_6TEhtT7Ams1LdaoJWdojFKhNGGot` after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 19 provider-contact preflight decision gates:

- [ ] Create and separately approve an actual, current, narrow, expiring, revocable Phase 18 authorization outside this software after every Phase 18 decision prerequisite is satisfied.
- [ ] Bind and independently verify the immutable authority reference, Duffel-only scope, one diligence purpose, one attempt, exact message and disclosures, data minimization, sender, approvers, recipient role, official channel, start, expiry, revocation, stops, incidents, no retry, response disposition, closeout, and no-standing-authority controls.
- [ ] Make a new one-time action-time decision outside this design immediately before one approved contact attempt.
- [ ] Keep every response, evidence intake, scoring, recommendation, selection, contract, account, credential, Sandbox, ticketing, payment, deployment, and Production decision separately controlled.

The Flights Phase 19 Duffel provider-contact preflight and no-opening boundary is recorded in `docs/FLIGHTS_PHASE_19.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_19_PREVIEW_EVIDENCE_2026-08-19.md`. Actual Phase 18 authorization, Phase 19 preflight, and provider contact remain blocked.

Phase 20 Duffel provider-contact execution-control design software gates:

- [x] Define seven controlled provider-contact stages without creating or verifying Phase 18 authorization or Phase 19 preflight; assigning a sender or approver; identifying a recipient; creating or approving a message, disclosure, channel, or window; contacting Duffel; receiving a response; or authorizing an external capability.
- [x] Define five immediate-stop safeguards for missing authority or preflight, scope or message drift, identity or channel mismatch, conflicts, automation, retries, sensitive content, attachments, credentials, commitments, incidents, responses, incomplete closeout, and downstream release.
- [x] Define ten separately owned provider-contact execution-control gates while keeping authorization, preflight, contact, responses, intake, cases, recommendations, selection, contracts, accounts, credentials, traffic, ticketing, and payments disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, button, mutation, upload, storage path, environment variable, provider SDK, network request, external message, recipient identity, sender identity, or Production change.
- [x] Pass the focused Phase 20 test, ESLint, TypeScript, 1,097 tests across 247 files, and the optimized 113-page Next.js build.

Phase 20 release gates:

- [x] Commit and publish the approved Phase 20 source at private-branch commit `f91e696` after separate approval.
- [x] Deploy only to the isolated Preview project as deployment `dpl_AmJcFhKsPRXRRDA8YzEMmfARfEkT` after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 20 provider-contact execution decision gates:

- [ ] Create and separately approve an actual Phase 18 authorization and a separately approved Phase 19 preflight receipt after every prerequisite is satisfied.
- [ ] Bind one immutable Duffel-only purpose, message and disclosure version, accountable sender, independent approvers, official recipient role, authentic allowlisted channel, one manual attempt, fixed window, expiry, revocation, no delegation, no automation, no retry, no alternate channel, and immediate-stop conditions.
- [ ] Reverify sensitive-data exclusions, privacy, security, recordkeeping, response quarantine, incident, abort, access-removal, attempt reconciliation, expiry, closeout, no restart, and no-downstream-authority controls.
- [ ] Make a new one-time action-time start decision outside this design immediately before one approved contact attempt; Phase 20 creates no send control.
- [ ] Keep every response, evidence intake, scoring, recommendation, selection, contract, account, credential, Sandbox, ticketing, payment, deployment, and Production decision separately controlled.

The Flights Phase 20 Duffel provider-contact execution-control and no-contact boundary is recorded in `docs/FLIGHTS_PHASE_20.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_20_PREVIEW_EVIDENCE_2026-08-19.md`. Actual Phase 18 authorization, Phase 19 preflight, Phase 20 execution, and provider contact remain blocked.

Phase 21 Duffel provider-contact closeout design software gates:

- [x] Define seven provider-contact closeout evidence artifacts without creating or verifying Phase 18 authorization, Phase 19 preflight, or Phase 20 execution; assigning a person; creating a message, recipient, channel, attempt, delivery, receipt, response, incident, audit record, finding, expiry record, or closeout receipt; contacting Duffel; or authorizing an external capability.
- [x] Define five closeout reconciliation safeguards for implied execution, authority or scope drift, altered or duplicate attempts, delivery and receipt mismatch, responses, quarantine, incidents, stops, access, retention, deletion, expiry, no reply, no retry, no restart, and downstream release.
- [x] Define ten separately owned provider-contact closeout gates while keeping contact, delivery, responses, intake, cases, recommendations, selection, contracts, accounts, credentials, traffic, ticketing, and payments disabled.
- [x] Extend the protected `/admin/flights` workspace without a database, form, button, mutation, upload, storage path, environment variable, provider SDK, network request, external message, recipient identity, sender identity, or Production change.
- [x] Pass the focused Phase 21 test, ESLint, TypeScript, 1,103 tests across 248 files, and the optimized 113-page Next.js build.

Phase 21 release gates:

- [x] Commit and publish the approved Phase 21 source to the private branch after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 21 provider-contact closeout decision gates:

- [ ] Create and separately approve an actual Phase 18 authorization, Phase 19 preflight receipt, and Phase 20 execution record after every prerequisite is independently satisfied.
- [ ] Reconcile the exact scope, message, recipient role, authentic channel, fixed window, manual release, one attempt, delivery, minimal receipt, every response or quarantine item, incident, stop, access event, retained or deleted item, finding, dissent, exception, expiry, and audit record.
- [ ] Confirm no opening, following, forwarding, reply, retry, alternate channel, restart, evidence intake, recommendation, selection, contract, account, credential, implementation, traffic, ticketing, payment, or Production authority followed.
- [ ] Make a new closeout decision outside this design only after every prerequisite, reconciliation, access-removal, deletion, expiry, audit, and no-restart requirement is satisfied; Phase 21 creates no closeout control.
- [ ] Keep every future contact, reply, evidence intake, scoring, recommendation, selection, contract, account, credential, Sandbox, ticketing, payment, deployment, and Production decision separately controlled.

The Flights Phase 21 Duffel provider-contact closeout and no-reply boundary is recorded in `docs/FLIGHTS_PHASE_21.md`. Its isolated Preview acceptance evidence is recorded in `docs/FLIGHTS_PHASE_21_PREVIEW_EVIDENCE_2026-08-19.md`. Actual Phase 18 authorization, Phase 19 preflight, Phase 20 execution, provider contact, response handling, and closeout remain blocked.

## Phase 7 — Car-rental complete package

Status: **Phase 1 software complete and repository-verified locally; release, supplier connectivity, reservations, payments, and Production remain pending**

Phase 1 adds a supplier-offline consumer planning surface at `/cars`. Travelers can validate pickup and return locations, dates, times, a driver age range, and a vehicle class without contacting a rental company or displaying vehicles, rates, taxes, fees, protection products, availability, or reservations.

Phase 1 software gates:

- [x] Add `/cars` to customer navigation, the footer, and the sitemap.
- [x] Validate location, date, time, return-location, duration, driver-age-band, and vehicle-class input without external traffic.
- [x] Clearly disclose that live vehicles, rates, policies, reservations, eligibility decisions, and payments are unavailable.
- [x] Pass ESLint, TypeScript, 1,108 tests across 249 files, and the optimized 114-page Next.js build.

Phase 1 release gates:

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete browser acceptance at `/cars` without provider credentials, supplier traffic, reservations, or payments.

External activation gates:

- [ ] Select and contract an authorized rental-company, broker, aggregator, or GDS inventory and booking path.
- [ ] Complete sandbox certification for locations, availability, total pricing, policies, repricing, reservations, changes, cancellations, refunds, and authenticated webhooks.
- [ ] Approve driver-data, eligibility, protection-product, deposit, payment, fraud, dispute, legal, accessibility, support, and incident-response procedures.
- [ ] Make a separate Production decision before enabling supplier traffic, car-rental reservations, or payments.

The Phase 1 boundary is recorded in `docs/CAR_RENTALS_PHASE_1.md`. The complete 12-phase commercial sequence is recorded in `docs/CAR_RENTALS_ROADMAP.md`.

## Overall completion rule

Repository completion means `npm run check` passes and every public surface accurately describes its current mode. Commercial completion additionally requires all provider, data, legal, operational, and production release gates to be satisfied with recorded evidence. Software readiness must never be treated as authorization to enable live transactions.

# Roadmap and completion status

Last reviewed: 2026-08-18

iRatePilot is application-ready for a controlled private-pilot preview. It is not yet commercially complete: real inventory, public booking, live payments, partner payouts, and supplier traffic remain behind explicit release gates.

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

Status: **Flights Phases 1–9 repository-verified, Git-published, and accepted in isolated Preview; Phase 10 synthetic rehearsal closeout and findings-disposition design software repository-verified with release gates pending; all authorization, preflight, rehearsal execution, closeout, airline content, credentials, ticketing, payment, and Production traffic disabled**

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

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

Phase 10 closeout decision gates:

- [ ] Create a Phase 9 execution record only after separately satisfying its authorization, preflight, and action-time start decisions through accountable internal processes.
- [ ] Reconcile every separately released fictional scenario, stop, observer checkpoint, sanitized observation, and result without accepting real or sensitive data.
- [ ] Confirm contamination review, fictional-fixture deletion, evidence sanitation, findings ownership, dissent, recusals, exceptions, authorization expiration, and no restart through separate accountable reviews.
- [ ] Resolve every blocking finding and independent objection without waiver, suppression, or conversion into downstream authority.
- [ ] Make a separate closeout decision before creating a closeout receipt; require a new authorization and preflight cycle before any future rehearsal could be considered.

The Flights Phase 10 synthetic rehearsal closeout, findings-disposition, and non-activation boundary is recorded in `docs/FLIGHTS_PHASE_10.md`.

## Overall completion rule

Repository completion means `npm run check` passes and every public surface accurately describes its current mode. Commercial completion additionally requires all provider, data, legal, operational, and production release gates to be satisfied with recorded evidence. Software readiness must never be treated as authorization to enable live transactions.

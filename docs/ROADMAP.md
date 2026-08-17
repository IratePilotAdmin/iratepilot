# Roadmap and completion status

Last reviewed: 2026-08-17

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

Status: **Phase 1 implemented locally; Preview release and acceptance pending**

Phase 1 adds an admin-only, read-only command center over existing iRatePilot operational ledgers. It centralizes queue health, failures, recent sanitized receipts, and private-pilot safety locks without adding an automation executor or database migration.

Phase 1 software gates:

- [x] Add the `/admin/operations` surface and admin navigation entry.
- [x] Require administrator authorization before service-role ledger access.
- [x] Normalize communications, bookings, partners, support, payments, and suppliers into six operational lanes.
- [x] Show explicit private-pilot safety locks and a non-mutating attention queue.
- [x] Keep Phase 1 read-only with no execute, retry, send, publish, payment, payout, or supplier-activation controls.
- [x] Add unit coverage for queue health, safety conflicts, receipt ordering, authorization order, and GET-only behavior.

Remaining Phase 1 release gates:

- [x] Pass the full repository check with the completed Operations Center changes: ESLint, TypeScript, 954 tests across 223 files, and the optimized 111-route Next.js build.
- [ ] Commit and push only after separate approval.
- [ ] Deploy to Preview only after separate approval and verify the authenticated page against live Preview ledgers.

The Phase 1 design and safety boundary are recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_1.md`.

## Overall completion rule

Repository completion means `npm run check` passes and every public surface accurately describes its current mode. Commercial completion additionally requires all provider, data, legal, operational, and production release gates to be satisfied with recorded evidence. Software readiness must never be treated as authorization to enable live transactions.

# Flight live-commerce foundation

Date: 2026-08-23
Status: **locally verified, including disposable PostgreSQL 16.15 acceptance; executable journey synthetic-only; Duffel contract and bridge offline-only; server transport boundary disabled and unused; exact `server-only@0.0.1` installed locally; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; migrations `068` and `069` unapplied to shared, Preview, and Production databases; undeployed; default-off/HOLD; unaccepted; not commercially active**

> Historical baseline: this status line describes the 2026-08-23 foundation before the
> approved Preview gates. The 2026-08-25 Preview evidence supersedes its claims about the
> Duffel test account, credential, sandbox traffic, deployment, and Preview migration state.
> See `FLIGHTS_PREVIEW_MIGRATION_GATE_2026-08-24.md` and
> `FLIGHTS_DUFFEL_TEST_BOOKING_GATE_2026-08-25.md`. Production remains untouched,
> default-off, and unapproved.

## Outcome this package is moving toward

The launch target is a narrowly defined United States flight-selling pilot that can search supported airline content, reprice an offer, collect the required traveler information, take an approved payment, create exactly one airline order, reconcile the provider booking reference and electronic-ticket documents, send a compliant confirmation, service supported changes and cancellations, refund the traveler when required, process schedule changes, and support the traveler through completion.

This package does not claim that outcome yet. It creates the first executable local foundation after the earlier read-only planning and governance phases.

Initial launch scope is one-way and round-trip itineraries for one to nine adult travelers on provider-supported airlines and routes. Multi-city trips, groups, unaccompanied minors, split tickets, loyalty redemption, and unsupported automated exchanges remain outside the first launch unless separately implemented and accepted.

## Implemented and verified locally

- Provider-neutral search, immutable offer, exact repricing, provider-order, payment, ticketing, webhook, cancellation, and reconciliation contracts.
- Revision-bound order, payment, and ticket state machines with one commerce identity, exact coordinated receipts, ambiguity recovery, active-ticket compensation barriers, and an atomic durable provider-order/ticket finalizer contract. This is an interface and fail-closed workflow, not a deployed finalizer.
- All-off runtime policy with separate synthetic, sandbox, and Production modes, exact provider, customer-payment, and provider-balance settlement bindings, operation-specific authorities, and fail-closed operation/provider allowlists.
- An engaged transaction kill switch by default.
- Canonical request hashing, exact operation-bound idempotency, raw-body webhook signature verification, replay controls, and per-action Production authorization with authenticated evidence and durable one-time nonce consumption.
- A guarded provider-neutral live-adapter construction boundary that owns immutable request review, authorization, transport dispatch, and exact operation-specific result validation. No provider-specific live adapter or live transport implementation exists.
- A construction-disabled synthetic provider adapter with deterministic search, reprice, order, ticket, cancellation, and webhook fixtures.
- Synthetic traveler pages covering planning, results, offer review, local repricing, browser-only fictional traveler review, and a clearly non-commercial receipt.
- Offline JSON search and repricing endpoints that reject passenger fields, non-JSON bodies, oversized bodies, malformed UTF-8, and unexpected fields while reporting every external capability as disabled.
- An order endpoint that refuses before reading a passenger or payment body.
- Side-effect-free lifecycle notification contracts with immutable evidence snapshots and trusted durable verification. Pending, ticketed, failed, changed, cancelled, and refunded claims remain separate.
- Migration `068`, with no shared-database application receipt in this package, plus its guarded rollback, provides the repository foundation for flight commerce state, normalized itinerary/fare evidence, runtime controls, forced row-level access policies, provider/payment bindings, idempotency, and reconciliation. Its exact bootstrap mirror contains 15 tables, 48 triggers, 17 functions, and 15 forced-RLS relations.
- Migration `069`, its guarded rollback, and its exact bootstrap-schema mirror add a forced-RLS, service-role-only, digest-only outbound shopping-request journal. It permits only `create_offer_request`, `retrieve_offer`, and `list_orders_by_offer`; explicitly refuses `create_order`; keeps `retry_authorized = false`; and enforces exact compare-and-swap transitions from `prepared` to `blocked` or `dispatching`, and from `dispatching` to `succeeded`, `failed`, or `ambiguous`. It does not authenticate or mint its opaque receipt digests. Both migrations remain unapplied to shared, Preview, and Production databases.
- A pure offline Duffel v2 sandbox contract with owned byte/plain-data snapshots; phase-aware initial-versus-GET offer shapes; monotonic, plan-bound refresh provenance; coherent total/base/tax and payment-deadline rules; exact nested slice/segment/stop/passenger fare-and-baggage terms; a strict no-ancillary-services profile; complete zero/one/multiple order-list reconciliation; minimized booking-reference handling; exact order/ticket projection; and fixture webhook verification. The plans remain non-executable by themselves.
- An authenticated offer-evidence repository contract that persists and rehydrates exact synthetic response bytes and predecessor chains only under one `{tenantId, commerceId, actorId}` scope, with trusted time, raw-body logging disabled, real provider data refused, tenant access required, deletion required, and retention capped at seven days. No Production storage or deletion worker is included.
- Exact fictional-adult order payload and PII-integrity contracts whose aggregate authority claims contain opaque traveler/PII, terms-acceptance, and provider-balance settlement receipt digests. One trusted verifier must authenticate the exact aggregate claims; local test doubles do not independently prove the underlying component receipts. The PII digest is unkeyed fixture integrity, not anonymity or standalone authority.
- A process-local `offline_hold_only` create-order bridge that rehydrates the authenticated refreshed offer, obtains the aggregate synthetic traveler/terms/settlement verifier decision, and produces a branded non-executable instant-order plan plus a provider request-binding projection. All provider-traffic, booking, settlement, separate-ticket, lifecycle-mutation, completion-receipt, and external-request capabilities remain false.
- Local result projection for confirmed orders with `not_started`, `issuance_pending`, or atomic `issued` ticket evidence; canonical order/ticket completion bytes for a future trusted receipt issuer and durable compare-and-swap finalizer; and no-retry timeout reconciliation that maps zero orders to absent, one to full validation, and multiple to manual review. Fixture result projection neither performs create order nor authenticates response origin.
- A Node-only Duffel sandbox HTTP boundary whose three modules begin with the exact `import "server-only";` poison pill. Its no-argument default factory returns one disabled singleton and captures zero capabilities. Its separate explicit test-only factory requires injected traffic-gate, migration-`069` journal, credential-provider, and HTTP-dispatcher ports, but no application route imports or constructs it and this package implements none of those ports. It accepts only the three branded offline shopping plans above, fixes the origin at `https://api.duffel.com`, accepts only the `duffel_test_...` token shape, bounds request and exact response bytes, refuses redirects/cross-origin responses, performs no automatic retry, and structurally excludes create order.

The previously frozen Duffel contract and offline bridge verification passed at 2 files / 19 tests. The frozen server-transport boundary passed at 2 files / 28 tests, the independent transport/contract/migration compatibility gate passed at 4 files / 50 tests, the final combined flight suite passed at 34 files / 290 tests, and the full repository passed at 275 files / 1,449 tests. Full TypeScript, scoped transport lint, independent transport adversarial review, and whitespace/conflict checks passed. A loopback-only disposable PostgreSQL 16.15 run also proved exact migration order, forced RLS/ACLs, default-off behavior, lifecycle transitions, duplicate and stale-CAS refusal, a real two-session claim race, ambiguous outcomes, and guarded rollback order. It uncovered and drove correction of migration `068`'s `CASE` syntax and parent rollback dependency guard. The complete current hash set and runtime matrix are recorded in the server-transport and PostgreSQL acceptance documents. The preceding foundation verification also passed a webpack Production build that generated all 119 pages and a local browser check of the synthetic one-way planning, results, offer, reprice, fictional checkout, and non-commercial receipt path without browser console errors. These results are local repository and disposable-database evidence only, not provider, shared-database, deployment, payment, ticketing, or launch acceptance.

## Current hard stops

The first two bullets below are preserved as historical hard stops from this foundation
receipt. They are no longer current for Preview: migrations 068 through 073 are installed in
the approved Preview database, and one dedicated-token Duffel test-mode order has passed.
They remain true for Production and for the consumer application path.

- No Duffel or airline account, contract, KYC approval, access credential, configured or enabled transport, provider connection, registered webhook, sandbox request, or live request exists. The repository contains public endpoint metadata, branded offline request plans, a disabled singleton, and an unused dependency-injected test boundary only.
- This gate applied migrations `068` and `069` only to temporary loopback-only disposable databases. It did not apply either migration to any shared, Preview, or Production database, and contains no application-environment receipt. Local evidence does not prove external database state.
- The disposable PostgreSQL 16.15 behavior and concurrency gate passed. Its databases and cluster are temporary and are destroyed after audit; isolated Preview application and validation still require separate approval.
- No configured or real provider/payment credential is accepted or read. Caller-supplied fictional secrets are used only by offline verification tests.
- The exact `server-only@0.0.1` dependency is recorded in the npm manifests and installed locally from its integrity-verified official npm tarball. Ordinary ESM and CommonJS imports trigger the poison pill; the `react-server` condition resolves its empty server entry. This is not a deployment or application-use receipt.
- No sandbox credential provider, secret-store reader, HTTP dispatcher, traffic gate, migration-`069` journal adapter, environment-variable reader, or global-fetch fallback is implemented. The explicit test factory has no application use site.
- No Production implementation exists for the authenticated offer repository, retention deletion, keyed PII store/resolver, trusted clock, terms/PII/settlement authority verifier, provider-operation receipt issuer, or durable atomic order/ticket finalizer. Test doubles satisfying these ports are repository evidence, not durable infrastructure.
- No payment-processor webhook persistence path is implemented; the provider-event contract is limited to airline/content-provider events.
- No real passenger data may be entered into either the synthetic journey, the offline Duffel fixtures, or the synthetic offer repository. Passenger-bearing capture awaits separately approved privacy, logging, tenant access, keyed integrity, retention, and deletion controls.
- No real customer payment, provider settlement, provider order, booking reference, ticket, change, cancellation, refund, email, or support action can be created by this package. Synthetic adapters and tests create fictional fixtures only.
- All runtime/provider/booking/payment/ticketing/servicing/webhook/Production authorities remain off and the transaction kill switch remains engaged.
- This local package is approved only for publication to the private backup branch and remains undeployed and unaccepted. Neither public repository publication nor a provider contact, account, secret, shared-database action, or public advertising claim is authorized.
- A matching accepted-terms digest, exact PII digest, settlement-binding digest, component receipt digest, or canonical bridge digest is not authority by itself. The offline plan requires one trusted verifier decision over the complete scope-bound aggregate claims containing those opaque receipt digests. Local test doubles authenticate only that aggregate claim and binding; they do not independently authenticate traveler consent, PII authority, settlement authority, the underlying component receipt services, or provider dispatch authority.

## Recommended operating model to validate externally

The shortest current path is Duffel Managed Content for content, accreditation, and ticketing authority. The working payment assumption for implementation is customer collection through the existing approved payment processor plus a separately funded Duffel Balance settlement path. This is an assumption, not an accepted commercial decision. The account-specific point of sale, airline access, fees, reserves, markup rules, payment timing, refund path, chargeback allocation, and support coverage must be confirmed before sandbox or live implementation.

Do not make the launch depend on Duffel Payment Intents without current written confirmation that the product is available to this business. Direct traveler-card settlement must not be used unless Duffel approves it and its no-markup, 3DS, PCI, fraud, and chargeback requirements are accepted.

## Remaining path to 100% launch readiness

1. Publish the verified local package, migration, and rollback only to the approved private backup branch; public repository publication is not authorized.
2. Create and activate the business's Duffel account through an authorized human flow; complete email, business, personal, and KYC verification without placing identity documents or tokens in repository evidence.
3. Confirm Managed Content, the United States point of sale, exact enabled airlines, pricing, settlement method, support responsibilities, and commercial terms.
4. Review the completed disposable PostgreSQL evidence and, through a separate gate, apply `068` then `069` to an isolated Preview database with environment-specific rollback and monitoring evidence.
5. Starting from the completed local dependency and disabled boundary, implement and accept the approved secret-store credential provider, injected HTTP dispatcher, traffic gate, migration-`069` journal adapter, authenticated scoped offer repository, enforced deletion, keyed PII store/resolver, trusted clock, terms/PII/settlement receipt verification, provider-operation receipt issuance, durable atomic finalizer, and durable webhook receipt path. Never expose provider tokens or real traveler payloads to a browser or repository evidence.
6. Complete the official test matrix for no offers, repricing, offer expiry, holds, connections, authenticated order planning, provider-balance settlement, payment failure, provider timeouts, order failure, pending orders, ambiguous failures, duplicate prevention, atomic ticket documents, changes, cancellations, refunds, and airline-initiated changes.
7. Integrate the approved customer payment path and prove payment/order/ticket compensation and financial reconciliation.
8. Implement transactional confirmations and schedule-change notices while the email worker remains off until separately accepted.
9. Complete first-line and after-hours support, fraud, chargeback, privacy, fare-rule, baggage, accessibility, legal, incident, monitoring, and reconciliation acceptance.
10. Perform one explicitly authorized low-risk live booking, reconcile its provider order, booking reference, electronic-ticket documents, payment, confirmation, and support visibility, then exercise an approved cancellation/refund or equivalent controlled servicing proof.
11. Enable public booking and paid advertising only after the controlled live canary and Production acceptance pass.

## Definition of 100%

The flight product reaches 100% launch readiness only when repository evidence, deployed Preview behavior, provider sandbox evidence, commercial approval, legal and operational acceptance, and a controlled live Production canary all agree. A green local test suite, provider account, sandbox booking, deployed page, or successful payment alone is insufficient. Advertising authority follows the completed live canary; it cannot be inferred from this package.

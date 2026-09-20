# Flights Duffel sandbox contract

Date: 2026-08-24
Status: **locally verified offline contract, disabled server-only test transport boundary, exact local `server-only@0.0.1` installation, and disposable PostgreSQL 16.15 request-journal acceptance; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; migrations `068` and `069` unapplied to shared, Preview, and Production databases; undeployed; default-off/HOLD; no account, configured or real provider/payment credential, token read, provider request, real booking, payment, ticket, email, advertising, or provider authority**

## Outcome

This package turns current official Duffel documentation into a deterministic, fail-closed test-mode contract and offline bridge. It now also contains a Node-only Duffel HTTP transport boundary, but the only default construction path is a no-argument disabled singleton that captures zero capabilities. The explicit test-only factory has no application use site and requires injected traffic-gate, durable-journal, credential-provider, and HTTP-dispatcher ports; this package implements none of those ports. It does not read an environment variable, read a configured or real token, call Duffel, register a webhook, apply migrations `068` or `069` to a shared, Preview, or Production database, or authorize any customer or supplier action. Caller-supplied fictional secrets, repository ports, traveler resolvers, authority verifiers, and receipt digests are exercised only with local synthetic fixtures.

The contract currently covers the highest-risk offline boundaries:

- exact non-executable `v2` request plans with no bearer value and no invented provider idempotency key;
- adult-only one-way and round-trip search payloads;
- owned raw-byte snapshots with a pre-copy 1 MiB cap, shared-memory and exotic-iterator refusal, exact backing-range copies, fatal UTF-8 decoding, duplicate-key and ASCII-whitespace checks, depth/node/surrogate limits, unsafe-integer and negative-zero refusal, and exact preservation of non-integer JSON lexemes for canonical evidence;
- plain-data snapshots for search, offer/reprice, order-outcome, order-list, order, and webhook-verification inputs, refusing proxies, accessors, symbols, cycles, sparse or named arrays, prohibited prototype keys, and mutable aliases;
- phase-aware initial-search versus `GET /air/offers/:id` decoding, refusing response-only fields in the wrong phase and requiring an empty `available_services` array after the exact retrieval plan;
- explicit `live_mode: false`, Duffel Airways / `ZZ`, non-partial traditional offers, coherent USD total/base/tax money, exact expiry and payment-deadline invariants, request-bound passenger IDs and cabin, route, one-connection profile, and separate marketing/operating carrier disclosures;
- conversion of Duffel local segment times plus IANA airport zones into exact UTC, refusing nonexistent or ambiguous local times;
- stable cross-phase segment identity covering route, exact schedule, marketing flight, operating carrier, normalized duration, and ordered stop semantics; separate phase evidence binds provider segment/stop IDs and operating-flight values, while material/shared terms bind fare basis, cabin, cabin marketing name, and baggage without misclassifying mutable commercial terms as stable itinerary identity;
- exact nested slice boundaries plus slice conditions and fare-brand terms, preventing segment regrouping between slices;
- material-terms evidence covering top-level and slice conditions, the exact no-services profile, private fares, supported identity documents, loyalty programmes, airline credits, payment requirements, money, and carrier disclosures;
- separately branded initial and refreshed offer evidence, with monotonic capture times and a chained receipt bound to the exact offer-retrieval plan, preventing substitution of another search, offer, itinerary, provider, price, or terms claim;
- an authenticated repository port that can persist and rehydrate exact synthetic offer-response bytes, projection digests, and predecessor chains only under the same `{tenantId, commerceId, actorId}` scope;
- a required synthetic-only repository policy with real-provider data refused, raw-body logging disabled, tenant access control and retention deletion required, trusted time required, and a maximum retention window between 60 seconds and seven days; the contract validates this policy but does not supply storage or perform deletion;
- exact synthetic adult traveler payload validation and an unkeyed integrity digest over scope, departure date, traveler reference, provider-passenger binding, name, birth date, title, gender, email, and phone; a digest alone is explicitly not PII authority;
- trusted-port authority claims containing the authenticated refreshed-offer receipt, exact accepted terms plus an opaque acceptance-receipt digest, every exact PII payload plus an opaque PII-authority-receipt digest, and the USD provider-balance settlement binding plus an opaque settlement-authority-receipt digest; the contract requires one verifier decision over the exact aggregate claims, while real implementations must separately authenticate every referenced receipt and principal binding;
- a branded, process-local, non-executable instant create-order plan using the exact refreshed offer, exact authorized synthetic travelers, USD Duffel Balance payment shape, a 130-second minimum timeout, and dispatch no later than offer expiry, with every traffic, booking, payment, and external-request flag still false;
- an `offline_hold_only` bridge package that rehydrates the scope-bound refreshed offer, resolves only verified synthetic adults, checks the provider-balance execution binding, and produces an exact non-executable provider request binding plus a non-authoritative canonical bridge digest;
- a separate server-only, test-mode HTTP boundary for already-branded offline shopping plans: `create_offer_request`, `retrieve_offer`, and `list_orders_by_offer`; `create_order` is structurally excluded, the origin is fixed to `https://api.duffel.com`, only the `duffel_test_...` token shape is accepted, outbound and inbound bodies are bounded, exact response bytes are returned through a process-local verified receipt, redirects and cross-origin responses are refused, and automatic retries and provider idempotency headers remain absent;
- a forced-RLS migration `069` journal for those three shopping operations only, using digest-only identity and terminal evidence plus exact compare-and-swap transitions from `prepared` to `blocked` or `dispatching`, and from `dispatching` to `succeeded`, `failed`, or `ambiguous`; it cannot authenticate or mint the opaque receipt digests supplied to it, does not authorize retries, explicitly refuses `create_order`, and remains unapplied to shared, Preview, and Production databases;
- complete-page order-list reconciliation that classifies zero, one, or multiple matching orders while never treating cardinality as order validity or mutation authority;
- money-moving order outcome classification that never retries `200`, `202`, timeout, or `500` blindly;
- order projection that requires branded post-reprice evidence, an accepted-terms digest equal to that refresh, exact owner/money/passengers/nested slices/shared terms/disclosures, an explicitly empty service inventory, an airline sync no more than 60 seconds old, and paid electronic-ticket coverage—an order ID or booking reference alone never establishes ticketing;
- local create-order result projection for confirmed orders with ticket states `not_started`, `issuance_pending`, or `issued`; issued status requires complete electronic-ticket documents returned atomically by create order, and no separate ticket-issue operation is invented. This fixture projection models a possible future external result but neither performs the operation nor authenticates the response origin;
- canonical order/ticket completion evidence for the provider-neutral atomic finalizer, while deliberately omitting trusted receipt fields; a separate trusted issuer must authenticate the exact bytes and a durable compare-and-swap finalizer must persist the exact aggregate before any lifecycle mutation can be accepted;
- create-time timeout reconciliation through exact offer-filtered order-list cardinality: zero means absent, one requires full order validation, and more than one requires manual review; the original create request is never retried and no direct mutation is authorized;
- Duffel's exact webhook HMAC input (`timestamp + "." + raw bytes`), not the generic flight webhook framing;
- a fixed, non-widenable local 300-second webhook freshness policy, clearly classified as local rather than a Duffel guarantee;
- signature-verified offline-fixture sanitation using a caller-supplied test secret, unknown-event quarantine, and replay-decision semantics for a future durable receipt store keyed by Duffel's `idempotency_key` plus exact verified bytes.

Every exported contract and bridge capability remains false: configured credentials, token reads, traffic, booking, settlement, ticket mutation, separate ticket issuance, lifecycle mutation, authenticated completion-receipt issuance, servicing, webhook registration, and external requests. The new transport boundary does not widen those capabilities: its default singleton is disabled, while its explicit injected test-only factory is not imported or constructed by any route or application module.

The three transport-boundary modules are Node-only and start on their first line with the exact `import "server-only";` poison pill. The dependency is pinned exactly as `server-only@0.0.1` in `package.json` and `package-lock.json` and installed locally from the exact integrity-verified official npm tarball without modifying those manifests. Ordinary ESM and CommonJS imports throw the intended poison pill; the `react-server` condition resolves the package's empty server entry. Static checks find no client import, environment access, global `fetch`, or route handler. Pure decoders use explicit offline observation times; persistence and authority paths require trusted-time values from injected ports. No Production trusted-clock, credential provider, HTTP dispatcher, traffic gate, or journal database adapter exists.

Non-executable request-plan builders cover offer-request creation, offer retrieval, order listing by exact refreshed offer, and a narrowly bounded instant create order. Create order can be minted only from repository-authenticated, scope-bound refreshed evidence and a trusted verifier decision over exact aggregate claims containing synthetic traveler, terms-acceptance, and provider-balance receipt digests. The local test verifier does not independently prove the underlying component receipt services. The order-list projector establishes only complete-page offline reconciliation cardinality; one result still requires full order validation. The server boundary can review only the three branded shopping plans and structurally refuses the create-order plan. No enabled or configured transport, credential implementation, real settlement execution, separate ticket-issuance call, cancellation plan, or change plan exists.

The previously frozen Duffel contract and offline bridge verification passed at 2 files / 19 tests. The frozen server-transport boundary passed at 2 files / 28 tests, the independent transport/contract/migration compatibility gate passed at 4 files / 50 tests, the final combined flight suite passed at 34 files / 290 tests, and the full repository passed at 275 files / 1,449 tests. Full TypeScript, scoped transport lint, independent transport adversarial review, and whitespace/conflict checks passed. A disposable loopback-only PostgreSQL 16.15 run applied the exact corrected `068` then `069` bytes and proved forced RLS/ACLs, default-off controls, request lifecycle, duplicate and compare-and-swap refusal, real independent-session concurrency, ambiguity preservation, and guarded rollback ordering. The runtime run exposed and drove correction of migration `068`'s `CASE` syntax and its rollback dependency guard. The complete current transport and migration hash set is recorded in the server-transport and PostgreSQL acceptance documents. This is local repository and temporary disposable-database evidence only; no provider capture or request, credential implementation, durable Production infrastructure, deployment, shared-database execution, or provider sandbox acceptance occurred.

## Deliberately refused

This contract does not construct `createGuardedFlightProviderAdapter`. That factory represents an external-traffic-capable implementation and requires exact provider and payment bindings. An offline fixture must not pretend to have those capabilities.

The following remain refused or incomplete:

- real traveler resolution or order payloads—the new payload builder accepts names, birth date, title, gender, email, and phone only for fictional adult fixtures covered by exact PII digests and aggregate-claims test receipts; identity-document-required offers remain refused;
- real passenger-bearing capture or persistence—the synthetic repository record deliberately contains canonical Base64 response bytes for exact rehydration tests, but real provider or traveler data remains unauthorized until privacy, logging, access, retention, and deletion controls are implemented and accepted;
- travelers under 18—the current search model has counts but no exact ages, and Duffel recommends ages for under-18 travelers;
- customer payment collection, Duffel Balance funding or settlement execution, holds, cards, airline credit, ARC/BSP, Payment Intents, or payment webhooks; the provider-balance object is an immutable offline binding only;
- create-order transport and the required 130-second client timeout—the server boundary deliberately excludes `create_order`;
- actual implementations of the injected sandbox credential provider, HTTP dispatcher, traffic gate, and authenticated journal database adapter; no environment-variable reader or global-fetch fallback exists;
- a real authenticated provider-response receipt issuer, Production traveler resolver, PII repository, offer-evidence repository, trusted clock, authority verifier, or durable atomic order/ticket finalizer; the repository and trust interfaces are contracts exercised by synthetic test doubles, not deployed infrastructure;
- automatic issue-ticket calls—Duffel does not expose a separate issue-ticket operation matching the current abstraction;
- change and cancellation execution, which require quote/create/explicit-consent/confirm/refetch sequences rather than a single order-ID call;
- webhook registration, a durable secret store, durable idempotency storage, or authoritative per-event payload decoders;
- live airline content, live balance funding, Production, or advertising authority.

The sanitized order artifact records only that a bounded booking reference was present. It neither returns nor persists the raw reference or an unsalted deterministic digest. Provider identifiers, raw-body hashes, stored synthetic response bytes, and exact traveler PII digests remain sensitive or pseudonymous evidence, not anonymous data. The PII digest is deliberately unkeyed and is only an exact fixture-integrity check. A bare accepted-terms digest is not authority; the offline order plan additionally requires a trusted verifier decision over the exact aggregate claims and their opaque terms, traveler/PII, and settlement receipt digests. Local test doubles authenticate only that aggregate claim shape and binding; they do not prove real traveler consent, the underlying component receipts, provider authority, payment authority, or booking authority.

## Official contract decisions

The baseline follows current official documentation:

- [Making requests and API versioning](https://duffel.com/docs/api/overview/making-requests/versioning)
- [Duffel Airways test mode](https://duffel.com/docs/api/overview/test-mode/duffel-airways)
- [Offer requests](https://duffel.com/docs/api/v2/offer-requests)
- [Offers and refreshed offer retrieval](https://duffel.com/docs/api/offers)
- [Orders](https://duffel.com/docs/api/orders)
- [Response handling](https://duffel.com/docs/api/overview/response-handling)
- [Payments](https://duffel.com/docs/api/v2/payments)
- [Receiving webhooks](https://duffel.com/docs/guides/receiving-webhooks)
- [Webhook events](https://duffel.com/docs/api/v2/webhook-events)
- [Cancellations](https://duffel.com/docs/guides/cancelling-an-order)
- [Changes](https://duffel.com/docs/guides/changing-an-order)
- [Official test scenarios](https://duffel.com/docs/api/overview/test-your-integration)

Important interpretations remain conservative:

- Duffel documents no order-request idempotency header. `x-client-correlation-id` is correlation evidence, not idempotency authority.
- The balance-only baseline treats `200` and `202` as outside its successful result matrix. Both remain manual-review outcomes.
- Duffel documents no webhook timestamp tolerance. The 300-second tolerance is a local policy that must be accepted operationally before traffic.
- Duffel v2 permits additive response fields. Raw parsing enforces byte, encoding, key, structural, and numeric-lexeme limits; projection validates every decision-bearing field, includes reviewed material terms in canonical evidence, and omits non-material additions. Unknown webhook types are quarantined; unsupported material offer or order values are rejected or held for manual review.
- Sanitized real test captures are still required before claiming that this offline decoder matches current provider traffic.

## Next gates

1. Publish the complete local flight foundation and this offline contract only to the approved private backup branch; public repository publication is not authorized.
2. Complete the authorized human Duffel account, business/KYC, Managed Content, United States point-of-sale, airline-content, pricing, balance, support, and commercial review.
3. Review the completed local dependency and disabled boundary, then implement and accept an approved secret store/credential provider, injected HTTP dispatcher, traffic gate, migration-`069` journal adapter, authenticated offer repository, tenant access, retention deletion, keyed PII store/resolver, trusted clock, terms/settlement/PII authority verification, provider-operation receipt issuance, and durable atomic finalizer. Never expose a token or real traveler payload to browser code, logs, fixtures, or repository evidence.
4. Reconcile the remaining provider-neutral change/cancel interfaces with Duffel's actual resource model before constructing a sandbox adapter, and independently review the new create-order bridge before allowing any dispatch path.
5. Review the completed disposable PostgreSQL/concurrency evidence, destroy its temporary cluster after audit, and consider isolated Preview application only through a separately approved database gate.
6. After separate token and traffic authorization, capture sanitized test-mode evidence for the official no-result, timeout, hold, expiry, price-change, order-error, balance-error, ambiguity, ticket, change, cancellation, and webhook cases.
7. Keep all booking, payment, ticketing, servicing, email, provider, and Production authorities off until every prior gate passes.

No "book flights" advertising is authorized by this package.

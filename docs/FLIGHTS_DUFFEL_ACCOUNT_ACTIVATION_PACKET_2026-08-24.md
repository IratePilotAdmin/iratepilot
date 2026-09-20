# Flights Duffel Account Activation Packet — 2026-08-24

Status: **local preparation only; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; default-off/HOLD; this documentation gate created no account, contacted no provider, submitted no form, sent no email, read or accepted no credential, made no provider request, applied nothing to shared, Preview, or Production databases, and authorized no booking, payment, ticket, deployment, or advertising; broader external state is not established by repository evidence**

## Purpose and boundary

This packet prepares the business, commercial, security, and operational information needed for a future Duffel account and Managed Content diligence gate. It is not an application, provider contact, contract acceptance, KYC submission, sandbox authorization, payment decision, or Production approval.

Never add identity documents, dates of birth, tax identifiers, registration documents, residential addresses, ownership percentages, bank details, card details, credentials, or private contact information to this repository. An authorized business representative must provide sensitive KYC information only through Duffel's verified secure account flow after a separate approval.

## Repository-supported public facts — confirm before submission

| Field | Current repository value | Evidence classification |
| --- | --- | --- |
| Trading name | `iRatePilot` | Public site configuration |
| Legal name | `IRATEPILOT GROUP, LLC` | Public site configuration; must be confirmed against formation records |
| Entity type | LLC | Inferred from the public legal name; not KYC evidence |
| Website | `https://www.iratepilot.com` | Public repository URL and application fallback/listing; ownership, control, and live status require external confirmation |
| General support email | `support@iratepilot.com` | Public support mailbox; not yet designated as the Duffel account owner |
| Intended point of sale | United States | Internal flight launch scope; not provider-confirmed |
| Initial traveler scope | One to nine adults; one-way and round-trip itineraries | Proposed product scope only |
| Provider path | Duffel Managed Content | Internal preferred diligence path; no agreement exists |
| Currency | USD | Narrow offline Duffel Airways test profile; not an account settlement decision |
| Payment direction | Existing customer-payment processor plus separately funded Duffel Balance | Working assumption only; Finance, Legal, Risk, and Duffel have not approved it |

## Owner-supplied KYC inputs — secure flow only

An authorized representative must collect and verify these items outside the repository:

- [ ] Exact legal name and any registered trading names.
- [ ] Formation jurisdiction, entity type, registration number, formation date, and current good-standing evidence.
- [ ] Tax/EIN information required for the applicable jurisdiction.
- [ ] Registered, operating, and mailing addresses.
- [ ] Authorized representative's legal identity, title, business authority, business email, and phone.
- [ ] Directors, controllers, and beneficial owners required by Duffel's KYC flow, including secure identity evidence.
- [ ] Business bank and billing information requested through the verified account flow.
- [ ] Confirmation that `support@iratepilot.com` or another protected mailbox will own the account, plus named recovery administrators and MFA policy.

No checkbox above may be marked complete from repository text alone.

## Commercial scope to decide before contact

- [ ] Confirm United States as the initial point of sale and identify any excluded states or traveler markets.
- [ ] Define launch routes, origin markets, destination markets, intended airlines, cabin classes, and exclusions.
- [ ] Provide expected monthly searches, bookings, gross booking value, average and maximum order value, currencies, refund volume, and launch date range.
- [ ] Confirm whether Managed Content will supply accreditation, airline agreements, issuing, and ticketing authority.
- [ ] Ask Duffel to identify the exact airlines and content sources available to this account and point of sale, including any airline-specific activation.
- [ ] Obtain the complete account-specific fee schedule, search-to-order limits, minimums, deposits, reserves, FX charges, support fees, servicing fees, incentives, and termination costs.
- [ ] Confirm permitted markup, discount, disclosure, caching, display, fare-rule, baggage, and operating-carrier practices.
- [ ] Choose the customer-payment and supplier-settlement model only after Finance, Legal, Risk, and Duffel approve it.

## Payment decision gate

Evaluate both paths without enabling either:

### Customer collection plus Duffel Balance

- The business collects customer funds through its separately approved payment processor.
- Duffel Balance is prefunded by bank transfer for supplier settlement.
- The business must approve cash-flow, low-balance controls, refund timing, processor fees, fraud, chargebacks, reconciliation, taxes, and customer-payment liability.

### Pay By Card

- Treat Pay By Card as unavailable until Duffel confirms account eligibility and written terms.
- Confirm whose card may be used, amount and currency rules, fees, markup or discount constraints, and applicable PCI, 3DS, fraud, chargeback, and merchant-of-record responsibilities; do not assume direct traveler-card support.
- Chargeback, fraud, fines, debit-memo, consent, stored-card, and merchant-of-record responsibilities must be accepted in writing.

Do not select a path from software convenience alone.

## Operational evidence required before sandbox traffic

- [ ] Named first-line traveler support owner, staffed coverage hours, after-hours disruption plan, and Duffel escalation path.
- [ ] Change, cancellation, void, exchange, refund, unused-ticket, airline-change, and stranded-traveler procedures.
- [ ] Passenger-data map, controller/processor roles, privacy notice, retention/deletion schedule, legal holds, DSAR handling, and breach response.
- [ ] Fraud, 3DS, manual review, chargeback, dispute, refund, and debit-memo ownership.
- [ ] Flight-specific terms, fare/baggage/operating-carrier disclosures, consent evidence, accessibility assistance, and advertising review.
- [ ] Monitoring, on-call, webhook-lag, order/ticket/refund alerts, incident response, rollback, and provider-outage runbooks.
- [ ] Provider/payment/bank/general-ledger reconciliation, daily close, fees, taxes, aging, and exception ownership.
- [ ] Approved confirmation, schedule-change, cancellation, and refund communications with delivery, bounce, complaint, and support-routing evidence.

## Technical readiness evidence available now

- Provider-neutral commerce, lifecycle, runtime-authority, ambiguity, reconciliation, and adapter contracts are locally verified.
- Migrations `202608230068` and `202608240069`, their guarded rollbacks, and their bootstrap-schema mirrors remain unapplied to shared, Preview, and Production databases and have no application-environment receipt. Their exact corrected bytes passed a disposable loopback-only PostgreSQL 16.15 install, behavior, real independent-session concurrency, and clean-rollback gate. The run proved forced RLS/ACLs, default-off controls, lifecycle and ambiguity states, duplicate and stale-CAS refusal, and guarded `069` then `068` rollback order. It also exposed and drove correction of migration `068`'s `CASE` syntax and parent rollback dependency guard. The disposable cluster and databases are temporary and are destroyed after audit.
- The frozen offline Duffel v2 contract and `offline_hold_only` bridge remain non-executable, credential-free, and default-denied. A separate Node-only test transport boundary now exists, but its no-argument default path is a disabled singleton that captures zero capabilities and its explicit injected test factory has no application use site.
- Every one of the three transport-boundary modules begins with the exact `import "server-only";` poison pill. The test-only boundary accepts only branded `create_offer_request`, `retrieve_offer`, and `list_orders_by_offer` plans; `create_order` is structurally refused. It fixes the origin at `https://api.duffel.com`, accepts only the `duffel_test_...` token shape, bounds exact response bytes, and never automatically retries.
- No credential provider, secret-store reader, HTTP dispatcher, traffic gate, migration-`069` journal database adapter, environment-variable reader, global-fetch fallback, route, or application use site exists. The exact `server-only@0.0.1` dependency is pinned in the npm manifests and installed locally from its integrity-verified official npm tarball. Ordinary ESM and CommonJS loading triggers the intended poison pill; the `react-server` condition resolves its empty server entry. This is not a deployment or provider-integration receipt.
- Migration `069` is forced-RLS, service-role-only, digest-only, and compare-and-swap guarded. It permits the same three shopping operations, excludes `create_order`, and preserves post-claim uncertainty as `ambiguous` without retry authority. It exact-matches opaque receipt digests but does not authenticate or mint them.
- The bridge requires one trusted verifier decision over exact aggregate claims containing opaque traveler/PII, terms-acceptance, and provider-balance settlement receipt digests. Local test doubles do not independently authenticate the underlying component receipt services, and no Production verifier or receipt issuer exists.
- The previously frozen Duffel contract plus offline bridge verification passed at `2 files / 19 tests`. The frozen server-transport boundary passed at `2 files / 28 tests`, the independent transport/contract/migration compatibility gate passed at `4 files / 50 tests`, the final combined flight suite passed at `34 files / 290 tests`, and the full repository passed at `275 files / 1,449 tests`. Full TypeScript, scoped transport lint, independent transport adversarial review, and whitespace/conflict checks passed. The complete current transport, migration, and disposable runtime evidence is recorded in the server-transport and PostgreSQL acceptance documents.
- Exact frozen SHA-256 for `lib/flights/duffel-sandbox-contract.ts`: `FB55AFBA8A2C1C97D2343535BCB29B78CA6F36E02A9D0E4E851DC699FA81C057`.
- Exact frozen SHA-256 for `tests/flight-duffel-sandbox-contract.test.ts`: `B381020770427F2B3517F4B355DFED291257D505C676767D09011F14EEC71601`.
- Exact frozen SHA-256 for `lib/flights/duffel-sandbox-bridge.ts`: `A35EB52B59A79925BB4C8DC68DB1A267474056BAE990F0E22CC6AEDDC37C02B0`.
- Exact frozen SHA-256 for `tests/flight-duffel-sandbox-bridge.test.ts`: `2EF42E24E5E78FB1F8D71176288C2ADB4AEE6874332BC1C4B0B20B03BC4F7AC6`.
- No live or sandbox token was read, and no account, provider contact, registered webhook, provider traffic, real passenger data, payment, booking, ticket, email, deployment, environment or privilege change, database application, Production change, or advertising is authorized by this evidence. Repository publication is authorized only to the private backup branch; public publication is not authorized.

## Questions for Duffel

1. Is `IRATEPILOT GROUP, LLC`, with a United States point of sale and the proposed consumer travel model, eligible for Managed Content?
2. Which exact airlines, content sources, cabins, routes, currencies, ancillaries, holds, changes, cancellations, and refunds would be enabled initially?
3. What additional airline approvals, deposits, reserves, volume commitments, search-to-order limits, or geographic restrictions apply?
4. Which settlement path is available and recommended for this model: Duffel Balance, approved Pay By Card, or another account-specific arrangement?
5. What are the exact fees, markup restrictions, merchant-of-record roles, fraud/chargeback responsibilities, refund timing, and reconciliation exports?
6. What sandbox/certification scenarios, webhook requirements, security review, privacy documentation, support coverage, and operational acceptance are required before live access?
7. What support and escalation coverage does Duffel provide, and what first-line/after-hours coverage must iRatePilot provide?
8. What contract, DPA, subprocessors, retention, residency, breach-notification, audit, and termination/data-return terms apply?

## Draft first-contact message — do not send without approval

Sender identity and authority are unverified placeholders; separate approval does not itself establish authority.

Subject: Managed Content eligibility and U.S. flight-selling diligence for iRatePilot

Hello Duffel team,

IRATEPILOT GROUP, LLC, trading as iRatePilot, is evaluating Duffel Managed Content for a narrowly scoped United States flight-selling pilot.

Before creating credentials or sending provider traffic, we would like to confirm eligibility and the appropriate commercial path. Our proposed initial scope is one-way and round-trip travel for adult passengers on provider-supported airlines and routes. We are evaluating customer payment collection through a customer-payment processor, subject to separate Finance, Legal, Risk, processor, and Duffel approval, with Duffel Balance settlement, while also asking whether Pay By Card is available and suitable.

Could you advise on the KYC and contracting steps, exact airline/content availability for a U.S. point of sale, payment and settlement options, account-specific fees and restrictions, sandbox certification requirements, support responsibilities, and the security/privacy evidence required before live access?

We will provide sensitive business and KYC information only through your verified secure process. This inquiry does not authorize credentials, provider traffic, bookings, payments, or production use.

Thank you,

[AUTHORIZED REPRESENTATIVE NAME]
[TITLE]
IRATEPILOT GROUP, LLC / iRatePilot
[VERIFIED BUSINESS EMAIL]
[BUSINESS PHONE]

## Official references to re-check immediately before any approved contact or submission

- [Getting started and account activation](https://duffel.com/guides/getting-started)
- [Duffel Services Agreement](https://duffel.com/services-agreement)
- [Choosing a payment method](https://duffel.com/docs/guides/choosing-a-payment-method)
- [Test mode](https://duffel.com/docs/api/overview/test-mode)
- [Test your integration](https://duffel.com/docs/api/overview/test-your-integration)

## Decision

`HOLD` — this packet is ready for owner completion and legal/commercial review. The disabled local transport boundary, installed poison-pill dependency, and disposable journal proof do not establish provider acceptance or launch readiness. Do not create an account, contact Duffel, submit KYC, send the draft message, accept terms, create or read credentials, fund a balance, register a webhook, apply a migration to any shared, Preview, or Production database, deploy, enable a route, authorize provider traffic, book, pay, ticket, email a traveler, or advertise flights until each applicable separate gate is approved. Repository publication remains limited to the approved private backup branch; public publication is not authorized.

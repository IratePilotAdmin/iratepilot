# iRatePilot Flights — Staged Provider Path Decision

Recorded: August 19, 2026

Status: **Executive provider-path preference recorded for documentation only; no provider contact or external action authorized**

## Decision

iRatePilot will use the following staged direction for future diligence and commercial planning:

1. **Duffel — primary intended launch path.** Advance Duffel first for attributable diligence concerning United States managed content, accreditation and ticketing authority, airline coverage, shopping, orders, servicing, settlement, support, security, privacy, and commercial terms.
2. **Sabre — secondary intended expansion path.** Preserve Sabre as the later enterprise/GDS expansion path for additional content, resilience, and capability only after the primary path is independently validated and a separate expansion need is approved.

This sequence does not authorize simultaneous dual-provider launch. Travelport+ remains a researched alternative, not an active path under this decision. Amadeus Self-Service remains a benchmark only.

## Why the path is staged

The public-evidence matrix recorded Duffel at 76/100, Travelport+ at 75/100, and Sabre at 69/100. Those provisional totals are not decision-grade and did not select a supplier. They informed only the order in which iRatePilot intends to perform future diligence.

Duffel's documented Managed Content path may reduce the early accreditation and ticketing barrier. Sabre's documented marketplace and Offers and Orders capabilities may provide a later enterprise expansion option. Starting with one primary path avoids premature dual-provider complexity across:

- duplicate and conflicting offers;
- fare and ancillary normalization;
- provider provenance and display rules;
- price revalidation and booking ownership;
- ticketing, settlement, and reconciliation;
- voluntary and involuntary servicing;
- refunds, exchanges, chargebacks, and disputes;
- traveler notifications and support handoffs;
- disruption ownership and stranded-booking coverage; and
- provider-specific failures, fallbacks, and audit evidence.

## Documentation-only boundary

This decision records preference and sequence only. It does not:

- contact Duffel, Sabre, Travelport, Amadeus, an airline, an agency, or a consolidator;
- create a supplier-evaluation case, submission channel, account, application, trial, Sandbox, PCC, ARC/IATA relationship, or support request;
- request, receive, upload, inspect, score, or retain non-public supplier evidence;
- accept terms, sign a contract, negotiate pricing, make a commercial commitment, or select a contracted supplier;
- approve an adapter, SDK, endpoint, webhook, environment variable, secret, database migration, background job, or network request;
- accept credentials or authorize Sandbox or Production traffic;
- search live fares, display provider inventory, create an order, issue a ticket, service a booking, or collect a flight payment; or
- deploy, promote, alias, migrate, configure, or otherwise change Preview or Production.

## Required Duffel gates

Before Duffel can progress beyond a documented primary preference, iRatePilot must separately approve:

1. one-time provider-contact authority, named owner, approved message, channel, disclosures, stop conditions, and no-commitment language;
2. a fixed evidence-request package covering United States content, fees, funding, settlement, merchant and agency roles, fraud, chargebacks, servicing, support, security, privacy, compliance, Sandbox, certification, portability, and exit;
3. an isolated, least-privilege evidence intake and review process under the existing Flights Phase 11 through Phase 17 controls;
4. a formal recommendation and supplier-selection decision after independent review;
5. contract, legal, privacy, security, finance, operations, support, and executive approvals;
6. a separate adapter-build authorization and server-only credential path;
7. Sandbox certification for search, price, order, ticketing, changes, cancellation, refunds, disruptions, reconciliation, fraud, and settlement; and
8. a separate monitored Production-release decision with rollback and incident ownership.

## Required Sabre gates

Sabre remains inactive until the Duffel diligence outcome and the need for a secondary path are separately reviewed. Before any Sabre contact or implementation, iRatePilot must additionally define:

- the coverage or resilience gap that Sabre is intended to solve;
- whether Sabre is a later content expansion, controlled fallback, or migration option;
- agency eligibility, PCC, ARC/IATA or host-agency structure, ticketing and settlement ownership;
- content deduplication, offer provenance, pricing parity, booking ownership, and no-cross-provider-servicing rules;
- commercial viability after accounting for duplicate platform, certification, support, and operations costs; and
- an independent contract, evidence, Sandbox, security, privacy, operations, and Production-release process.

## Reconsideration conditions

The staged preference must return to executive review if public or attributable evidence shows that:

- Duffel cannot provide required United States content, ticketing, servicing, settlement, support, compliance, or acceptable commercial terms;
- Sabre cannot provide the intended expansion capability or creates disproportionate operational complexity;
- legal, privacy, security, financial, seller-of-travel, accreditation, support, or settlement requirements cannot be satisfied;
- the primary provider can meet approved coverage and resilience objectives without a secondary provider; or
- a different authorized provider becomes materially better supported by current, attributable evidence.

## Recorded state

Provider-path preference: `recorded`.

Primary intended path: `duffel`. Secondary intended path: `sabre`. Parallel launch: `not_authorized`.

Formal recommendation: `not_issued`. Contracted supplier selection: `not_selected`. Provider contact: `not_started`. Evidence intake: `closed`. Contract: `not_received`. Account: `not_created`. Credentials: `not_accepted`. Adapter: `not_authorized`. Sandbox and Production traffic: `disabled`. Ticketing and flight payments: `disabled`.

Any provider contact, evidence request, account creation, commercial discussion, formal scoring, recommendation, selection, contract, implementation, credential, Sandbox call, deployment, payment, or Production change requires a new explicit approval.

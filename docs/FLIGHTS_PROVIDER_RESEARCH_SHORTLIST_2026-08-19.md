# iRatePilot Flights — Provider Research and Preliminary Shortlist

Recorded: August 19, 2026

Status: **Public-source research complete; preliminary, unscored shortlist only; no supplier selected or contacted**

## Approved scope

This artifact records read-only market research using official provider documentation. It does not create a supplier-evaluation case, approve the Phase 3 scoring rubric for a formal named evaluation, request or receive supplier evidence, contact a provider, accept terms, create an account, sign a contract, accept credentials, authorize an adapter, enable Sandbox or Production traffic, issue a ticket, or collect a flight payment.

The existing 100-point rubric remains the evaluation framework: content coverage 20%, shopping quality 15%, ticketing authority 15%, servicing depth 20%, commercial fit 10%, security and privacy 10%, and operational support 10%. No points were assigned because public marketing and technical documentation are not sufficient evidence for commercial, security, support, or contractual scoring.

## Preliminary shortlist

The following names are an unordered diligence shortlist, not a recommendation or selection.

### Duffel Managed Content and Flights API

Public evidence indicates:

- managed content can use Duffel's or its partner's IATA/ARC accreditation, ticketing authority, and supplier contracts;
- the provider describes access to more than 300 airlines, including NDC, GDS, and low-cost-carrier content;
- the API exposes offer search, price refresh, order creation, ancillaries, cancellations, voluntary changes, and airline-initiated changes; and
- servicing capability varies by order and airline, and some actions may still require Duffel support or the airline.

Why it remains on the shortlist: the managed-content model could reduce the accreditation and ticketing barrier for an early-stage United States OTA, while its order model broadly matches iRatePilot's planned search, price, order, and servicing boundary.

Required diligence before any recommendation: exact United States point-of-sale airline coverage, settlement and funding model, fees and markup rules, chargeback and fraud allocation, support response commitments, disruption handling, refunds and exchanges by carrier, data-processing terms, security evidence, availability commitments, volume requirements, and termination/portability terms.

Official sources:

- [Duffel Managed Content](https://duffel.com/flights/content/managed)
- [Duffel Services Agreement](https://duffel.com/services-agreement)
- [Duffel Orders API](https://duffel.com/docs/api/orders)
- [Duffel Order Changes API](https://duffel.com/docs/api/order-changes)
- [Duffel flight-content overview](https://duffel.com/already-selling-flights)

### Travelport+ JSON APIs

Public evidence indicates:

- Travelport+ combines traditional GDS and NDC content, and Travelport publicly describes more than 470 airlines on the platform;
- its v11 Flights APIs cover search, pricing, booking, ticketing, ancillaries, reservation retrieval, exchanges, voids, and carrier-dependent NDC servicing;
- NDC access requires both Travelport provisioning and registration with each participating airline;
- capability differs between GDS and NDC content, and the documented TripServices API does not provide GDS refunds; and
- access is governed by a developer contract and a content policy that may require a written exception for products in core travel categories.

Why it remains on the shortlist: broad multi-source content and mature booking/ticketing workflows make it an important full-GDS comparison candidate.

Required diligence before any recommendation: written confirmation that iRatePilot's OTA model is permitted under the API/SDK content policy, contracting and PCC requirements, ARC/IATA or host-agency requirements, United States NDC carrier provisioning, ticketing and settlement ownership, GDS refund operating procedure, certification effort, commercial minimums, support coverage, security evidence, and data-use restrictions.

Official sources:

- [Travelport Flights APIs guide](https://support.travelport.com/webhelp/JSONAPIs/Airv11/Content/Air11/General/AirAPIsGuide.htm)
- [Travelport v11 Flights endpoints](https://support.travelport.com/webhelp/jsonapis/airv11/content/air11/General/AirEndpointsList11.htm)
- [Travelport NDC guide](https://developer.travelport.com/docs/flights/ndc/ndc-guide)
- [Travelport exchange, refund, and void guide](https://support.travelport.com/webhelp/jsonapis/airv11/content/air11/General/ExchangeRefundGuide.htm)
- [Travelport API and SDK content policy](https://www.travelport.com/legal-policies/api-and-sdk-content-policy)

### Sabre Offers and Orders APIs

Public evidence indicates:

- Sabre's marketplace publicly describes content from more than 400 airlines;
- its Offers and Orders APIs normalize NDC content across airline implementations;
- the documented flow covers shopping, booking, payment and fulfillment, seats and ancillaries, cancellations, voluntary re-shopping, ticket exchange, and some disruption workflows; and
- carrier implementations still have individual nuances and optional servicing capabilities.

Why it remains on the shortlist: its established agency marketplace and documented offer/order servicing depth make it a useful enterprise-GDS comparison candidate.

Required diligence before any recommendation: startup eligibility, contracting and PCC requirements, ARC/IATA or host-agency path, exact United States traditional/NDC/LCC coverage, ticketing and settlement ownership, certification scope, API and support pricing, minimum commitments, carrier-level servicing matrix, support coverage, security evidence, data-processing terms, and migration/portability terms.

Official sources:

- [Sabre Offers and Orders APIs user guide](https://developer.sabre.com/sites/default/files/2024-06/Sabre%20Offers%20and%20Orders%20APIs%20User%20Guide.pdf)
- [Sabre marketplace coverage statement](https://investors.sabre.com/news-releases/news-release-details/sabre-becomes-first-gds-offer-ndc-content-hawaiian-airlines)

## Benchmark not advanced to the preliminary shortlist

### Amadeus Self-Service Flights APIs

Amadeus remains a useful technical and commercial benchmark for startup-accessible REST APIs and publicly describes flight data from more than 400 airlines. Its official Self-Service documentation states that production Flight Create Orders access requires a consolidator ticket-issuance agreement. It also states that post-ticket changes, cancellations, and refunds are handled offline with that consolidator rather than through the Self-Service APIs.

Because servicing depth carries 20% of the iRatePilot rubric and ticketing authority carries another 15%, the public evidence does not currently justify advancing Amadeus Self-Service into the three-provider preliminary shortlist. Amadeus Enterprise may have different capabilities, but those require request-based access and attributable evidence that is outside this research-only approval.

Official sources:

- [Amadeus Self-Service API guide](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/)
- [Amadeus flight-booking and consolidator FAQ](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/)
- [Amadeus Production access requirements](https://amadeus4dev.github.io/developer-guides/API-Keys/moving-to-production/)

## Evidence gaps shared by every shortlisted provider

Public sources do not establish the terms iRatePilot would actually receive. No provider may be scored, recommended, selected, or integrated until attributable, current evidence is approved for intake and independently reviewed for:

- exact United States airline and fare coverage by distribution source;
- search-to-book economics, booking and servicing fees, deposits, reserves, minimums, incentives, and payment timing;
- merchant-of-record, agency, ticketing, settlement, fraud, chargeback, refund, exchange, schedule-change, and traveler-support ownership;
- ARC/IATA, seller-of-travel, state, consumer-disclosure, tax, privacy, and passenger-data obligations;
- service levels, incident escalation, after-hours operations, disaster recovery, rate limits, and availability;
- security certifications, penetration-test evidence, subprocessors, data residency, retention, deletion, breach notification, and audit rights;
- Sandbox realism, carrier-specific feature matrices, certification requirements, webhook behavior, idempotency, and reconciliation; and
- termination, data export, booking portability, stranded-booking servicing, and transition support.

## Result and next boundary

Research result: `three_provider_preliminary_shortlist_recorded`.

Supplier-selection state: `not_selected`. Supplier-contact state: `not_started`. Contract state: `not_received`. Credentials: `not_accepted`. Sandbox and Production traffic: `disabled`. Ticketing and flight payments: `disabled`.

Any next step involving a provider name, contact, questionnaire, account, non-public document, commercial term, contract, credential, Sandbox call, scoring, recommendation, or selection requires a new explicit approval and must follow the existing Phase 11 through Phase 17 authorization, preflight, intake, review, and execution controls.

# iRatePilot Flights — Provider Public-Evidence Matrix

Recorded: August 19, 2026

Status: **Public-source provisional scoring complete; no recommendation, supplier selection, contact, contract, account, credential, traffic, payment, deployment, or Production authority**

## Scope and scoring rule

This matrix applies the approved planning weights to official public documentation for Duffel, Travelport+, and Sabre. It is a desk-research comparison only. It does not constitute the formal Phase 15 through Phase 17 evidence review, because no provider supplied or attested to the evidence, no contract-specific terms were received, and no independent review session was authorized or opened.

The seven categories retain the Phase 3 weights:

- content coverage: 20 points;
- shopping quality: 15 points;
- ticketing authority: 15 points;
- servicing depth: 20 points;
- commercial fit: 10 points;
- security and privacy: 10 points; and
- operational support: 10 points.

Scores measure how much relevant capability is supported by current official public evidence. Missing, product-ambiguous, carrier-dependent, or contract-dependent evidence reduces provisional points. A reduced score therefore means `not publicly established for iRatePilot`, not `provider cannot do this`.

No threshold, winner, recommendation, or selection is created. Scores expire when the cited source changes and must be replaced—not merely supplemented—by attributable diligence evidence before any commercial decision.

## Provisional score matrix

| Provider | Content /20 | Shopping /15 | Ticketing /15 | Servicing /20 | Commercial /10 | Security /10 | Support /10 | Total /100 | Evidence confidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Duffel | 17 | 13 | 14 | 15 | 7 | 4 | 6 | **76** | Medium |
| Travelport+ | 19 | 14 | 12 | 14 | 3 | 7 | 6 | **75** | Medium |
| Sabre | 18 | 14 | 12 | 15 | 3 | 4 | 3 | **69** | Low–medium |

The one-point difference between Duffel and Travelport+ is not decision-grade. All three totals contain unresolved commercial, security, support, contractual, and carrier-level gaps. The displayed order is mechanical by provisional total and is not a ranking approval or recommendation.

## Duffel — 76/100 provisional

### Public evidence credited

- **Content 17/20:** Duffel publicly describes 300+ airlines across NDC, GDS, and low-cost-carrier content. Managed Content is available for a United States point of sale, but exact iRatePilot carrier, fare, and route coverage is not established.
- **Shopping 13/15:** official APIs cover offer requests, offers, price refresh, ancillaries, orders, conditions, and hold/pay-later behavior. Search performance, fare completeness, duplicate suppression, and bookability under an iRatePilot traffic profile remain unverified.
- **Ticketing 14/15:** Managed Content uses Duffel's or its partner's IATA/ARC accreditation, ticketing authority, and supplier agreements. Exact airline eligibility, settlement, funding, liability, and ticketing limits require contract evidence.
- **Servicing 15/20:** APIs and operations support cancellations, voluntary changes, airline-initiated changes, and human intervention. The official documentation also states that available actions vary and some cases require Duffel or airline support.
- **Commercial 7/10:** Managed Content reduces the accreditation barrier, and Duffel publicly describes a 0.5% content fee for managed orders plus a plan-dependent booking fee. The full iRatePilot price, reserves, deposits, chargebacks, support fees, and minimums are unknown.
- **Security 4/10:** the public services agreement includes a data-processing addendum and security-policy obligations, but product-specific independent assurance, penetration evidence, subprocessors, residency, retention, deletion, and audit rights were not established in this research.
- **Support 6/10:** Managed Content includes second-line support, Travel Operations handling, and a traveler-assistance path. Contracted hours, service levels, escalation, incident response, and disruption capacity remain unknown.

Official evidence:

- [Managed Content](https://duffel.com/flights/content/managed)
- [ARC/IATA and Managed Content details](https://help.duffel.com/hc/en-gb/articles/360019644700-Do-I-need-to-be-an-ARC-IATA-travel-agent)
- [Flights API orders](https://duffel.com/docs/api/orders)
- [Order management](https://duffel.com/flights/order-management)
- [Airline-initiated changes](https://help.duffel.com/hc/en-gb/articles/6097546432530-Managing-Airline-Initiated-Changes-AIC)
- [Services agreement and data-processing terms](https://duffel.com/services-agreement)

## Travelport+ — 75/100 provisional

### Public evidence credited

- **Content 19/20:** Travelport publicly describes 470+ airlines and combined traditional, NDC, ancillary, low-cost-carrier, hotel, car, and rail content. NDC still requires Travelport provisioning and participating-airline registration, so exact iRatePilot access is unknown.
- **Shopping 14/15:** v11 JSON APIs document search, pricing, fare rules, ancillaries, seats, booking, reservation retrieval, and ticketing workflows for GDS and NDC content. Carrier and source differences remain material.
- **Ticketing 12/15:** the API surface includes ticketing, payment, tickets, documents, voids, and settlement-related workflows, but iRatePilot's PCC, ARC/IATA or host-agency path, ticketing authority, and settlement ownership are not established.
- **Servicing 14/20:** documented workflows include NDC modifications/refunds and GDS exchanges/voids. The official guide states that GDS refunds are not available through the TripServices APIs, and NDC capabilities vary by carrier.
- **Commercial 3/10:** OTA developer access, support, and certification are publicly described, but pricing, minimums, incentives, agency requirements, and settlement terms are not. Travelport's public API/SDK content policy may require a written exception for a product in a core travel category.
- **Security 7/10:** public airline data-protection terms describe TLS 1.2, encryption at rest, privacy-by-design, processor controls, breach handling, and an information-security program aligned to ISO 27001 and PCI DSS. Product- and contract-specific audit evidence remains required.
- **Support 6/10:** developer membership includes support and application certification; certification uses a managed support case and contracted Production access. Contracted response targets and around-the-clock operational coverage remain unknown.

Official evidence:

- [Travelport+ NDC and marketplace content](https://www.travelport.com/products/ndc)
- [Flights APIs guide](https://support.travelport.com/webhelp/JSONAPIs/Airv11/Content/Air11/General/AirAPIsGuide.htm)
- [Flights API references](https://support.travelport.com/webhelp/jsonapis/airv11/content/air11/APIReferences.htm)
- [NDC guide and provisioning requirements](https://developer.travelport.com/docs/flights/ndc/ndc-guide)
- [Exchange, refund, and void guide](https://support.travelport.com/webhelp/jsonapis/airv11/content/air11/General/ExchangeRefundGuide.htm)
- [Developer support and certification](https://legacy.developer.travelport.com/support)
- [Production certification requirements](https://developer.travelport.com/docs/getting-started/ready-to-certify)
- [API and SDK content policy](https://www.travelport.com/legal-policies/api-and-sdk-content-policy)
- [Airline data-protection terms](https://www.travelport.com/legal-policies/airline-data-protection-terms-version-1-1)

## Sabre — 69/100 provisional

### Public evidence credited

- **Content 18/20:** Sabre publicly describes marketplace content from more than 400 airlines and a mixture of traditional, NDC, and other sources. Exact United States access and carrier-level capability for iRatePilot remain unknown.
- **Shopping 14/15:** the Offers and Orders guide documents shopping, offer pricing, orders, seats, ancillaries, and certification/Production endpoints. Carrier implementation differences remain.
- **Ticketing 12/15:** fulfillment and ticket-exchange workflows are documented, but iRatePilot's agency eligibility, PCC, ARC/IATA or host path, settlement, and ticketing authority are not established by public evidence.
- **Servicing 15/20:** the official guide covers cancellation, ancillary servicing, voluntary re-shopping, exchanges, and schedule-change cases. Many functions are carrier-specific or optional.
- **Commercial 3/10:** public evidence does not establish iRatePilot eligibility, API pricing, minimums, incentives, certification costs, or agency commercial terms.
- **Security 4/10:** Sabre reports corporate cybersecurity governance, third-party assessments, PCI assessments, and selected product SOC reports, but the public evidence reviewed does not establish assurance scope for the Offers and Orders APIs or iRatePilot's intended processing.
- **Support 3/10:** developer documentation and certification environments are public, but product-specific onboarding, support hours, escalation targets, incident response, and operational service levels were not established.

Official evidence:

- [Sabre Offers and Orders APIs user guide](https://developer.sabre.com/sites/default/files/2024-06/Sabre%20Offers%20and%20Orders%20APIs%20User%20Guide.pdf)
- [Sabre marketplace coverage statement](https://investors.sabre.com/news-releases/news-release-details/sabre-becomes-first-gds-offer-ndc-content-hawaiian-airlines)
- [Sabre cybersecurity and assurance summary](https://assets.sabre.com/files/Sabre_2023_ESG_Executive_Summary.pdf)

## Required evidence before formal scoring

Every provider remains blocked from formal scoring until accountable reviewers approve and receive a fixed, attributable evidence package containing:

- a dated United States airline/content matrix by NDC, GDS, LCC, and direct source;
- a complete commercial schedule covering all fees, deposits, reserves, minimums, incentives, settlement, refunds, chargebacks, support, and exit costs;
- written agency, ticketing, accreditation, seller-of-travel, settlement, liability, fraud, refund, exchange, disruption, and support ownership;
- carrier-level shopping, booking, ancillary, ticketing, change, cancel, refund, void, exchange, and schedule-change capabilities;
- contracted availability, latency, rate limits, support hours, response targets, incident escalation, disaster recovery, and stranded-booking coverage;
- applicable security reports, penetration evidence, privacy terms, subprocessor list, data flows, residency, retention, deletion, breach notification, and audit rights; and
- Sandbox, certification, webhook, idempotency, reconciliation, migration, portability, termination, and transition requirements.

## Result and fail-closed boundary

Public-evidence scoring state: `provisional_complete`.

Formal evidence-review state: `not_started`. Recommendation: `not_issued`. Supplier selection: `not_selected`. Supplier contact: `not_started`. Contract: `not_received`. Account: `not_created`. Credentials: `not_accepted`. Sandbox and Production traffic: `disabled`. Ticketing and flight payments: `disabled`.

These provisional totals cannot authorize a contact, questionnaire, account, recommendation, selection, contract, adapter, credential, Sandbox call, payment, deployment, or Production change. Each requires a separately approved action-time gate under the existing Flights governance controls.

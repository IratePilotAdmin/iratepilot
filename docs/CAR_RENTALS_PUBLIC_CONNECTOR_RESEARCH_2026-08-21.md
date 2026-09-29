# iRatePilot Car Rentals — Public Connector Capability and Onboarding Research

Prepared: August 21, 2026

Status: **public-source research and provider-neutral shortlist only; no provider selected or contacted**

## Objective

Record current public evidence for Sabre and Travelport car-rental capabilities and onboarding, then prepare a provider-neutral aggregator shortlist for a later internal decision. This document does not authorize supplier contact, messages, forms, calls, applications, contracts, accounts, credentials, external provider traffic, reservations, refunds, payments, migrations, deployment, or Production changes.

## Research method and limits

- Sources were limited to official provider websites, official developer documentation, official public code repositories, and official product material reviewed on August 21, 2026.
- No form was submitted, no account was created, no credential was requested, no API call was made, and no provider was contacted.
- Public documentation proves only that a provider describes a product or workflow. It does not prove iRatePilot eligibility, entitlement, inventory, rates, commercial terms, support, certification, or Production authority.
- Marketing scale claims are recorded only when the provider publishes them and must be verified during a later, separately approved commercial process.
- Rankings below are internal research inferences, not selections, commitments, or endorsements.

## Executive finding

| Track | Public capability finding | Public onboarding finding | Research disposition |
| --- | --- | --- | --- |
| Sabre | Public examples support car search, rate and rules detail, booking, retrieval, modification, and cancellation through REST and SOAP families. | Developer Partner or subscriber relationship, provisioned CERT credentials, testing, and separate contractual Production access are required. | Keep as a technically viable, enterprise secondary connector candidate. Current entitlement and economics remain unverified. |
| Travelport | Universal API publicly documents an end-to-end SOAP/XML vehicle workflow. Travelport's modern public TripServices JSON material does not currently expose a generally available Cars API. | Trial evaluation is possible, but development requires a contract, Pre-Production credentials, certification, and later Production credentials. A written policy exception for a car-rental product is also a critical gate. | Keep as a conditional enterprise candidate only. Do not rely on it until policy eligibility and product path are confirmed in writing. |
| Aggregator | Five public candidates have credible car-rental distribution propositions, but their technical and commercial transparency varies materially. | Every candidate requires a later partner, affiliate, or commercial access process. | Diligence priority: Carnect, CarTrawler, Booking.com Demand API; EconomyBookings and DiscoverCars remain alternates. No aggregator is selected. |

## Sabre public capability research

### Verified public capability

Sabre's official public Postman collection contains vehicle workflows in both REST and SOAP product families. The examples include:

- REST `Get Vehicle Avail` v2 at `POST /v2.0.0/get/vehavail`;
- REST vehicle booking through passenger-record creation;
- Booking Management examples for creating and cancelling a booking containing vehicle content;
- SOAP `GetVehAvailRQ`, `VehPriceCheckRQ`, `GetVehRateDetailsRQ`, and `EnhancedVehBookRQ`;
- location detail, vehicle rules, and reservation modification examples.

The collection also marks older vehicle operations as legacy or deprecated. A future Sabre design must therefore validate the currently entitled operation set and avoid selecting an endpoint only because it appears in a historical example.

Sabre's November 12, 2024 Sabre Red Launchpad Car Content guide separately demonstrates current product support for:

- airport, city, rail-station, address, landmark, and different-drop-off searches;
- car-company, vehicle-type, rate-code, promotion, tour-code, currency, and extras filters;
- location hours, policies, age requirements, drop-off rules, supplier remarks, mandatory charges, and approximate totals;
- booking confirmation, reservation display, date changes, and detail modification.

That guide is user-interface evidence. It does not by itself grant or define iRatePilot API access.

### Public onboarding path

Sabre's Partner Hub states that developers who build and deploy on the Sabre platform must subscribe to the Sabre Developer Partner program. Public Sabre examples show that test access is provisioned rather than anonymous:

1. Establish the applicable Sabre subscriber or Developer Partner relationship.
2. Confirm the exact current car products, markets, content, operations, and commercial eligibility.
3. Receive organization-specific CERT credentials and identifiers, including the applicable PCC or IPCC and authentication artifacts.
4. Complete the required test and certification plan in Sabre's CERT environment.
5. Obtain a separate contractual and operational Production authorization.

Sabre's official workflow repository distinguishes certification/test and Production endpoints, requires provisioned credentials, and warns that Production transactions can affect genuine inventory and incur normal charges.

### Unverified items and conclusion

Public evidence did not establish:

- iRatePilot's eligible car brands, markets, negotiated rates, commissions, or content rights;
- current per-operation entitlement, version support, limits, fees, or support SLA;
- an anonymous or instant self-service car sandbox;
- the exact certification evidence Sabre would require from iRatePilot;
- permission to use third-party content or activate Production.

Research conclusion: **Sabre is technically viable as a secondary car-distribution connector, but it is not plug-and-play.** Its connector remains disabled and at 0 of 10 activation stages until a later provider decision, contact authorization, commercial review, account provisioning, certification, and Production decision are separately approved.

## Travelport public capability research

### Verified public capability

Travelport publicly states that Travelport+ provides access to approximately 130 rental brands through its agent platform and APIs. Its currently documented end-to-end vehicle API is Universal API, also labeled SOAP XML API Services. Public vehicle documentation covers:

- Vehicle Search and Vehicle Matrix;
- supplier and location filtering;
- location lists and details, media, keywords, policies, and rate rules;
- supplier-dependent prices, mandatory charges, pay-now and pay-later details;
- booking into a new or existing Universal Record;
- retrieval, modification, cancellation, and session-based vehicle modification where supported.

The public workflow is materially aligned with iRatePilot's provider-neutral search, policy, quote, reservation, and service vocabulary, but the integration surface is legacy SOAP/XML.

Travelport's current public TripServices developer material exposes modern JSON resources for Flights, Stays, and Pay. It does not presently expose a generally available TripServices Cars product or public Cars developer kit. iRatePilot must not assume that Travelport's modern JSON platform can replace Universal API for cars unless Travelport confirms that in a later authorized process.

### Public onboarding path

Travelport's public Universal API documentation describes the following sequence:

1. A prospective customer may obtain a 30-day Pre-Production Sandbox trial for evaluation.
2. Trial credentials are evaluation-only; Travelport explicitly says development requires a signed contract.
3. After contract finalization, Travelport provides unique Pre-Production credentials, branch or PCC access, and any required supplier provisioning.
4. The application completes Universal API certification across every intended workflow, including vehicle messages.
5. Travelport requests at least 15 business days' notice before a desired move to Production.
6. Production credentials follow certification; major supplier, aggregator, capacity, or workflow changes can require recertification.

Public Pre-Production data can be incomplete or refreshed, prices and availability can differ from Production, performance can be slower, and individual suppliers can require additional provisioning.

### Critical policy constraint

Travelport's current API and SDK Content Policy defines car rental as a Core Category and states that developers may not use Travelport APIs or SDKs to create a Core Category product without an approved written exception. Travelport also reserves discretion to withhold API or SDK access.

This does not prove that iRatePilot is ineligible. It does mean that **written commercial eligibility or an approved exception is a prerequisite** before iRatePilot can rely on Travelport as a car connector.

### Unverified items and conclusion

Public evidence did not establish:

- a generally available TripServices JSON Cars release;
- iRatePilot's policy exception or commercial eligibility;
- exact supplier entitlement, markets, fees, economics, rate limits, or SLA;
- any account, credential, sandbox, certification, or Production access for iRatePilot.

Research conclusion: **Travelport has strong traditional GDS vehicle coverage but is a conditional secondary candidate.** The legacy SOAP/XML surface and written-exception requirement make it unsuitable for assumed near-term activation.

## Provider-neutral aggregator shortlist

### Evaluation criteria

Candidates were compared on:

- OTA and B2B car-rental fit;
- public evidence for search, policy, price, booking, cancellation, and post-booking workflows;
- technical documentation quality and protocol fit;
- availability of isolated testing and launch certification evidence;
- geographic and supplier reach claimed by the provider;
- onboarding, payment, support, legal, and operational unknowns;
- fit with iRatePilot's existing fail-closed, provider-neutral contracts.

### Ranked diligence priority

| Rank | Candidate | Verified public proposition | Key advantage | Material limitation | Disposition |
| ---: | --- | --- | --- | --- | --- |
| 1 | Carnect | Pure B2B distributor with an OTA 2007A SOAP API covering availability, rate rules, reservation, cancellation, retrieval, payment models, test reservations, and launch certification. It publicly describes 500+ supplier partners, 170 countries, and about 30,000 car-rental products or locations. | Most complete inspectable full-lifecycle API and certification evidence in this research set. | SOAP/OTA 2007A requires adapter work; credentials, IP allowlisting, commercial access, backend certification, and frontend certification are required. | Primary aggregator diligence candidate; not selected. |
| 2 | CarTrawler | Enterprise B2B Connect Platform with API, branded booking engine, cross-sell, customer portal, and public mobile SDK support for standalone and in-path rental flows. | Strong enterprise car-rental focus, scale, merchandising, and managed end-to-end experience. | Detailed car API schemas are not publicly exposed in the reviewed official material; identifiers and go-live validation are partner-managed. The announced Expedia Group transaction adds a current ownership-roadmap uncertainty until closing. | Enterprise alternate for deeper diligence; not selected. |
| 3 | Booking.com Demand API | Modern REST/JSON API with downloadable OpenAPI for car search, suppliers, depots, details, and reporting. Stable v3.1 supports search, look, and redirect; v3.2 Beta adds embedded booking and post-booking for approved partners. | Best modern public documentation and cleanest JSON/OpenAPI evidence. Public scale claim: 200+ suppliers, 45,000 locations, 150 countries. | Requires a Managed Affiliate Partner contract and credentials. Full booking is Beta and permissioned. Official guidance says Cars are not available in the Demand API sandbox. | Modern API and redirect/pilot candidate; not selected. |
| 4 | EconomyBookings B2B | Public B2B material describes a REST API for search, details, terms, booking, vouchers, and cancellation, plus white-label and affiliate options. | Publicly described full lifecycle, sandbox onboarding, and revenue-share or net-rate options. | Public schema and endpoint reference were not found; the same official material uses inconsistent supplier-scale figures. | Alternate only, pending evidence quality review. |
| 5 | DiscoverCars B4B | Public B4B and affiliate material offers widgets, Search API, Full API, white label, and in-path options; Full API is described as supporting booking, payment processing, and reporting. | Broad integration choices and a large published supplier footprint. | No public schema, endpoint reference, sandbox specification, certification process, SLA, or allocation of merchant, refund, and support duties was found. | Alternate only, pending evidence quality review. |

### Shortlist result

The provider-neutral shortlist is:

1. **Carnect** — strongest public full-lifecycle and certification evidence;
2. **CarTrawler** — strongest enterprise B2B proposition, with gated technical detail;
3. **Booking.com Demand API** — strongest modern API documentation, with Cars sandbox and Beta-booking constraints.

EconomyBookings and DiscoverCars remain alternates. This ordering is a diligence priority only. No aggregator provider decision has been made, and no activation stage is satisfied by ranking the candidates.

## Questions for any later, separately authorized provider process

Before any provider selection or activation, iRatePilot would need provider-specific answers and evidence for:

- legal eligibility to distribute car rentals in the United States and intended markets;
- minimum volume, accreditation, company-age, financial, or traffic requirements;
- contracted inventory, supplier overlap, geography, currencies, and rate types;
- commission, markup, net-rate, merchant-of-record, settlement, tax, and reconciliation responsibilities;
- deposits, holds, cards, refunds, chargebacks, cancellation, no-show, modification, and after-sales ownership;
- driver, identity, location, payment, and support-data privacy responsibilities;
- insurance and protection-product wording and regulatory allocation;
- sandbox isolation, test inventory, certification, rate limits, uptime, SLA, support, incidents, and rollback;
- accessibility, consumer disclosures, price accuracy, policy display, and complaint handling;
- credential ownership, rotation, recovery, least privilege, logging, and breach response;
- Production approval, limited-pilot constraints, observability, and kill-switch acceptance.

## Effect on activation counters

- Sabre public research: **complete**, but provider decision and all 10 activation stages remain unsatisfied.
- Travelport public research: **complete**, but provider decision and all 10 activation stages remain unsatisfied.
- Aggregator public research and shortlist: **complete**, but no provider is selected and all 10 activation stages remain unsatisfied.
- Live connector activation remains **0 of 3**.
- Accounts remain **0**.
- Sandbox certifications remain **0**.
- External provider requests remain **0**.

## Official source register

### Sabre

- [Sabre official Postman collections repository](https://github.com/SabreDevStudio/postman-collections)
- [Sabre APIs v2023.02 public Postman collection](https://github.com/SabreDevStudio/postman-collections/blob/master/Sabre-APIs/Sabre%20APIs%20v2023.02.postman_collection.json)
- [Sabre APIs Workflows repository](https://github.com/SabreDevStudio/SabreAPIsWorkflows)
- [Sabre Partner Hub](https://partners.sabre.com/)
- [Sabre Developer Partner tiers and onboarding](https://partners.sabre.com/partners/tiers)
- [Sabre Red Launchpad Car Content guide](https://static.marketplace.sabre.com/media/products/SRL/files/26eda8ea-29f0-4efa-a3d3-cb5177ce8634)
- [Sabre API subscriber attachment template, February 2025 revision](https://static.marketplace.sabre.com/media/products/sapi/files/5d3c5a51-1bd5-4d86-9fe7-411ded9f6c73)

### Travelport

- [Travelport products and rental-brand reach](https://www.travelport.com/products)
- [Universal API vehicle shopping and booking workflow](https://support.travelport.com/webhelp/uAPI/Content/Vehicle/Vehicle_Shopping_and_Booking.htm)
- [Universal API vehicle rules](https://support.travelport.com/webhelp/uapi/Content/Vehicle/Vehicle_Rules/Vehicle_Rules.htm)
- [Universal API vehicle booking](https://support.travelport.com/webhelp/uAPI/Content/Vehicle/Vehicle_Booking/Vehicle_Booking.htm)
- [Universal API credentials and access stages](https://support.travelport.com/webhelp/uapi/Content/Getting_Started/Easy_Overview/Getting_Credentials.htm)
- [Universal API certification](https://support.travelport.com/webhelp/uapi/Content/New_Customer_Path/NewCustomer_Certification.htm)
- [Travelport TripServices public developer portal](https://developer.travelport.com/)
- [Travelport current DevKits and downloads](https://developer.travelport.com/resources/devkits-and-downloads)
- [Travelport API and SDK Content Policy](https://www.travelport.com/legal-policies/api-and-sdk-content-policy)

### Aggregator candidates

- [Carnect products and API integration](https://www.carnect.com/get-our-products)
- [Carnect OTA 2007A API documentation](https://doc.carnect.com/ota2007/)
- [Carnect API endpoints](https://doc.carnect.com/ota2007/endpoints.html)
- [Carnect launch certification](https://doc.carnect.com/ota2007/certification_before_product_launch.html)
- [CarTrawler Connect Technology and API](https://corporate.cartrawler.com/en-gb/our-proposition/connect-technology/)
- [CarTrawler Car Rental SDK](https://cartrawler.github.io/)
- [CarTrawler announced Expedia Group transaction](https://corporate.cartrawler.com/en-gb/news-resources/news/cartrawler-news/cartrawler-to-join-expedia-group-as-it-enters-next-phase-of-growth/)
- [Booking.com Demand API car-rental overview](https://developers.booking.com/demand/docs/cars/overview)
- [Booking.com Demand API car reference](https://developers.booking.com/demand/docs/open-api/demand-api/cars)
- [Booking.com Demand API prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites)
- [Booking.com Demand API Cars sandbox limitation](https://developers.booking.com/demand/docs/getting-started/sandbox)
- [EconomyBookings B2B offering](https://www.economybookings.com/s/business-to-business/)
- [DiscoverCars B4B program](https://pages.discovercars.com/b4b)
- [DiscoverCars affiliate technology options](https://www.discovercars.com/affiliate)

## Authorization boundary

This research does not authorize a provider selection or any external step. A separate approval is required before committing or publishing this document, selecting a provider, preparing or sending a message, submitting a form or application, making a call, negotiating or executing terms, creating an account, receiving credentials, making an external request, testing a sandbox, making a reservation, moving money, applying a migration, deploying, or changing Production.

# Flight booking connector catalog

This catalog records the requested provider and GDS adapter surfaces as
**approved candidates** without claiming an account, contract, airline-content
entitlement, credential, or production approval. All nine entries are dark by default:

| ID | Connector surface | Family | Category | Candidate state |
| --- | --- | --- | --- | --- |
| `sabre` | Sabre Offers and Orders | Sabre | GDS | Approved candidate |
| `amadeus` | Amadeus Self-Service Flight APIs | Amadeus | GDS/API | Approved candidate |
| `travelport` | Travelport+ TripServices | Travelport | GDS | Approved candidate |
| `worldspan` | Worldspan host brand | Travelport | GDS host brand | Approved candidate |
| `abacus` | Abacus regional host brand | Sabre | GDS host brand | Approved candidate |
| `galileo` | Galileo host brand | Travelport | GDS host brand | Approved candidate |
| `airgateway` | AirGateway NDC API | NDC aggregator | Aggregator | Approved candidate |
| `verteil` | Verteil NDC API | NDC aggregator | Aggregator | Approved candidate |
| `travelfusion` | TravelFusion Airline NDC API | NDC aggregator | LCC/full-service aggregator | Approved candidate |

The code registry is `lib/flights/booking-connectors.ts`. Each entry has no
configured credentials, no network capability, and no live-traffic support.
The registry also exposes a disabled runtime shell for every entry. The guarded
factory accepts an explicit provider executor and exact runtime bindings only;
authorization, payment, settlement, ticketing, and result validation remain
enforced by the existing flight runtime safety boundary.

## Next activation gate

`lib/flights/connector-activation-readiness.ts` records ten separately owned
activation gates for each connector: provider decision, contract/authority,
credentials, sandbox access, shopping certification, order/ticketing
certification, servicing certification, payment/settlement, security/privacy,
and release approval. The current state is **approved candidate, 0 of 10 for all 9 connectors**.
Even complete checklist evidence does not authorize external traffic, ticketing,
payment, or Production; those capabilities remain explicit runtime and release
decisions.

The candidate-evidence gate is represented by
`lib/flights/connector-candidate-review.ts`: seven attributable evidence
workstreams per connector (corporate authority, content coverage, commercial
economics, ticketing/settlement, servicing/support, security/privacy, and
technical sandbox readiness). The current state is **0 of 7 evidence workstreams
for all 9 approved candidates**, with no shortlist or provider selection.

`lib/flights/connector-public-evidence.ts` records an official-source research
entry for each candidate. These are public capability references only; they do
not verify iRatePilot access, current coverage, contracts, credentials,
ticketing authority, settlement, or Production eligibility. Public research is
not a substitute for provider-supplied or independently reviewed evidence.

`lib/flights/connector-credential-intake.ts` defines five secret-handling gates
for each connector: provider selection, contract authority, secret channel,
sandbox credential receipt, and credential-scope verification. The current
state is **0 of 5 for all 9 connectors**; no secret is stored or tested.

`lib/flights/connector-sandbox-certification.ts` defines six certification
checkpoints per connector: contract mapping, sandbox scope, shopping,
order/ticketing, servicing/reconciliation, and rollback evidence. The current
state is **0 of 6 for all 9 connectors**; sandbox traffic remains disabled.

`lib/flights/connector-routing-readiness.ts` defines six route-planning gates:
candidate scope, coverage matrix, primary route, fallback order, failover
policy, and route release. The current state is **0 of 6 for all 9 connectors**;
the authorized Duffel-primary/Sabre-secondary preference is recorded, but no
operational route is enabled and no fallback order is active.

The route preference is represented by `lib/flights/rollout-route-decision.ts`:
Duffel is primary, Sabre is secondary, and the other eight catalogued
candidates remain alternatives. This is a route preference only; it does not
approve contracts, credentials, sandbox traffic, ticketing, payment, or
Production traffic. The next gate is contract and authority approval.

The next-gate packet is represented by
`lib/flights/rollout-contract-authority.ts`. It opens an eight-checkpoint
contract and authority review for Duffel and keeps the Sabre secondary packet
deferred until the primary path is independently validated. The packet is
plan-only: it cannot sign or accept terms, create an account, receive a
credential, authorize ticketing or payment, enable network traffic, or release
consumer bookings.

The external evidence gate is represented by
`lib/flights/rollout-contract-evidence-intake.ts`. It requires seven
independently attributable evidence items per route packet, starts at **0 of 7
for Duffel and 0 of 7 for Sabre**, and remains blocked until an approved secure
process supplies and reviews the evidence. The intake stores no raw contract,
credential, passenger data, or provider response and cannot accept terms or
authorize any external capability.

The following credential gate is represented by
`lib/flights/rollout-sandbox-credential-readiness.ts`. It defines seven
secret-handling checkpoints, but is explicitly blocked by the contract-evidence
gate and starts at **0 of 7 for both route packets**. It stores no secret,
performs no credential test, and cannot authorize sandbox, ticketing, payment,
or Production traffic.

The following certification gate is represented by
`lib/flights/rollout-sandbox-certification.ts`. It defines eight route-bound
checkpoints for endpoint, shopping, repricing, order/ticketing, payment and
settlement, servicing, and rollback evidence. It starts at **0 of 8 for both
route packets** and is blocked by scoped credential readiness. No sandbox
request, order, ticket, payment, or provider traffic is performed by this
plan.

The following payment gate is represented by
`lib/flights/rollout-payment-settlement-readiness.ts`. It defines nine
checkpoints for customer collection, provider settlement, pricing, binding,
refunds, reconciliation, fraud, PCI, privacy, and payment release. It starts
at **0 of 9 for both route packets** and is blocked by sandbox certification.
It cannot create a Stripe object or charge, move provider funds, issue a
refund, or authorize a consumer booking.

The following security gate is represented by
`lib/flights/rollout-security-privacy-readiness.ts`. It defines eight
checkpoints for data roles, passenger-data minimization, secrets and access,
webhooks, logging, retention, incidents, and security release. It starts at
**0 of 8 for both route packets** and is blocked by payment and settlement
readiness. It cannot authorize passenger data, credential access, webhook
processing, provider traffic, or Production release.

The next support and release gate is represented by
`lib/flights/rollout-support-release-readiness.ts`. It defines eight
checkpoints for support ownership, disruption handling, customer messaging,
service levels, observability, incident stops, controlled Preview scope, and
consumer-release approval. It starts at **0 of 8 for both route packets** and
is blocked by security and privacy readiness. It cannot open support channels,
promote Preview or Production, or authorize consumer booking, ticketing, or
payment.

The following controlled Preview gate is represented by
`lib/flights/rollout-preview-release-readiness.ts`. It defines eight
checkpoints for prerequisite reconciliation, audience and inventory scope,
booking and payment caps, monitoring, on-call coverage, rollback, expiry, and
action-time approval. It starts at **0 of 8 for both route packets** and is
blocked by support and release readiness. It cannot promote an environment or
authorize consumer booking, ticketing, payment, or Production traffic.

The final Production gate is represented by
`lib/flights/rollout-production-release-readiness.ts`. It defines nine
checkpoints for Preview acceptance, provider and payment evidence, security,
support, credential separation, scope and caps, rollback, and action-time
Production approval. It starts at **0 of 9 for both route packets** and is
blocked by controlled Preview acceptance. It cannot deploy, alias, activate a
live credential, or authorize consumer booking, ticketing, payment, or
Production traffic.

The final consumer activation boundary is represented by
`lib/flights/rollout-consumer-launch-activation.ts`. It defines eight
action-time checkpoints for verified release evidence, deployment and alias,
primary-route activation, booking guards, payment/ticketing caps, monitoring,
customer disclosures, and launch approval. It starts at **0 of 8 for both route
packets** and is blocked by Production-release readiness. It cannot deploy,
promote, enable live traffic, create a booking, issue a ticket, or collect a
payment.

Adding a catalog entry does not complete provider onboarding. Each connector
still needs a commercial agreement, approved credentials, airline coverage and
ticketing authority, sandbox certification, servicing/support evidence, payment
and settlement approval, security/privacy review, and a separately approved
release.

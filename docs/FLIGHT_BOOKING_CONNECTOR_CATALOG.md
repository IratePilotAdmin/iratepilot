# Flight booking connector catalog

This catalog records the requested provider and GDS adapter surfaces without
claiming an account, contract, airline-content entitlement, credential, or
production approval. All nine entries are dark by default:

| ID | Connector surface | Family | Category |
| --- | --- | --- | --- |
| `sabre` | Sabre Offers and Orders | Sabre | GDS |
| `amadeus` | Amadeus Self-Service Flight APIs | Amadeus | GDS/API |
| `travelport` | Travelport+ TripServices | Travelport | GDS |
| `worldspan` | Worldspan host brand | Travelport | GDS host brand |
| `abacus` | Abacus regional host brand | Sabre | GDS host brand |
| `galileo` | Galileo host brand | Travelport | GDS host brand |
| `airgateway` | AirGateway NDC API | NDC aggregator | Aggregator |
| `verteil` | Verteil NDC API | NDC aggregator | Aggregator |
| `travelfusion` | TravelFusion Airline NDC API | NDC aggregator | LCC/full-service aggregator |

The code registry is `lib/flights/booking-connectors.ts`. Each entry has no
configured credentials, no network capability, and no live-traffic support.
The guarded factory accepts an explicit provider executor and exact runtime
bindings only; authorization, payment, settlement, ticketing, and result
validation remain enforced by the existing flight runtime safety boundary.

## Next activation gate

`lib/flights/connector-activation-readiness.ts` records ten separately owned
activation gates for each connector: provider decision, contract/authority,
credentials, sandbox access, shopping certification, order/ticketing
certification, servicing certification, payment/settlement, security/privacy,
and release approval. The current state is **0 of 10 for all 9 connectors**.
Even complete checklist evidence does not authorize external traffic, ticketing,
payment, or Production; those capabilities remain explicit runtime and release
decisions.

Adding a catalog entry does not complete provider onboarding. Each connector
still needs a commercial agreement, approved credentials, airline coverage and
ticketing authority, sandbox certification, servicing/support evidence, payment
and settlement approval, security/privacy review, and a separately approved
release.

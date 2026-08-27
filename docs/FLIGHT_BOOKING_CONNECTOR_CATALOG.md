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

Adding a catalog entry does not complete provider onboarding. Each connector
still needs a commercial agreement, approved credentials, airline coverage and
ticketing authority, sandbox certification, servicing/support evidence, payment
and settlement approval, security/privacy review, and a separately approved
release.

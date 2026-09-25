# Hotel channel adapters

## Booking.com: development-only ARI payload builder

`booking-com/ari.ts` converts explicit room-availability and nightly-rate deltas into Booking.com OTA 2003B XML requests. It groups each request by one mapped Booking.com property, update type, and calendar month; rejects duplicate or out-of-range updates; preserves the selected tax basis; and makes no network calls.

This is not a Booking.com connection. The code does not authenticate, dispatch requests, parse provider acknowledgements, ingest or confirm reservations, manage mapping or credentials, or claim partner certification. The public capability route must continue to report no external OTA providers until those flows are implemented and verified.

Booking.com requires a Connectivity Partner relationship and property-granted connection scopes before a provider can manage a property's data. Rates/availability and reservations are separate connection types. See the [Connectivity API overview](https://developers.booking.com/connectivity/docs) and [Connections API](https://developers.booking.com/connectivity/docs/connections-api/connections-overview). The builder follows Booking.com's [availability](https://developers.booking.com/connectivity/docs/ota-hotelavailnotif) and [rate](https://developers.booking.com/connectivity/docs/ota-rateamountnotif) delta request contracts, but these payload fixtures are not provider certification.

## Expedia Group

No Expedia Group property-connectivity adapter is implemented. Expedia Group's lodging Connectivity Hub requires partner onboarding, license and PCI review, integration testing, and a site review before production use. See the [Connectivity Hub](https://developers.expediagroup.com/supply/lodging) and [getting started](https://developers.expediagroup.com/rapid/setup). The separate Rapid API is a traveler-facing booking product and is not a substitute for lodging supply connectivity.

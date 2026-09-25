# Hotel channel adapters

## Booking.com: development-only ARI preparation and test transport

`booking-com/ari.ts` converts explicit room-availability and nightly-rate deltas into Booking.com OTA 2003B XML requests. It groups each request by one mapped Booking.com property, update type, and calendar month; rejects duplicate or out-of-range updates; preserves the selected tax basis; and makes no network calls.

`booking-com/client.ts` adds a guarded **test harness transport**. It accepts only explicitly approved test-property scope, an injected fetcher, and a caller-supplied bearer token; checks the exact provider endpoints; rejects redirects; bounds response size; and parses basic success/error/warning acknowledgements. It has no default network transport and is not wired to the app, a token exchange, a durable queue, booking import, or production configuration. Tests use an in-memory fake response only; they do not contact Booking.com.

This is still not a usable Booking.com connector. There is no account credential storage/token refresh, OTA reservation retrieval and confirmation, durable idempotent queue, property mapping UI, deployed webhook/API integration, or provider certification evidence. The public capability route must continue to report no external OTA providers until those flows are implemented and verified.

Booking.com requires a Connectivity Partner relationship and property-granted connection scopes before a provider can manage a property's data. Rates/availability and reservations are separate connection types. Current authentication uses property-scoped machine accounts and short-lived bearer tokens; endpoint permissions and any required certification must also be in place. See the [Connectivity API overview](https://developers.booking.com/connectivity/docs), [authentication](https://developers.booking.com/connectivity/docs/authentication), [token authentication](https://developers.booking.com/connectivity/docs/token-based-authentication), and [endpoint access requirements](https://developers.booking.com/connectivity/docs/managing-endpoint-access). The builder follows Booking.com's [availability](https://developers.booking.com/connectivity/docs/ota-hotelavailnotif) and [rate](https://developers.booking.com/connectivity/docs/ota-rateamountnotif) delta request contracts, but these payload fixtures are not provider certification.

## Expedia Group

No Expedia Group property-connectivity adapter is implemented. Expedia Group's lodging Connectivity Hub requires partner onboarding, license and PCI review, integration testing, and a site review before production use. See the [Connectivity Hub](https://developers.expediagroup.com/supply/lodging) and [getting started](https://developers.expediagroup.com/rapid/setup). The separate Rapid API is a traveler-facing booking product and is not a substitute for lodging supply connectivity.

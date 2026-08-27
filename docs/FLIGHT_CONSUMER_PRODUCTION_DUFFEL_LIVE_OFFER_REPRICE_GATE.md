# Flight Consumer Production Duffel live-offer reprice gate

This gate adds a server-only contract for retrieving one already-selected Duffel live offer and normalizing its current USD price, airline owner, expiry, and evidence digests. It does not add a route or a default HTTP implementation.

## Authority boundary

An authority is process-local, one-shot, and valid for at most 60 seconds. Issuance requires the existing Production dark runtime, an exact live Duffel account and credential fingerprint match, the dedicated reprice flag, the transaction kill switch, and explicit disabling of shopping, order-plan rehearsal, order, payment, settlement, ticketing, servicing, webhooks, release, and Production traffic. The authority binds the exact provider offer ID (as a digest), its source offer-evidence digest, and the source shopping execution scope.

The adapter is disabled when constructed without dependencies. A transport can be injected only with an authority minted in the same process. The authority is consumed immediately before the single transport invocation and cannot be replayed, including after an ambiguous transport failure.

## Accepted provider evidence

The response must be the exact non-redirected Duffel retrieve-offer URL, HTTP 200, identity-encoded JSON, and no more than 1 MiB. The offer must match the bound ID, explicitly report live mode, be non-partial, remain unexpired, use exact two-decimal USD money, require instant payment, require no passenger identity documents, and include a normalized owner name and optional two-character IATA code.

The returned projection omits raw Duffel offer, airline, account, and credential references. It includes only normalized price/owner/expiry fields and digest-bound authority, request, response, and offer evidence.

## Deliberately closed capabilities

- No default provider dispatcher or automatic retry.
- No Duffel order creation, Stripe request, payment, capture, settlement, ticket, refund, or consumer release.
- No route, environment mutation, persistence, database migration, deployment, or provider call in the focused tests.
- No use of the car-reserved migration range `202608260200`–`202608260207`.

This is an engineering gate only. Enabling the environment flag or adding a real transport remains a separate controlled Production operation.

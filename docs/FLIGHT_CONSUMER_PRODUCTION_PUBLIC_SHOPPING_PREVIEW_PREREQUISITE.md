# Flight Consumer Production public-shopping preview prerequisite

This slice is a code-only, default-off prerequisite. It does not make live
inventory public and it does not authorize a Duffel request, database write,
budget claim, passenger-data intake, order, Stripe request, charge, ticket, or
consumer release.

## Runtime contract

`resolveFlightConsumerProductionPublicShoppingPreviewRuntime` returns an
authorized prerequisite binding only when all of the following are exact:

- the existing Consumer Production dark runtime is authorized;
- `FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED=true`;
- every admin Duffel and Stripe execution lane is explicitly `false`;
- policy and cohort bindings are lowercase SHA-256 digests; and
- `FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA` is a lowercase
  40-character Git commit that exactly matches `VERCEL_GIT_COMMIT_SHA`.

An authorized binding is still non-executable. It records the planned Duffel
shopping operations but exposes an empty `allowedProviderOperations` list and
keeps provider dispatch, persistence, budget claims, consumer exposure, orders,
Stripe, release, booking, payment, settlement, ticketing, and servicing false.
No public route imports or consumes this contract in this slice.

## Order endpoint invariant

`POST /api/flights/orders` is pinned to HTTP 503. The handler has no request
parameter, application import, environment read, network call, provider import,
or payment import. It therefore does not inspect passenger/payment input and
cannot change behavior when runtime flags change. The response is private and
non-cacheable and includes explicit zero-request/zero-authority capabilities.

## Not released by this slice

Public live shopping still requires a separately reviewed transport adapter,
bounded input contract, persistence and budget design, migration and managed
database acceptance, consumer UI wiring, deployment configuration, observability,
and a controlled release gate. Live order creation and charging remain outside
this prerequisite.

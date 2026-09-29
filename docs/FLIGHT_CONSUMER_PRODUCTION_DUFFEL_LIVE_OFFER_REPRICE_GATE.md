# Flight Consumer Production Duffel live-offer refresh-observation gate

This gate adds an admin-only, dark-mode observation for retrieving one exact
Duffel live offer and recording its current USD price, airline owner, expiry,
and evidence digests. It is inventory evidence only: it is not authoritative
checkout pricing and cannot create an order, payment, ticket, refund, servicing
action, or consumer release.

## Authority boundary

An authority is process-local, one-shot, and valid for at most 60 seconds.
Issuance requires the existing Production dark runtime, an exact live Duffel
account and credential fingerprint match, the dedicated reprice flag, the
transaction kill switch, and explicit disabling of dark shopping, public
shopping preview, order-plan rehearsal, shopping-order, Stripe account
preflight, Stripe payment planning, order, payment, settlement, ticketing,
servicing, webhooks, release, and Production traffic. The authority binds the
exact provider offer ID as a domain-separated digest, its source-offer evidence
digest, and the source shopping execution scope.

The raw `off_` value is accepted only as an ephemeral admin request field. It is
hashed before source lookup and never enters a database RPC, table, durable
receipt, application result, or application log. Migration `202608260105`
records only digest-bound sources from the exact successful shopping response.
The refresh journal uses a stable deterministic idempotency digest plus an
immutable prepare/claim/complete CAS. A succeeded attempt can be replayed from
durable evidence with zero provider requests. A dispatching, failed, or
ambiguous attempt can never be reset or automatically retried.

The process-local authority is consumed immediately before one transport
invocation. The closed default transport permits exactly one `GET` to the
authority-generated Duffel retrieve-offer URL, with no redirects, no body, no
credentials forwarding, no cache, and a one-MiB response ceiling. There is no
provider `POST` path.

## Accepted provider evidence

The response must be the exact non-redirected Duffel retrieve-offer URL, HTTP 200, identity-encoded JSON, and no more than 1 MiB. The offer must match the bound ID, explicitly report live mode, be non-partial, remain unexpired, use exact two-decimal USD money, require instant payment, require no passenger identity documents, and include a normalized owner name and optional two-character IATA code.

The returned projection omits raw Duffel offer, airline, account, and credential
references. It includes normalized price/owner/expiry fields and digest-bound
source, request, response, and normalized-offer evidence. Every downstream
authority field, including final-checkout pricing authority, is false.

## Deliberately closed capabilities

- No provider `POST`, no automatic retry, and at most one provider `GET` after a
  successful journal claim.
- No Duffel order creation, Stripe request, payment, capture, settlement, ticket, refund, or consumer release.
- The only route is exact-Origin, JSON-only, bounded, no-store, and admin-only.
- Migration `202608260105` and its rollback are Production-local artifacts with
  status `authored_unapplied`; application authority and Production application
  authority are both `not_granted`.
- This implementation did not apply a database migration, enable an environment
  flag, deploy, or call Duffel or Stripe.
- No use of the car-reserved migration range `202608260200`–`202608260207`.

This is an engineering gate only. Applying migration 105, enabling its flag,
deploying it, or running the live observation each remain separate controlled
Production operations.

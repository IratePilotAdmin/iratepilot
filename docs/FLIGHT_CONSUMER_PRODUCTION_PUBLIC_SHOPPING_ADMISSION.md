# Flight Consumer Production public-shopping admission (Gate 115)

Gate 115 is a code-only, default-off admission and budget prerequisite for a
future authenticated public flight-shopping flow. It does not expose a public
route and it cannot contact Duffel or any other provider.

## Closed authority boundary

The gate requires the existing Production dark runtime and the code-only
public-shopping prerequisite to be valid. It then requires the additional
server-only flag
`FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED=true`. The
repository default remains `false`.

Gate 115 never reuses the prerequisite execution scope. It derives a distinct
persistent-admission scope from the prerequisite scope, migration version,
approved cohort, computed admission-policy digest, single permitted database
operation, and the complete false downstream-authority set. Changing any
budget ceiling or the claim TTL changes both the computed policy digest and
the Gate 115 execution scope.

An authorized Gate 115 runtime may invoke exactly one database operation:
`reserve_flight_consumer_live_public_shopping_admission_v1`. That operation
only makes an append-only budget decision. Provider dispatch, consumer offer
exposure, order, Stripe, booking, payment, capture, refund, settlement,
ticketing, servicing, consumer release, and blind-retry authority remain
structurally false. There is no claim-consume, provider-dispatch, retry, or
budget-release RPC.

The migration requires the reviewed Production-local shopping journal from
101 and the digest-only offer-source journal from 105. It does not apply either
prerequisite and it does not make their provider-capable RPCs public.

## Authentication and data minimization

The untrusted service input contains only a UUID idempotency key and the strict
normalized search contract. The customer UUID is accepted only through a
separate, non-serializable, runtime-branded trusted-identity capability created
from a validated server authentication session. A plain object cannot forge
that capability, and placing a customer UUID in request JSON is rejected as an
unknown key. Gate 115 does not itself authenticate HTTP requests because no
route is wired. A future route must create the capability from its trusted
server session identity; it must never create it from request JSON or treat an
untrusted caller as authenticated.

The contract permits only:

- uppercase origin and destination IATA codes;
- departure and optional return local dates;
- one of four cabin values; and
- one through four adults.

Unknown keys are rejected, including names, email addresses, phone numbers,
passenger details, children, infants, and payment data. Travel must begin from
tomorrow through UTC day 330, and return travel cannot exceed day 330.

The table persists no raw customer UUID, idempotency UUID, airport, date, or
search body. It stores only domain-separated SHA-256 digests, the decision,
bounded counts, a short claim expiry, and a digest receipt. Direct table access
is revoked from `anon`, `authenticated`, and `service_role`; the single
security-definer RPC is granted only to `service_role`, checks `auth.role()`,
and the table has forced RLS. Evidence is append-only.

## Fixed budget policy

Gate 115 deliberately uses small, source-controlled limits:

| Scope | Per minute | Per rolling day |
| --- | ---: | ---: |
| Authenticated subject | 2 | 10 |
| Approved cohort | 10 | 100 |
| Execution scope | 20 | 250 |

The admitted claim expires after 60 seconds. Admission decisions are
serialized with a table lock so concurrent requests cannot overrun a limit.
An admitted claim consumes its minute/day budget even if later work is
ambiguous or never starts. This fail-closed accounting prevents retries from
amplifying live-provider cost. Admitted decisions replay by exact idempotency;
the first refusal in a bounded bucket is persisted and later refusals in that
same bucket reuse its no-authority receipt without consuming budget. A required distributed,
authenticated-subject pre-RPC limiter uses the same fixed ceilings and must
return a digest-bound allow receipt before the database RPC is called; missing,
unavailable, malformed, or refusing limiter evidence fails closed. The limiter
receives digests only, never the raw customer UUID or search.

As a database backstop, repeated over-budget calls are coalesced into one
append-only refusal row per relevant subject/cohort/global minute or day
bucket. Rotating idempotency keys therefore cannot create an arbitrary number
of refusal rows in one exhausted window. The RPC refreshes `clock_timestamp()`
only after acquiring its serialization lock, so a queued call cannot insert an
already-expired 60-second claim.

## Digest binding

The subject digest binds the authenticated customer to the approved execution
scope. The idempotency digest additionally binds the caller UUID. The request
digest is distinct from the future Duffel request-body digest and uses this
domain:

`flight-consumer-production-public-shopping-admission-request-v1`

It binds the Gate 115 execution scope, configured policy, computed
budget-policy digest, cohort, subject, and the fixed-key normalized no-PII
search. SQL independently computes the same budget-policy digest from the
configured policy and its source-controlled ceilings. The RPC also refuses
reuse of one digest across any of its six evidence domains. A later projection
gate must recompute that request digest,
independently construct the exact provider request body, and bind both digests;
it must not treat them as interchangeable.

## Required later gates

Gate 115 alone cannot serve live inventory. A later reviewed gate must bind an
unexpired admitted receipt to a normalized provider request and offer
projection while keeping dispatch separately authorized. Public route wiring,
provider budgets and observability, product/legal approval, managed UAT,
Production migration apply, Production environment configuration, and rollout
approval all remain outside this gate.

The Gate 115 migration and rollback are authored but unapplied. No Production
database, provider, payment, deployment, or environment change is authorized
by this artifact.

# Flight Consumer Production Private-Preview Live Search — Gate 140

Status: code-only, default-off, unapplied, and undeployed. No membership was
provisioned, no database was changed, and no Duffel or Stripe request was made
while authoring or verifying this gate.

## Scope

Gate 140 adds one authenticated Route Handler at
`POST /api/flights/private-preview/live-search`. “Private Preview” means the
Gate 139 digest-bound cohort inside the existing Production dark runtime. It
does **not** mean a Vercel Preview deployment: Gates 115–139 intentionally bind
their evidence to `VERCEL_ENV=production` and the canonical
`https://www.iratepilot.com` origin. The route therefore cannot be enabled in a
Vercel Preview deployment by changing only its route flag.

The route remains missing (`404`) unless the dedicated
`FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED=true` flag is present
and the existing Production dark, admission, dispatch, credential/account,
source-commit, encryption, and transaction-kill-switch bindings all pass.
The dedicated flag is documented as `false` in `.env.example`; no live
environment variable was added or changed by this gate.

## Request boundary

The handler requires all of the following before reading or dispatching the
request:

- exact canonical request URL and `Origin: https://www.iratepilot.com`;
- `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Mode: cors`, and
  `Sec-Fetch-Dest: empty`;
- a cookie header and no `Authorization` header;
- a Supabase user verified through the zero-argument, cookie-backed
  `requireUser()` boundary;
- a canonical UUID `Idempotency-Key`;
- unencoded `application/json` no larger than 2,048 bytes;
- a strict `{ search }` object containing only origin, destination, travel
  dates, cabin, and adult count.

Unknown fields—including names, emails, telephone numbers, passenger identity,
provider identifiers, prices supplied by the caller, and any order or payment
fields—are refused. Request byte buffers are wiped after bounded parsing.

## Trusted workflow

The server-only workflow composes this exact order:

1. cookie-authenticated identity is converted to Gate 115's opaque trusted
   identity capability;
2. Gate 139's distributed limiter checks current private-cohort membership and
   consumes one exact short-lived claim;
3. Gate 115 reserves the matching admission;
4. Gate 119 performs at most one Duffel create-offer-request dispatch and Gate
   116 persists the allowlisted projection with Gate 117 encrypted references;
5. Gate 140's forward RPC derives or replays the exact Gate 139 exposure from
   immutable admission, dispatch, attempt, source-header, and projection
   evidence, closing the post-dispatch crash/retry gap;
6. Gate 139 revalidates current membership and returns only its consumer-safe
   rows;
7. the server groups those rows into a strict public DTO.

Zero offers are a successful complete result. An exact replay never receives a
second provider-dispatch capability. A stale or uncertain provider outcome is
not blindly retried.

## Response boundary

The response contains only local offer IDs, display order, airline display
names/codes, USD minor-unit totals, expiry, change/refund display terms, and
allowlisted segment details. It never serializes provider offer IDs, encrypted
references, database receipts, hashes, subjects, admissions, dispatches,
projection evidence, credentials, PII, order state, or payment state.

Every response is `private, no-store` with `Vary: Cookie, Origin`, CSP,
no-referrer, no-sniff, and frame-denial headers. Authentication and execution
failures are generic. Budget/membership refusal is a generic bounded `429`.

## Authorities that remain false

This gate authorizes only the short-lived Gate 139 private-preview display. It
does not authorize public consumer release, order creation, booking, Stripe
dispatch, payment, capture, refund, settlement, ticketing, servicing, provider
redispatch, or blind retry. The public order hard lock is unchanged.

## Operational blockers

The route is not operational until a separately approved managed-Supabase UAT
replay applies and verifies Gates 115–119, 139, and 140; a cohort membership is
provisioned; the dedicated route flag and existing exact runtime bindings are
approved; and a private deployment acceptance is completed. This gate performs
none of those actions.

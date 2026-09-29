# Flight Consumer Production Private-Preview Foundation — Gate 139

Status: code-only, route-free, and not applied. No membership has been
provisioned. No route, deployment, environment change, database apply, provider
request, Stripe request, order, charge, capture, refund, ticket, or release was
performed by this gate.

## Purpose

Gate 139 supplies the smallest fail-closed persistence boundary needed before a
future authenticated private-cohort search surface can compose Gates 115–119.
It does not expose that surface. It adds:

1. Server-owned append-only membership grant/revoke events bound to the exact
   policy, cohort, and Gate 115 subject digests.
2. A concrete distributed pre-admission limiter using the exact Gate 115 fixed
   budgets: subject `2/minute` and `10/day`, cohort `10/minute` and `100/day`,
   global `20/minute` and `250/day`, with a 60-second claim.
3. One immutable private-preview exposure receipt for an exact current member,
   limiter claim, admitted Gate 115 request, Gate 119 dispatch, succeeded Gate
   101 attempt, Gate 118 source header, and Gate 116 safe projection batch.
4. A bounded, nonterminal stale-dispatch classifier. It never redispatches and
   leaves an already in-flight Gate 119 response able to complete. A resulting
   receipt is marked `late_success_after_stale`.

Migration version `202608260139` is used because the canonical flight lineage
already occupies `202608260120` through `202608260138`. The car-reserved range
`202608260200` through `202608260207` is untouched.

## Evidence and concurrency model

All five Gate 139 tables have forced RLS, no direct grants (including to
`service_role`), and `BEFORE UPDATE OR DELETE` refusal triggers. Only narrowly
named security-definer RPCs are executable by `service_role`.

Membership events use a deterministic membership key and a unique monotonically
increasing sequence. Every grant/revoke, limiter decision, exposure decision,
and authorized read locks membership evidence in the same order. Trusted time
is read after those locks, so a concurrent revoke either precedes the operation
and refuses it or follows an already committed receipt; it cannot be laundered
through an unordered “latest” event.

Allowed limiter claims are serialized and counted from database evidence, not
caller-supplied counters. They recompute the exact Gate 115 admission-policy
digest. Exact allowed replays are collision checked and hard-refused after the
60-second claim expires. Budget or inactive-member
refusals create one digest-only bucket per affected subject/cohort/global time
window; repeated hostile idempotency values do not append unbounded refusal
rows and do not consume budget. Refused RPC receipts return fixed zero counters,
so the refusal boundary does not disclose subject/cohort/global cardinality.

An exposure requires a unique limiter claim and unique admission, dispatch,
shopping attempt, and projection batch. Database validation locks and rechecks
the full evidence chain and exact source/projected/refused counts. Zero source
and zero projected offers are first-class successful evidence, not an excuse to
retry Duffel.

The exposure lifetime is at most two minutes, cannot outlive current membership,
and for nonzero results cannot outlive the earliest stored presentation or
provider-offer expiry. The safe read RPC revalidates the latest membership event
and returns only the existing Gate 116 allowlisted projection fields.

## Stale and late-success semantics

The classifier scans at most 25 expired, still-`dispatching` Gate 119 records per
call using row locks and `SKIP LOCKED`. It appends `stale_ambiguous` evidence but
does not change Gate 101 state. This is intentional:

- Gate 119 already consumed the only provider-dispatch capability, so a replay
  cannot redispatch.
- If ordinary Gate 116 success wins the attempt lock first, no stale row is
  created.
- If classification wins first, the original in-flight response may still
  record its exact Gate 118 header and finish Gate 116. Exposure is then marked
  `late_success_after_stale`.
- An attempt already terminalized as `ambiguous` by Gate 101 is not changed or
  promoted by Gate 139. A future trusted provider-retrieval design would require
  a separate forward migration; Gate 139 does not invent late provider evidence.

## Hard boundaries

The only positive authority is
`private_preview_exposure_authorized = true` for one exact short-lived safe
batch. The following remain structurally false in tables, RPC receipts, and the
TypeScript adapter:

- consumer public release remains false;
- general consumer exposure remains false in Gates 115–119;
- provider redispatch and blind retry;
- order and booking;
- Stripe dispatch and payment;
- capture and refund;
- settlement;
- ticketing and servicing;
- consumer release.

No route or UI imports this foundation. No provider or Stripe call exists in the
runtime adapter. The existing public order hard lock is unchanged.

## Artifacts and verification

- Forward migration:
  `supabase/production-migrations/202608260139_flight_consumer_live_private_preview_foundation.sql`
- Refusing rollback:
  `supabase/production-rollbacks/202608260139_flight_consumer_live_private_preview_foundation.rollback.sql`
- Runtime/persistence adapter:
  `lib/flights/consumer-production/public-shopping-private-preview-foundation.server.ts`
- Exact-stack verifier:
  `scripts/verify-flight-consumer-private-preview-foundation-pglite.mjs`
- Focused tests:
  `tests/flight-consumer-live-private-preview-foundation-migration.test.ts`
  and
  `tests/flight-consumer-production-private-preview-foundation.test.ts`

The PGlite verifier replays exact migrations 101, 102, 105, and 115–119 before
139. It proves direct zero-offer exposure, exact replay/collision, fixed limiter
budgets and bounded refusal evidence, nonterminal stale classification, late
zero-offer success, revocation denial, forced RLS/ACL, immutability, and rollback
refusal. This is local engineering evidence only; it does not replace managed
PostgreSQL/Supabase UAT, an approved database apply, or a route-release review.

Rollback is unconditionally refused. Evidence-bearing policy gates must be
superseded by a reviewed non-regressive forward migration.

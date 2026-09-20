# Flight Consumer Production Duffel offer-source repair — Gate 118

Gate 118 is a narrow, code-and-schema repair. It does not expose a route,
contact Duffel, authorize public shopping, return offers, create an order, or
touch Stripe.

## Defect repaired

Migration 105 declared `source_shopping_attempt_id` as a `RETURNS TABLE`
output and also used that unqualified name in an `ON CONFLICT` inference
target. PostgreSQL resolves the name ambiguously in PL/pgSQL and raises
`42702`; a real dispatching Gate 101 attempt therefore cannot record any Gate
105 offer-source evidence.

Gate 118 preserves the exact migration 105 bytes. Under an `ACCESS EXCLUSIVE`
lock, it discovers the one non-deferrable unique constraint whose ordered keys
are exactly `(source_shopping_attempt_id, offer_id_sha256)`, validates its
backing unique index, and renames it to the stable explicit name
`flight_consumer_duffel_offer_source_attempt_offer_uniq`. The repaired RPC uses
`ON CONFLICT ON CONSTRAINT`, so no output variable can collide with the target.

## Response header and completion invariant

Gate 105 rows alone cannot prove that a response contained zero offers, and a
shopping success previously could be terminalized with a response digest or
offer count different from its recorded source rows. Gate 118 therefore adds
the immutable forced-RLS table
`flight_consumer_live_duffel_offer_source_batches`, keyed by the Gate 101
attempt. Its digest-only header binds:

- the exact shopping execution scope;
- the exact response SHA-256;
- the exact source count, including zero;
- a SHA-256 over the sorted source digest/evidence/expiry set; and
- a separate domain-separated batch receipt SHA-256.

The record RPC writes or exactly replays this header only after every source
row passes its binding checks. A `BEFORE UPDATE` guard on the Gate 101 journal
refuses a `create_offer_request` success unless the header, terminal response,
terminal offer count, total source-row count, and every source scope/response
all agree. This also prevents cross-response and orphan source evidence from
being accepted as a successful shopping result.

Gate 116's pending-source list is replaced in place. It now requires and
recomputes the exact header before returning digest-only sources; the valid
zero-offer case returns an empty list backed by a non-empty header receipt.

While both Gate 101 and Gate 105 tables are `ACCESS EXCLUSIVE` locked, Gate 118
validates every pre-existing succeeded offer request. Safely consistent
history is backfilled deterministically, including zero-offer successes. The
migration refuses in full if any succeeded attempt has a missing, extra,
cross-scope, or cross-response source row.

## Exact replay boundary

For every supplied source, the RPC re-reads the exact stored row and requires
all of these values to match:

- source shopping attempt;
- source shopping execution scope SHA-256;
- source response SHA-256;
- offer ID SHA-256;
- domain-separated source-evidence SHA-256; and
- normalized offer expiry.

An exact replay is accepted. Duplicate inputs and changed scope, response,
offer set, evidence, expiry, batch digest, or terminal count fail atomically.
An empty source set remains a valid exact zero-offer receipt, can be completed
successfully, and Gate 116 lists the resulting empty set only after validating
its header.

## Security and authority

The source and batch tables remain forced-RLS with no table privileges. The
repaired RPC and pending-source list remain `SECURITY DEFINER`, owned by
`postgres`, fixed to the reviewed search path, executable only by
`service_role`, and guarded by `auth.role()`. The completion and immutability
trigger functions have no direct role grants.
Persisted evidence remains digest-only; no raw Duffel offer reference, token,
request body, or response body is added.

All provider dispatch, consumer exposure, order, payment, capture, refund,
settlement, ticketing, servicing, release, and retry authority remains absent.
Authenticated public Duffel transport is a later gate.

## Rollback policy

The rollback is an unconditional fail-closed refusal. Reinstating the prior
function would restore a known unusable RPC, so there is no safe non-regressive
down migration. No evidence is deleted or mutated.

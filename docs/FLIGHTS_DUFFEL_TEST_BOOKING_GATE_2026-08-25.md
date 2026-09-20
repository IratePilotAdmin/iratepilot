# Duffel test-booking gate — 2026-08-25

## Outcome

Passed in the exact approved Preview environment. One and only one Duffel test-mode order
was created and then reconciled read-only. No live booking, live payment, Production
deployment, or real traveler data was used.

The provider order is `ord_0000B9jtKP6zGY0BemFUgN`:

- route: ORD to MIA;
- departure date: 2026-11-05;
- total: USD 94.42;
- payment: paid and not awaiting payment;
- documents: one `electronic_ticket` document; and
- cancellation: not cancelled and no cancellation record present.

The booking reference was not exposed. The read-only reconciliation retained only its
domain-separated SHA-256 digest.

## Dispatch evidence

The guarded request journal contains exactly one `create_order` attempt in the V8 execution
minute:

- journal ID: `102e7351-8093-427f-bab8-ee05d02fc620`;
- terminal state: `succeeded`, revision 2;
- provider HTTP status: 201;
- response size: 5,397 bytes;
- dispatch and completion timestamps recorded; and
- retry authorization: false.

The earlier V6 prepared row `d76f86f7-958a-42b6-8853-ecbe8efe886c` remains at revision 0
with no dispatch or completion timestamp. It was never retried.

## Reconciliation evidence

A Preview-only, nonce-protected GET route made a bounded, no-cache, no-redirect list-orders
request. It uniquely matched the test order and returned only sanitized evidence:

- provider response size: 5,089 bytes;
- provider response SHA-256:
  `0d2f4b39d218b0c42ededa68662549737aa8658e798e825618229e32b1c602c3`;
- external provider read: true;
- external mutation attempted: false; and
- automatic retry attempted: false.

The first reconciliation read failed closed because the passenger-name array contained a
combined full name. Duffel documents that the array values match individual given or family
names. The corrected route sends the two names as separate values. Neither read could create,
change, cancel, or retry an order.

## Contract repairs

The original order route returned a controlled 503 after Duffel's 201 because the local
projection rejected otherwise valid Duffel Airways test data. The first failure fingerprint
matched the exact-millisecond timestamp rejection. The contract now:

- preserves the raw response digest while accepting provider microsecond timestamps;
- compares provider event ordering at shared whole-second precision when Duffel truncates
  `synced_at` or `paid_at`; and
- accepts non-empty 1–64 character electronic-ticket identifiers, including Duffel Airways'
  one-character test identifiers.

Cross-second temporal reversals, empty or oversized identifiers, duplicate documents, and all
existing binding and itinerary checks remain rejected.

Migration `202608250073_flight_duffel_claim_terminal_return` is present in the Preview ledger.
Its rollback-only runtime proof passed on Preview before the migration was atomically applied.
The proof transaction was rolled back; the disposable row is absent. The local PostgreSQL
harness is structurally tested but was not claimed as a local runtime pass because no local
PostgreSQL or Docker runtime was available.

## Closed state

After reconciliation:

- the database execution kill switch is engaged;
- sandbox, live, shopping, order, payment, ticketing, servicing, provider-event, and
  Production-release execution flags are off;
- `FLIGHT_DUFFEL_TEST_BOOKING_ENABLED` is false in Vercel Preview;
- `FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED` remains false;
- the execution nonce and booking authority secret were rotated;
- booking, credential-probe, and reconciliation routes each return 404 even with the current
  rotated nonce while their feature flags are off; and
- `DUFFEL_TEST_ACCESS_TOKEN` remains a sensitive Vercel variable scoped to Preview only.

The final locked Preview deployment is `dpl_5PpHfVdtQUqMC8rTTyRFMQDn7ssd` at
`https://iratepilotadmin-gbayovjqr-irate-pilot.vercel.app`. It is not a Production
deployment.

## Verification

- Full repository tests: 286 files, 1,505 tests passed.
- TypeScript: passed.
- ESLint: no errors; three unrelated pre-existing navigation warnings remain.
- Local production build: passed with webpack. The default local Turbopack build cannot
  traverse the workspace's external `node_modules` symlink.
- Vercel Turbopack Preview build: passed.

## Boundary

This receipt proves a successful synthetic Duffel booking through search, reprice, order
creation, payment acknowledgement, ticket-document receipt, and read-only provider
reconciliation. It does not approve consumer Production launch. Production credentials,
live-provider authorization, end-user payment and disclosure UX, durable consumer order
persistence, support/servicing operations, monitoring, and a final Production release review
remain separate gates.

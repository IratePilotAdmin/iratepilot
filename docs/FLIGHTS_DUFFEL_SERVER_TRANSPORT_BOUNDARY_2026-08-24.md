# Flights Duffel server transport boundary

Date: 2026-08-24
Status: **locally implemented and default-disabled; exact `server-only@0.0.1` dependency installed and poison-pill verified; disposable PostgreSQL 16.15 acceptance passed; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; unused by application code; migrations remain unapplied to shared, Preview, and Production databases; no token read, provider traffic, deployment, booking, payment, ticket, email, Production change, or advertising authority**

## Outcome

This package establishes a narrow Node-only boundary around a possible future Duffel test-mode HTTP connection. It is an implementation boundary, not a configured integration, provider acceptance, sandbox certification, commercial activation, or launch-readiness claim.

The only default construction path, `createDisabledDuffelHttpTransport()`, takes no arguments, returns one frozen disabled singleton, and captures zero traffic, journal, credential, or HTTP capabilities. Its `execute` method still validates that input is a branded offline request plan and then refuses with `traffic_disabled`.

The separate `createDuffelTestHttpTransport(...)` factory requires the exact literal `enabled: true` plus four explicitly injected ports:

- a sandbox traffic gate;
- an authenticated durable request journal compatible with migration `069`;
- a sandbox credential provider; and
- an HTTP dispatcher.

There is no application route or use site for that factory. This package supplies no implementation for any of the four ports and contains no environment-variable reader, secret-store reader, global `fetch` fallback, provider account binding, or configured token.

## Server-only boundary

These three Node modules begin on their first line with the exact poison pill `import "server-only";`:

- `lib/flights/duffel/http-transport.server.ts`
- `lib/flights/duffel/credentials.server.ts`
- `lib/flights/duffel/telemetry.server.ts`

The dependency is pinned exactly as `server-only@0.0.1` in `package.json` and `package-lock.json` and is now installed locally from the exact integrity-verified official npm tarball without changing either manifest. Ordinary ESM and CommonJS loading reached the intended poison pill and threw; loading under the `react-server` condition resolved the package's empty server entry. This is a local boundary receipt only, not a deployment or application-use receipt.

Static boundary checks refuse a client import path and find no `process.env`, `NEXT_PUBLIC`, browser access, global `fetch`, or route-handler export in the reviewed import graph. The transport declares the Node runtime profile and relies on Node byte and cryptographic primitives.

## Exact operation boundary

| Branded offline plan | HTTP shape fixed by the boundary | Transport status |
| --- | --- | --- |
| `create_offer_request` | `POST https://api.duffel.com/air/offer_requests` with the reviewed fixed query | Eligible only through the unused explicit test factory |
| `retrieve_offer` | `GET https://api.duffel.com/air/offers/:offer_id` with available-services retrieval enabled | Eligible only through the unused explicit test factory |
| `list_orders_by_offer` | `GET https://api.duffel.com/air/orders` with exact offer filter and bounded page size | Eligible only through the unused explicit test factory |
| `create_order` | No HTTP shape exists in this boundary | Structurally refused |

Serialized copies, unbranded values, widened origins, altered paths, unsupported operations, altered header requirements, and non-canonical bodies are refused before any injected port is called. The transport adds no provider idempotency key and performs no automatic retry.

## Credential and HTTP restrictions

- Only the syntactic test-token shape `duffel_test_[A-Za-z0-9_-]{16,500}` is accepted. A live-prefixed or generic value is refused. This is shape validation only, not credential provenance or account authority.
- The destination origin is fixed to `https://api.duffel.com`; redirects and cross-origin responses are refused.
- Requests use exact reviewed methods, paths, query values, and headers, with `credentials: "omit"`, `cache: "no-store"`, and redirect refusal.
- Offer-request execution has one 70-second deadline; offer retrieval and order listing have one 30-second deadline. The deadline covers dispatch and response-body iteration.
- Canonical outbound bodies are capped at 65,536 bytes. Inbound bodies are streamed under a 1,048,576-byte cap and a 4,096-chunk cap, with the size checked before copying.
- Response chunks must be ordinary owned-range `Uint8Array` views; proxies, subclasses, shared backing memory, shadowed typed-array slots, and other exotic inputs are refused.
- A response must preserve the expected origin, have an accepted JSON media type, decode as fatal UTF-8, and parse as JSON syntax. The transport does not project provider meaning; the strict offline Duffel decoder remains responsible for semantic validation.
- A successful result stores the exact accepted response bytes as canonical Base64 plus byte count and SHA-256. Raw bytes can be recovered only from a process-local branded result through a fresh-copy accessor that rechecks Base64, length, and digest.
- Error and journal metadata omit tokens, URLs, query values, headers, bodies, passenger data, and provider resource identifiers.

## Traffic and journal ordering

The explicit test-only path is ordered fail-closed:

1. Review the branded offline plan.
2. Obtain an exact authorization receipt from the injected traffic gate.
3. Prepare one exact durable journal attempt.
4. Ask the injected credential provider for a test-shaped token while the attempt is still `prepared`.
5. Claim the exact journal attempt as `dispatching` immediately before the single injected HTTP dispatch.
6. Record a terminal outcome with exact compare-and-swap evidence.

A credential failure or refused dispatch claim can move only a never-dispatched `prepared` attempt to `blocked`. Once the `dispatching` claim succeeds, a 2xx response becomes `succeeded`, a reviewed non-2xx provider response becomes `failed`, and any uncertain dispatch or response condition becomes `ambiguous`. A claimed attempt can never move to `blocked`. A failed or uncertain post-claim outcome is manual-reconciliation-only and is never automatically retried.

## Migration `069`

Migration `202608240069_flight_provider_request_attempts.sql`, its guarded rollback, and its exact `supabase/schema.sql` mirror provide repository-only journal DDL for the three shopping operations. The migration:

- requires the locked runtime-control foundation from migration `068`;
- explicitly refuses `create_order`;
- enables and forces row-level security and exposes its narrow journal procedures only to `service_role`;
- stores digest-only request identity and terminal evidence—never a raw request or response body, URL, credential, PII value, or provider resource identifier;
- exact-matches runtime/provider bindings, expiry, and session-bound opaque receipt digests during prepare and claim;
- uses exact revision compare-and-swap transitions and keeps `retry_authorized = false`; and
- treats the supplied receipt digests as opaque bindings; it neither authenticates nor mints them.

Migration `069` remains unapplied to any shared, Preview, or Production database. It was applied after migration `068` to a disposable loopback-only PostgreSQL 16.15 database and exercised with real independent-session concurrency. That acceptance proved forced RLS and ACLs, default-off controls, exact prepare/claim/complete lifecycle transitions, duplicate refusal, revision compare-and-swap, ambiguity preservation, immutable evidence, and guarded rollback ordering. Its rollback refused to remove the journal when attempt evidence existed, and rollback `068` refused while dependent migration `069` remained installed. The disposable evidence is temporary and is destroyed after audit; it is not an application or deployment receipt.

## Verification record

- Previously frozen offline Duffel contract and bridge: 2 files / 19 tests.
- Final focused transport count: 2 files / 28 tests.
- Final migration-`069` count: 1 file / 8 tests; migrations `068` plus `069`: 2 files / 24 tests.
- Final combined flight count: 34 files / 290 tests.
- Final full-repository count: 275 files / 1,449 tests.
- Independent transport/contract/migration compatibility: 4 files / 50 tests.
- Full TypeScript: passed.
- Scoped transport ESLint: passed.
- Independent transport adversarial review: passed with no remaining blocker.
- Whitespace/conflict checks: passed.
- Frozen `package.json` SHA-256: `1FFFE9013CD0A23D300DDC3E0D4CAF673A404723A8380A9808DCFB28C5A62443`.
- Frozen `package-lock.json` SHA-256: `E49389DB303707360A40352C42DC637868DDADF671FABAD4E25E5059A72A4A89`.
- Frozen `http-transport.server.ts` SHA-256: `249C86A524A32D4F088DAE2803D275D4219A23CB13A3AD54105B601804AE8678`.
- Frozen `credentials.server.ts` SHA-256: `9BF1E86BC46EB1714F2C7D3CD3490A3384A747A1B5898B1E4147885C88F3C79D`.
- Frozen `telemetry.server.ts` SHA-256: `B55EBD3A4EEC86C19742E510976E0805ABFC71CBD5AE2CDF01A1A827562D60E8`.
- Frozen transport test SHA-256: `3F158280ED69EAF3087069BB13B977AEB8AD06C2659945220231B6E477624678`.
- Frozen server-boundary test SHA-256: `66B0A6024B8223B4DA19E9308078C1DE530C5FB0A47FA1D7F82150C4F54439C8`.
- Frozen migration `069` SHA-256: `7E966C4FA6F08A92692787DD82FADD4C0205AF02826342A3902037438B1BD611`.
- Frozen migration-`069` rollback SHA-256: `16FEE4C1E7B4FDCF14A68A06F3E09B43947D7DDE4643B5ED6B30D43F8C6BA30D`.
- Frozen migration `068` SHA-256: `29F8CB9A45F69E7DA23BFFDF185FF6EAAB2A514A35A22DA4AA4B8C91CF08EF7D`.
- Frozen migration-`068` rollback SHA-256: `7013118E4F5A42B8F883F75AAA06ABAEB68C51DD489BE4844CD86A9CC3A6B1AE`.
- Frozen bootstrap-schema SHA-256: `A92CAEF22676EF7C59677FC176566262171DC477B2EF2E82B2ACDEE160AB9340`.
- Frozen migration-`069` test SHA-256: `6CFE13DED9A0B47543C08ADC0B7863230C543C546C17B9932C8454ACBA37F2B2`.

The PostgreSQL run uncovered and drove correction of the migration-`068` `IS DISTINCT FROM (CASE ... END)` syntax and added a migration-`068` rollback guard against removing its foundation while migration `069` remains installed. The corrected exact migration, rollback, and bootstrap-schema bytes were then rerun. Passing local tests and disposable PostgreSQL acceptance do not establish provider acceptance, shared-database acceptance, sandbox acceptance, or Production readiness.

## Hard stops and next gate

This work did not create or contact a Duffel account, read or store a real or sandbox token, send provider traffic, apply a migration to any shared, Preview, or Production database, change a deployed environment or privilege, deploy code, onboard a provider, book a flight, collect or settle a payment, issue a ticket, service an order, send an email, enable Production, or advertise flights. Database work was confined to temporary loopback-only disposable databases. Repository publication is authorized only to the private backup branch; public publication is not authorized.

The next technical gate requires separate approval to implement and independently review the four injected ports while keeping the transport disabled and credential-free, followed by a separately approved isolated Preview migration gate. Provider contact, account/KYC work, credential creation or reading, sandbox traffic, and every booking/payment/ticketing action require their own later gates.

## Decision

`HOLD` — retain the disabled singleton as the only default path. Do not construct the explicit test transport or enable traffic until durable journal, credential provenance, dispatcher behavior, operational controls, and external authorization are separately accepted.

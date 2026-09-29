# Flights Duffel search-only integration boundary

Date: 2026-08-24
Status: **locally implemented; default-disabled; fake-port verified; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; not used by any route; no provider, shared/Preview/Production database, credential, environment, deployment, booking, payment, ticketing, servicing, webhook, or email action occurred**

## Outcome

`lib/flights/duffel/search-only-integration.server.ts` is the smallest application-facing composition layer over the previously accepted server HTTP transport. It does not add a network client, database client, secret reader, environment-variable reader, route handler, provider account, or token.

The no-argument `createDisabledDuffelSandboxSearchOnlyIntegration()` factory is the application-safe default. It returns one frozen singleton, captures no capabilities, and refuses every method with `DuffelSearchOnlyIntegrationDisabledError`.

The separate `createInjectedDuffelSandboxSearchOnlyIntegration(...)` factory can be constructed only with the exact explicit transport dependency record:

- `enabled: true`;
- an injected sandbox traffic gate;
- an injected authenticated request journal compatible with migration `069`;
- an injected sandbox credential source; and
- an injected HTTP dispatcher.

The existing transport validates the exact record, rejects proxies, accessors, missing fields, and extra fields, and captures stable bound port methods. No enabled or positive-authority ambient implementation of any port exists; the only supplied traffic-gate value is deny-all.

## Exact operation surface

| Integration method | Branded contract plan | HTTP eligibility |
| --- | --- | --- |
| `createOfferRequest(search)` | `create_offer_request` | Only after gate authorization, journal preparation, test-token validation, and dispatch CAS |
| `retrieveOffer(evidence)` | `retrieve_offer` | Only for exact process-local sanitized offer evidence through the same chain |
| `listOrdersByOffer(evidence)` | `list_orders_by_offer` | Only for exact process-local post-reprice evidence through the same chain |

There is no generic `execute` method. There are no create-order, change-order, payment, ticketing, servicing, cancellation, webhook, email, or live-mode methods. A widened dependency object that attempts to inject such a capability is refused during construction. Serialized or forged offer evidence is refused before any injected port is called.

`listOrdersByOffer` is a bounded read-only reconciliation query. Its presence does not authorize creating, changing, cancelling, paying, ticketing, or servicing an order.

## Safety chain retained

Every eligible method mints its plan through the offline Duffel contract and then delegates to the accepted transport chain:

1. Review the exact branded plan and fixed Duffel sandbox endpoint profile.
2. Obtain an exact traffic-gate authorization receipt.
3. Prepare one durable migration-`069` attempt.
4. Read and syntactically validate an injected `duffel_test_...` credential.
5. Claim the prepared attempt as `dispatching` by exact compare-and-swap.
6. Make at most one call through the injected dispatcher.
7. Record `succeeded`, `failed`, or `ambiguous` terminal evidence by exact compare-and-swap.

The composition layer cannot bypass, reorder, or replace that sequence because it accepts no transport override and delegates only to the private transport factory. Automatic retry and provider idempotency headers remain absent.

## Local verification

The focused integration test uses only fictional contract fixtures and in-memory fake ports. It proves:

- the default singleton is frozen, stable, and disabled;
- the exact three methods mint the three allowlisted operations;
- all three traverse the injected gate, journal, credential, dispatch-claim, dispatcher, and completion boundary;
- methods produce the fixed reviewed POST/GET URL profiles;
- widened dependency objects and forged offer evidence fail before port use;
- no generic or mutating operation is exposed; and
- the module begins with `import "server-only";` and contains no ambient environment, global-fetch, route, browser, app, or component access.

Focused result at creation: **1 file / 4 tests passed**. Full TypeScript passed. Scoped lint and final diff checks are recorded with the owning task's final verification.

## Hard stops

This layer is not an activation receipt. It did not apply migrations, connect to Preview or Production, read or write a database, read a token, contact Duffel, dispatch HTTP, modify an environment, deploy, create an order, collect or settle money, issue a ticket, service a booking, register or process a webhook, send email, or advertise flights. Repository publication is authorized only to the private backup branch; public publication is not authorized.

The next externally effective step still requires separately approved and independently verified implementations of the injected ports, isolated Preview migration acceptance, approved secret provenance, and explicit sandbox traffic authority. Until those exist, the disabled singleton remains the only application-safe construction path.

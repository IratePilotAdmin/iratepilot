# Flight Consumer Preview Stripe restricted-key runbook

This runbook applies only to the isolated Stripe TEST workflow used by Flight
Consumer Preview. It does not authorize Stripe live mode, Production payments,
Duffel orders, ticket issuance, or consumer release.

## Required Stripe TEST permissions

Create one dedicated restricted key for the iRatePilot flight workflow. Grant
only the main-account permissions required by the implemented adapter:

- Accounts: Read, for the exact account-identity preflight;
- Payment Intents: Write;
- Charges and Refunds: Write.

Leave every connected-account permission and every unlisted resource at None.
The key must start with `rk_test_`; a standard `sk_test_` key is refused.

## Vercel binding

Store all four variables in Vercel **Preview only**:

- `FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY`: the restricted TEST key;
- `FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256`: lowercase SHA-256 of
  the exact key bytes.
- `NEXT_PUBLIC_FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY`: the dedicated
  TEST publishable key used only by the Flight Consumer Preview checkout;
- `FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256`: lowercase SHA-256
  of the exact dedicated publishable-key bytes.

Do not copy the restricted key into Production, Development, source control,
test output, evidence files, tickets, or chat. Remove `STRIPE_SECRET_KEY` from
the Preview environment entirely; an available broad secret disables the
flight runtime. The server validates both dedicated key prefixes and exact
digests before constructing the Stripe SDK client. Flight Consumer Preview
never reads the shared `STRIPE_SECRET_KEY` or
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for payment or checkout work.

## Stripe TEST webhook endpoint

Create a dedicated Stripe TEST endpoint on the main iRatePilot Stripe account.
Do not select connected-account events. Use the stable Preview branch alias so
the endpoint follows later Preview redeployments; do not use the Production
domain or an immutable deployment URL.

The canonical application route is:

```text
/api/flights/preview/webhooks/stripe
```

Subscribe to exactly these four events:

- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

Do not select all events or add nearby PaymentIntent events. The route rejects
unsupported event types with HTTP 400 by design.

The Preview deployment is allowed to remain protected by Vercel
Authentication. Generate a project **Protection Bypass for Automation** secret
and append it to the Stripe endpoint URL because Stripe cannot add the required
Vercel header:

```text
https://<stable-preview-branch-alias>/api/flights/preview/webhooks/stripe?x-vercel-protection-bypass=<automation-bypass-secret>
```

Keep the bypass secret out of source control, evidence, screenshots, command
output, and chat. Treat the complete endpoint URL as a credential. Do not
disable Vercel Authentication merely to make the webhook reachable.

Copy the endpoint-specific Stripe signing secret into
`FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET` in Vercel Preview only. It must
start with `whsec_`, must differ from `STRIPE_WEBHOOK_SECRET`, and requires a
new Preview deployment before the runtime can read it.

The application proxy does not require a Supabase user session for this API
route. The route still fails closed behind the exact Preview environment and
database runtime authority, verifies Stripe's signature against the untouched
raw body, accepts only TEST-mode objects bound to the expected account and
existing order/payment, and never authorizes provider dispatch.

## Safe creation and verification

1. Confirm the stable branch alias points to the exact READY Preview commit
   being tested.
2. Generate or rotate the Vercel automation-bypass secret. A request without
   the bypass must still receive Vercel's authentication redirect. A GET with
   the bypass header must reach the application and return HTTP 405 for this
   POST-only route. Do not print the secret while testing.
3. In Stripe TEST mode, create the endpoint at the credential-bearing URL
   above for events on the main account and select exactly the four events
   listed above.
4. Store the endpoint's `whsec_` signing secret in the dedicated Preview-only
   variable, then redeploy Preview. Never put the Vercel bypass secret in a
   Next.js public environment variable; it belongs only in Vercel protection
   settings and the Stripe endpoint URL.
5. Run the sanitized environment audit and read-only Stripe account probe. The
   database authority must bind the same Stripe account digest before the
   webhook workflow can open.
6. Recheck reachability through the automation bypass. HTTP 405 for GET proves
   Vercel reached the application route; it does not prove Stripe signature or
   database processing.
7. Do not use a generic Stripe dashboard fixture as acceptance evidence. The
   route intentionally rejects fixtures that lack the exact Preview metadata
   and durable order/payment linkage. Run the bounded application canary only
   after its database migration and runtime authority are verified.
8. Prove the authorized, captured, failed, and refunded paths using TEST-mode
   PaymentIntents created by the application. Confirm the corresponding four
   event types have successful HTTP 200 deliveries. Redeliver one completed
   event and confirm the durable replay result without duplicate effects.
9. Confirm adverse events create the expected reconciliation case, all webhook
   responses report `providerDispatchAuthorized: false`, and no live-mode
   Stripe object, Duffel live order, ticket, or public traffic was created.

HTTP 400 means the signature, event type, TEST/account binding, metadata, or
durable payment linkage was rejected and requires operator investigation. HTTP
503 means runtime authority, a dependency, or an active processing lease is
unavailable and is deliberately retryable. HTTP 200 is returned only for a
terminal processed, replayed, or blocked result.

## Acceptance

Before activating Preview, require all of the following:

1. the environment audit passes with the dedicated key and digest;
2. the read-only Stripe account preflight resolves the expected TEST account;
3. the database runtime authority binds the same account digest;
4. the Preview-only webhook endpoint and signing secret are verified;
5. a bounded test canary proves create, authorize, capture, refund, webhook
   deduplication, and recovery behavior with no live-mode objects.

Rotate or revoke the key immediately after any suspected disclosure. Rotation
requires updating the key and digest together, redeploying Preview, rerunning
the preflight, and repeating the bounded canary before reactivation.

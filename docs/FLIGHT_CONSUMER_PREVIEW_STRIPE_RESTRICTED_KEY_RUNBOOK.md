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

Store both variables in Vercel **Preview only**:

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

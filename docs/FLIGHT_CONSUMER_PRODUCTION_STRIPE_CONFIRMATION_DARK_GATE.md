# Flight Consumer Production Stripe confirmation dark gate (109)

The Gate 109 confirmation orchestrator is a server-only, code-only dark-path
artifact. It has no application route, reads no environment variable, embeds no
Stripe transport, sends no Stripe request, and grants no order, capture,
settlement, ticketing, servicing, or consumer-release authority. Its terminal
and reconciliation methods also remain unimported by every application route.

## Client-secret binding

The orchestrator consumes the one-shot client-secret capability produced by
the completed Stripe PaymentIntent-create result. Immediately before any new
handoff capability can be returned, it extracts the `pi_...` identifier from
the secret, computes its raw UTF-8 SHA-256 digest, and constant-time compares it
with the create result's pinned PaymentIntent reference digest. A mismatch
destroys the source capability, returns no client secret, and places the
durably claimed attempt into ambiguity for reconciliation.

## Status transitions

Only `requires_capture` is an authorization success and only `canceled` is
treated as a terminal failure in this gate. Stripe's
`requires_payment_method`, `requires_confirmation`, and `requires_action`
states are intermediate. A verifier-authenticated intermediate observation is
persisted as ambiguous with blind retry still false, so a later trusted Stripe
retrieval or webhook can reconcile the attempt to `requires_capture` or a true
terminal outcome.

The observation verifier remains an injected trusted boundary rather than a
provider implementation in this artifact. Browser assertions are rejected,
and no terminal or reconciliation entry point may be exposed until a concrete,
reviewed Stripe signature/retrieval verifier is independently pinned.

## Mandatory route-release blocker

`confirmationNotAfter` limits only the server-side ephemeral capability. It
cannot revoke a Stripe client secret after that plaintext has reached a
browser. A browser could retain the secret and confirm after the local
deadline, creating a manual-capture authorization hold that this dark gate
would not safely terminalize.

Therefore browser handoff remains route-locked. No public route may expose the
capability until a separately reviewed Stripe-enforced cancellation/expiry
reaper and late-authorization reconciliation path are implemented, tested,
operationally monitored, and explicitly approved. Gate 109 is not
consumer-ready or public-launch authority.

No database apply, environment change, provider call, deployment, or consumer
release is authorized by this document.

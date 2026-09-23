# Commercial sandbox test plan

The local preflight is deliberately network-free. It proves safe configuration only; external supplier, Stripe, and Resend validation requires a later approval gate.

Run `npm run commercial:sandbox-preflight` with sandbox-only environment variables. A passing result must report zero network requests, disabled live transactions, and disabled SynXis traffic.

For the database gate, set `NEXT_PUBLIC_SUPABASE_URL` to the canonical HTTPS URL for a dedicated non-production Supabase project, set `SANDBOX_SUPABASE_PROJECT_REF` to that project's exact reference, and set `SANDBOX_SUPABASE_SERVICE_ROLE_KEY` to exactly the same sandbox-only key configured as `SUPABASE_SERVICE_ROLE_KEY` for the app. Do not copy a production key into either variable. The preflight makes no network requests: matching variables attest the operator's intended configuration but do not independently validate provider-issued credentials or project ownership. Configure Stripe test values only (`sk_test_…`, `pk_test_…`, and a test webhook signing secret) and the Resend webhook signing secret through the secret manager; never commit them or paste them into logs or evidence.

## Later external-sandbox scenarios

1. Search authorized hotel sandbox inventory and validate rates, taxes, policies, and property mapping.
2. Create one supplier sandbox reservation using an idempotency key, then retrieve it from the supplier.
3. Complete Stripe test success, decline, 3DS, duplicate webhook, delayed webhook, and out-of-order webhook scenarios.
4. Verify booking finalization failure triggers a test refund and does not create a payout.
5. Verify an eligible test transfer, failure retry, and transfer reversal against the correct Connect test account.
6. Confirm Resend sent, delivered, delayed, bounced, complained, and suppressed events update the ledgers once.
7. Cancel the supplier sandbox reservation and reconcile inventory, refund, transfer reversal, email, and customer timeline.

Record provider object IDs, timestamps, expected/actual results, and operator. Never store API keys, credentials, card data, or webhook secrets in evidence.

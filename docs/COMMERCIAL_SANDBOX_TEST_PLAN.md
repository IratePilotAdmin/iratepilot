# Commercial sandbox test plan

The local preflight is deliberately network-free. It proves safe configuration only; external supplier, Stripe, and Resend validation requires a later approval gate.

Run `npm run commercial:sandbox-preflight` with sandbox-only environment variables. A passing result must report zero network requests, disabled live transactions, and disabled SynXis traffic.

For the database gate, set `NEXT_PUBLIC_SUPABASE_URL` to the canonical HTTPS URL for a dedicated non-production Supabase project, set `SANDBOX_SUPABASE_PROJECT_REF` to that project's exact reference, and set `SANDBOX_SUPABASE_SERVICE_ROLE_KEY` to exactly the same sandbox-only key configured as `SUPABASE_SERVICE_ROLE_KEY` for the app. Do not copy a production key into either variable. The preflight makes no network requests: matching variables attest the operator's intended configuration but do not independently validate provider-issued credentials or project ownership. Configure Stripe test values only (`sk_test_…`, `pk_test_…`, and a test webhook signing secret) and the Resend webhook signing secret through the secret manager; never commit them or paste them into logs or evidence.

## Gated Vercel Preview setup

Configure the **Preview** environment for the `iratepilotadmin` Vercel project only; do not copy these sandbox values into Production. Add the required server-side values `PILOT_MODE=true`, `ENABLE_TEST_CHECKOUT=true`, `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (test-mode `whsec_…`), `RESEND_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SANDBOX_SUPABASE_SERVICE_ROLE_KEY` (exact same value as the preceding key), and `SANDBOX_SUPABASE_PROJECT_REF`. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) as Preview variables too. Use a dedicated non-production Supabase project; the safety preflight rejects the known production project reference and requires the sandbox attestation values to match.

Keep `NEXT_PUBLIC_PUBLIC_BOOKING`, `ENABLE_LIVE_BOOKING_PAYMENTS`, `ENABLE_LIVE_PARTNER_PAYOUTS`, `ENABLE_LIVE_STRIPE_WEBHOOKS`, and `IRP_PMS_SYNC_ENABLED` unset or false during setup. Do not configure live Stripe keys, production database credentials, live payout flags, or real property traffic in Preview. Run `pnpm run commercial:sandbox-preflight` locally using the exact Preview configuration (without printing environment values); proceed only if all checks pass. Then configure `PREVIEW_SUPABASE_DB_URL` and `PREVIEW_SUPABASE_PROJECT_REF` for the isolated migration runner, review `pnpm run preview:migrations -- --plan`, and only then run the guarded migration reconciliation. The runner checks the target ref, known production ref, remote migration ledger, exact pending set, and Supabase dry-run output before applying the reviewed Preview migrations. A passing preflight does not prove reservation delivery: require a recorded, retrieved test booking round trip before enabling the separately audited connector delivery control.

After changing Preview variables, redeploy the connector branch and verify the deployment commit matches the validated candidate. Vercel Preview authentication should remain enabled. Never post key values into Codex chat, issue trackers, screenshots, or evidence files.

## Later external-sandbox scenarios

1. Search authorized hotel sandbox inventory and validate rates, taxes, policies, and property mapping.
2. Create one supplier sandbox reservation using an idempotency key, then retrieve it from the supplier.
3. Complete Stripe test success, decline, 3DS, duplicate webhook, delayed webhook, and out-of-order webhook scenarios.
4. Verify booking finalization failure triggers a test refund and does not create a payout.
5. Verify an eligible test transfer, failure retry, and transfer reversal against the correct Connect test account.
6. Confirm Resend sent, delivered, delayed, bounced, complained, and suppressed events update the ledgers once.
7. Cancel the supplier sandbox reservation and reconcile inventory, refund, transfer reversal, email, and customer timeline.

Record provider object IDs, timestamps, expected/actual results, and operator. Never store API keys, credentials, card data, or webhook secrets in evidence.

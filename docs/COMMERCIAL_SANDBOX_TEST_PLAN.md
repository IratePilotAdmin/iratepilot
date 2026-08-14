# Commercial sandbox test plan

The local preflight is deliberately network-free. It proves safe configuration only; external supplier, Stripe, and Resend validation requires a later approval gate.

Run `npm run commercial:sandbox-preflight` with sandbox-only environment variables. A passing result must report zero network requests, disabled live transactions, and disabled SynXis traffic.

## Later external-sandbox scenarios

1. Search authorized hotel sandbox inventory and validate rates, taxes, policies, and property mapping.
2. Create one supplier sandbox reservation using an idempotency key, then retrieve it from the supplier.
3. Complete Stripe test success, decline, 3DS, duplicate webhook, delayed webhook, and out-of-order webhook scenarios.
4. Verify booking finalization failure triggers a test refund and does not create a payout.
5. Verify an eligible test transfer, failure retry, and transfer reversal against the correct Connect test account.
6. Confirm Resend sent, delivered, delayed, bounced, complained, and suppressed events update the ledgers once.
7. Cancel the supplier sandbox reservation and reconcile inventory, refund, transfer reversal, email, and customer timeline.

Record provider object IDs, timestamps, expected/actual results, and operator. Never store API keys, credentials, card data, or webhook secrets in evidence.

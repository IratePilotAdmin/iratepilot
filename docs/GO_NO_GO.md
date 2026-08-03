# iRatePilot Private Pilot Go/No-Go Gate

PR #122 must remain in draft until every GO requirement below has objective evidence in `docs/RELEASE_EVIDENCE.md`.

## Automatic NO-GO conditions

Any one of these conditions blocks release:

- Supabase backup is missing.
- A migration from `202608020001` through `202608020025` is missing, failed, or was applied out of order.
- A preflight blocker remains unresolved.
- A required postflight Boolean result is false.
- Row-level security or privileged function permissions fail verification.
- GitHub Actions or the Vercel deployment is failing.
- A critical booking, payment, webhook, cancellation, refund, inventory, authentication, or authorization smoke test fails.
- Stripe is using live credentials.
- Automated partner payouts are enabled.
- Public booking is enabled without explicit pilot approval.
- A Critical or High severity defect remains unresolved.
- Production secrets are exposed in source control, logs, screenshots, comments, or public environment variables.
- No named rollback owner or pilot support owner is available.

## Required GO evidence

### Database

- [ ] Backup recorded
- [ ] Preflight passed
- [ ] All 25 migrations applied in order
- [ ] Schema verification passed
- [ ] Postflight verification passed
- [ ] RLS and function permissions passed

### Application and deployment

- [ ] Exact release candidate commit recorded
- [ ] GitHub Actions passed for that commit
- [ ] Vercel preview passed for that commit
- [ ] Production build passed
- [ ] Required environment variables verified by name and scope without exposing values

### Core marketplace workflow

- [ ] Approved partner can publish a complete property
- [ ] Customer can find only approved, available inventory
- [ ] Customer can submit one valid booking request
- [ ] Partner can approve or reject only its own requests
- [ ] Inventory cannot be oversold during approval
- [ ] Stripe test payment completes
- [ ] Webhook processing is idempotent
- [ ] Customer sees the confirmed trip and payment record

### Servicing workflow

- [ ] Customer and partner can exchange authorized booking messages
- [ ] Unpaid confirmed booking can be cancelled without a refund
- [ ] Paid booking uses the controlled refund workflow
- [ ] Inventory and rewards reconcile after cancellation or refund
- [ ] Email worker requires the configured cron authorization

### Security and operations

- [ ] Customer, partner, and administrator role isolation passed
- [ ] Pilot flags are set correctly
- [ ] Stripe remains in test mode
- [ ] Partner payouts remain disabled
- [ ] Demonstration inventory is clearly identified or removed
- [ ] Support owner and rollback owner recorded

## Decision rule

Choose **GO** only when every required item passes and the release evidence record is complete. Otherwise choose **NO-GO** and keep PR #122 in draft.

## After GO

1. Mark PR #122 ready for review.
2. Obtain final human review of database, payments, and security evidence.
3. Merge using the repository's approved merge method.
4. Verify the production deployment against the merged commit.
5. Repeat the critical smoke tests in production pilot mode.
6. Monitor authentication, booking, webhook, email, and database errors.
7. Roll back or disable pilot entry points immediately if a rollback trigger occurs.

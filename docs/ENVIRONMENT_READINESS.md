# Environment Readiness Checklist

Use this checklist for the PR #122 preview deployment and again before promoting `main` to production.

Do not paste secret values into GitHub issues, pull requests, screenshots, support messages, or this repository.

## 1. Application URL

- [ ] `NEXT_PUBLIC_APP_URL` uses the exact HTTPS preview URL during preview testing.
- [ ] Before production release, change `NEXT_PUBLIC_APP_URL` to the canonical production domain.
- [ ] Supabase authentication redirect URLs include the preview URL used for testing.
- [ ] Supabase authentication redirect URLs include the canonical production domain before launch.
- [ ] Stripe checkout success and cancellation redirects return to the same configured application domain.

## 2. Supabase

Required:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Exactly one public browser key is configured:
  - [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, preferred; or
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`, for a legacy project.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is configured only as a server-side secret.
- [ ] The service-role key is not exposed through any `NEXT_PUBLIC_` variable.
- [ ] Database backup completed before migrations.
- [ ] `supabase/preflight_20260802.sql` completed without unresolved blockers.
- [ ] Migrations `202608020001` through `202608020025` applied in filename order.
- [ ] `supabase/verify_schema.sql` passed.
- [ ] `supabase/postflight_20260802.sql` passed.

## 3. Stripe test mode

Required for the private pilot:

- [ ] `STRIPE_SECRET_KEY` is a test-mode key.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is the matching test-mode publishable key.
- [ ] `STRIPE_WEBHOOK_SECRET` belongs to the webhook endpoint for the current deployment environment.
- [ ] `STRIPE_BASIC_PRICE_ID` is a yearly Basic membership test price for $70/year.
- [ ] `STRIPE_BUSINESS_PRICE_ID` is a yearly Business membership test price for $120/year.
- [ ] Partner Starter, Professional, and Premium test price IDs are configured if partner subscriptions are included in testing.
- [ ] The webhook endpoint receives the required checkout, payment, refund, and subscription lifecycle events.
- [ ] Webhook signature verification succeeds.
- [ ] Replaying a webhook does not create duplicate financial or booking records.

Do not enable live Stripe payments until legal terms, taxes, refund policies, partner contracts, reconciliation, and payout operations are approved.

## 4. Pilot safety flags

Use these values during the controlled pilot:

```text
NEXT_PUBLIC_PUBLIC_BOOKING=false
NEXT_PUBLIC_ENABLE_TEST_CHECKOUT=false
ENABLE_TEST_CHECKOUT=false
PILOT_MODE=true
```

- [ ] Public booking remains disabled until the database and preview tests pass.
- [ ] Test checkout is enabled only for a controlled test window and disabled immediately afterward.
- [ ] `PILOT_MODE` remains enabled for the private pilot.
- [ ] Demonstration properties and inventory are not represented as bookable live supply.

## 5. Transactional email

Required when email delivery is tested:

- [ ] `RESEND_API_KEY` is configured as a server-side secret.
- [ ] Sending domain is verified with the email provider.
- [ ] Sender address belongs to the verified domain.
- [ ] `CRON_SECRET` is a long random secret.
- [ ] Vercel Cron sends the expected authorization value.
- [ ] Manual email-worker requests without the correct secret are rejected.
- [ ] Booking, payment, cancellation, refund, and message emails contain no sensitive internal data.
- [ ] Duplicate worker execution does not send duplicate emails.

## 6. AI features

- [ ] `OPENAI_API_KEY` is configured only if AI features are being tested.
- [ ] The key is server-side only.
- [ ] The application behaves safely when the AI key is absent or the AI service is unavailable.
- [ ] AI output is advisory and cannot independently approve partners, alter payouts, issue refunds, or publish inventory.

## 7. Vercel environment scopes

For every variable:

- [ ] Preview scope is configured for PR testing where required.
- [ ] Production scope is configured separately before launch.
- [ ] Development values are not reused automatically in production.
- [ ] Secrets are marked sensitive.
- [ ] Variables were reviewed for accidental whitespace, quotes, or copied line breaks.
- [ ] A new deployment was triggered after changing variables.

## 8. Access and operational controls

- [ ] Only approved owners or administrators can change production environment variables.
- [ ] Supabase, Stripe, Resend, GitHub, Vercel, and domain accounts use multi-factor authentication.
- [ ] Recovery methods are current and controlled by the business.
- [ ] No contractor or former collaborator retains unnecessary production access.
- [ ] Production secrets have not been committed to Git history.
- [ ] A secret-rotation procedure is documented.

## 9. Release gate

The release remains blocked until all of the following are complete:

- [ ] Latest GitHub Actions CI succeeds.
- [ ] Latest Vercel deployment succeeds.
- [ ] Supabase preflight, migrations, verification, and postflight succeed.
- [ ] Critical scenarios in `docs/PREVIEW_SMOKE_TEST.md` pass.
- [ ] Stripe remains in test mode.
- [ ] Automated partner payouts remain disabled.
- [ ] Rollback owner and decision authority are identified.
- [ ] PR #122 evidence comment records the tested deployment, database result, test accounts used, and pass/fail summary without including secrets.

Only after this gate passes should PR #122 be marked ready for review. Merging the PR does not by itself authorize public launch or live payment processing.

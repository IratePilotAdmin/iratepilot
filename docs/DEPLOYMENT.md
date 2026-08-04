# iRatePilot Deployment

## Consolidated OTA phase

The consolidated OTA feature stack is represented by the latest feature branch and must remain in draft until its database rollout is completed.

### Required order

1. Back up the production Supabase database.
2. Review production data for duplicate open bookings, duplicate pending partner applications, invalid room or inventory values, and unapproved partners with active properties.
3. Apply Supabase migrations `202608020001` through `202608020025` in filename order.
4. Run `supabase/verify_schema.sql` and resolve every reported failure.
5. Configure required Vercel environment variables, including Supabase, Stripe test mode, Resend, and `CRON_SECRET`.
6. Deploy the consolidated branch to a Vercel preview.
7. Test partner application, approval, property creation, room setup, dated inventory, customer registration, search, booking request, partner approval, Stripe test payment, confirmation, messaging, cancellation, and refund.
8. Merge the consolidated pull request only after preview verification.
9. Deploy `main` and repeat the critical smoke tests.

### Production restrictions

- Keep Stripe in test mode until legal, tax, payout, refund, and hotel agreements are approved.
- Do not publish demonstration inventory as real hotel availability.
- Do not enable automated payouts until Stripe Connect onboarding and reconciliation are verified.
- Do not apply migrations out of order.

## Email worker

Generate a high-entropy `CRON_SECRET` in Vercel for the transactional email worker. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/email/process`. Apply migration `202608020020_secure_email_worker.sql` before enabling the production schedule.

The repository uses a Hobby-compatible daily schedule at 08:00 UTC. During the private pilot, urgent queues can be drained by sending an authenticated `POST /api/email/process` for each job. Upgrade the Vercel plan before increasing the automated cadence.

## Partner inventory

Apply migration `202608020021_enforce_future_partner_inventory.sql` before enabling partner rate and inventory management in production. It prevents approved partners from creating or changing inventory for dates that have already passed.

# Deployment

Push to GitHub, import into Vercel, add environment variables, run database migrations, and configure your production domain.

## Private-pilot release gate

Before merging a release branch into `main`:

1. Confirm the production Vercel environment includes `NEXT_PUBLIC_APP_URL`, the Supabase URL and public key, `SUPABASE_SERVICE_ROLE_KEY`, `PILOT_MODE=true`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (or `EMAIL_FROM`), and `CRON_SECRET`.
2. Keep `NEXT_PUBLIC_PUBLIC_BOOKING=false`, `NEXT_PUBLIC_ENABLE_TEST_CHECKOUT=false`, and `ENABLE_TEST_CHECKOUT=false` until the corresponding live-booking or test-payment review is complete.
3. Link the Supabase CLI to the intended production project and run `supabase migration list`. Do not deploy the application when repository migrations are missing from the remote history.
4. Apply pending migrations in filename order with `supabase db push`, then run `supabase migration list` again and verify that local and remote histories match.
5. Verify `/api/health`, partner sign-in, administrator sign-in, property submission, room and inventory setup, and a customer booking request on the release preview.
6. Merge only after GitHub CI, dependency review, CodeQL, and the Vercel preview are green.

Do not paste database passwords, service-role keys, Stripe secrets, email API keys, or `CRON_SECRET` into issues, pull requests, logs, or tracked environment files.

Generate a high-entropy `CRON_SECRET` in Vercel for the transactional email worker. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/email/process`. Apply migration `202608020020_secure_email_worker.sql` before enabling the production schedule.

Apply migration `202608020021_enforce_future_partner_inventory.sql` before enabling partner rate and inventory management in production. It prevents approved partners from creating or changing inventory for dates that have already passed.

The repository uses a Hobby-compatible daily schedule at 08:00 UTC. During the private pilot, urgent queues can be drained by sending an authenticated `POST /api/email/process` for each job. Upgrade the Vercel plan before increasing the automated cadence.

## Verified deployment baseline

Audit date: 2026-08-05

- `iratepilot.com` permanently redirects to `www.iratepilot.com`.
- The public domains currently serve production deployment `dpl_6FVBKbz2yS76gRuvj9fcY3ByFSgy` from `main` commit `5a90b82931795a13d545c77201590905cf487649`.
- Release PR #137 currently targets preview deployment `dpl_9rLKQ8gJ6yXTWydAr9sersVhRPb9` from commit `3f0bb9ffc0edf9e34ba7378b4b54b6e23ed7ac30`.
- GitHub CI, Dependency Review, CodeQL, and the Vercel preview succeeded for that release commit.
- Preview smoke tests passed for `/`, `/partner`, `/admin` (expected sign-in redirect), and `/mobile`, with no browser-console or Vercel runtime errors.
- The current production deployment returns `404` for `/mobile` because that route is part of the unmerged release; this is expected to resolve only after the approved release is promoted.

Do not manually alias the preview deployment to the production domains. Complete the production database reconciliation, verify the required production environment-variable names and scopes without exposing their values, merge PR #137, and then confirm that Vercel promotes the resulting `main` deployment.

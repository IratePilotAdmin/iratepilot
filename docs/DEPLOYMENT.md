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

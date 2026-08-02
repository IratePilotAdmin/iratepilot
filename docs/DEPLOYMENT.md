# Deployment

Push to GitHub, import into Vercel, add environment variables, run database migrations, and configure your production domain.

Generate a high-entropy `CRON_SECRET` in Vercel for the transactional email worker. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/email/process`. Apply migration `202608020020_secure_email_worker.sql` before enabling the production schedule.

Apply migration `202608020021_enforce_future_partner_inventory.sql` before enabling partner rate and inventory management in production. It prevents approved partners from creating or changing inventory for dates that have already passed.

The repository uses a Hobby-compatible daily schedule at 08:00 UTC. During the private pilot, urgent queues can be drained by sending an authenticated `POST /api/email/process` for each job. Upgrade the Vercel plan before increasing the automated cadence.

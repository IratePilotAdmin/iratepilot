# Deployment

Push to GitHub, import into Vercel, add environment variables, run database migrations, and configure your production domain.

Generate a high-entropy `CRON_SECRET` in Vercel for the transactional email worker. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/email/process`. Apply migration `202608020020_secure_email_worker.sql` before enabling the production schedule.

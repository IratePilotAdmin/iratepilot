# iRatePilot Supabase setup

## Existing iRatePilot database

Run `migrations/202607260001_finance_revenue_ai.sql` in the Supabase SQL Editor.
It is non-destructive: existing users, properties, rooms, and bookings remain.

## Brand-new empty Supabase project

Run `schema.sql` once.

## Verify

Run `verify_schema.sql`. The first and third result sets should contain only
`true`. Every listed table in the second result set should show row-level
security enabled.

Never expose the Supabase service-role key in browser code or commit it. The
public website uses only the project URL and anon key. Server-only
administrative work uses the service-role key through protected hosting
environment variables.

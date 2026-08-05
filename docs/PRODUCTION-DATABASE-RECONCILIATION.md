# Production database reconciliation

Audit date: 2026-08-05

## Verified production state

- The Supabase project is active and stores approximately 28 MB.
- The dashboard lists 22 public tables.
- Core marketplace tables, finance tables, cancellation tables, email jobs, partner data, rooms, inventory, bookings, notifications, and revenue tables exist.
- `review_booking(uuid,text,text)` and `finalize_test_booking_refund(uuid,text,numeric)` exist.
- The Supabase migration page has no recorded migration history.
- `booking_messages` does not exist.
- `send_booking_message(uuid,text)` does not exist.
- `cancel_unpaid_confirmed_booking(uuid,text)` does not exist.

This indicates that the production schema was applied outside the Supabase CLI and includes work through at least migration `202608020023_expire_stale_booking_requests.sql`, while migrations `202608020024_booking_messages.sql` and `202608020025_cancel_unpaid_confirmed_bookings.sql` are not applied.

## Safe rollout order

1. Create and verify a recoverable production database backup.
2. Run `supabase/production_preflight.sql` through a clean, read-only SQL session and save the result privately.
3. Compare the live schema with migrations 001–023 before repairing migration history. Do not replay all migrations against the existing schema.
4. Mark only verified existing migrations as applied using the Supabase CLI migration-repair workflow.
5. Apply migration 024, verify its table, policies, index, and function, then test booking-message authorization.
6. Apply migration 025, verify its function grants, then test unpaid confirmed-booking cancellation and inventory restoration.
7. Re-run the preflight and confirm that all three messaging/cancellation fields resolve to non-null values.
8. Run customer, partner, and administrator end-to-end tests before merging release PR #137.

Database repair or migration execution must not proceed from an autosaved SQL editor buffer containing unrelated statements. Use a clean CLI session or a newly verified empty editor, and inspect the exact SQL immediately before execution.

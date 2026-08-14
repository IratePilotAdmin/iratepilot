# Production database reconciliation

Audit date: 2026-08-05

Phase 25 extends `supabase/production_preflight.sql` with read-only existence checks for every
SynXis deployment boundary from migrations 039 through 048. Run the updated query before deciding
whether any SynXis migration is pending. A non-null object name (and `true` for the schema-v2
column) confirms existence only; policies, grants, constraints, function bodies, and migration
history must still be compared with the repository before repairing history or applying SQL.

Phase 27 adds `supabase/production_migration_026_038_preflight.sql`. It returns one compact JSON
object with a boolean marker for each intervening migration. The checks cover distinguishing
columns, tables, functions, commission logic, transfer cancellation handling, and the unified PMS
provider constraint. A `true` marker is evidence for deeper comparison, not authorization to mark
the migration applied; a `false` marker blocks all later migration deployment.

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
9. For SynXis, save the migration-039-through-048 preflight fields privately and compare every
   existing object with its repository migration. Do not replay a migration merely because the
   migration-history table is missing or incomplete.

Database repair or migration execution must not proceed from an autosaved SQL editor buffer containing unrelated statements. Use a clean CLI session or a newly verified empty editor, and inspect the exact SQL immediately before execution.

## Rollback preparation

- Migration 024 rollback: `supabase/rollbacks/202608020024_booking_messages.rollback.sql`
- Migration 025 rollback: `supabase/rollbacks/202608020025_cancel_unpaid_confirmed_bookings.rollback.sql`

The migration 024 rollback refuses to drop `booking_messages` once it contains any rows. After the feature accepts production messages, recovery must use a verified database backup or a forward fix instead of deleting the table. Migration 025 adds only a new function, so its rollback removes only that function.

Keep the rollback for each migration ready in a separate, clean session. Do not run a rollback unless the corresponding migration verification fails and the rollback target has been inspected immediately beforehand.

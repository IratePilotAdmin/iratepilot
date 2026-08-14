# Production database reconciliation

Audit date: 2026-08-13

Phase 25 extends `supabase/production_preflight.sql` with read-only existence checks for every
SynXis deployment boundary from migrations 039 through 048. A non-null object name (and `true` for
the schema-v2 column) confirms existence only; policies, grants, constraints, function bodies, and
migration history must still be compared with the repository before repairing history or applying
SQL.

Phase 27 adds `supabase/production_migration_026_038_preflight.sql`. It returns one compact JSON
object with a boolean marker for each intervening migration. The checks cover distinguishing
columns, tables, functions, commission logic, transfer cancellation handling, and the unified PMS
provider constraint. A `true` marker is evidence for deeper comparison, not authorization to mark
the migration applied; a `false` marker blocks all later migration deployment.

Phase 28 adds the exact ordered version manifest and controlled rollout runbook. The manifest is a
plan, not write authorization; migration-history repair and schema deployment remain separate
explicitly approved phases.

Phase 29 preparation adds `supabase/production_schema_contract_snapshot.sql`. It produces a
read-only, privacy-limited baseline of object identities, counts, and definition hashes across the
public catalog. Matching before/after results prove that history repair did not alter schema; they
do not replace the migration-by-migration source comparison.

## Verified production state

- The Supabase project is active and the read-only preflight reports 28 public tables.
- Core marketplace, finance, cancellation, email, partner, room, inventory, booking,
  notification, and revenue boundaries exist.
- The Supabase migration page has no recorded migration history.
- Every distinguishing marker for migrations 026 through 038 resolves true in the dedicated
  read-only preflight after accounting for migration 028's intentional replacement of the migration
  027 wrapper.
- `booking_messages`, `send_booking_message(uuid,text)`, and
  `cancel_unpaid_confirmed_booking(uuid,text)` exist.
- Every migration-039-through-048 marker remains absent, including the migration-044 schema marker.
- Daily physical backups are available; the latest observed backup was created at
  `2026-08-13 11:16:39 UTC`. Point-in-time recovery is not enabled, and database backups do not
  restore deleted Storage API objects.
- The Phase 29 catalog/source comparison found that production is not equivalent to every
  repository migration before 039. Missing contracts include `update_own_profile`, the approved
  marketplace property/room helpers, both partner/property enforcement trigger functions and
  triggers, three idempotency/deduplication indexes, five bounds/status constraints, and the
  tightened admin partner-application read policy.

This indicates that selected later schema work through migration 038 was applied outside reliable
Supabase CLI history, but earlier security contracts were skipped. SynXis migrations 039 through
048 remain pending. Migration-history repair through 038 is blocked until a forward reconciliation
plan is designed, tested, approved, and applied.

## Safe rollout order

1. Verify a current recoverable production database backup immediately before a write.
2. Run both read-only preflights through a clean session and save the results privately.
3. Compare the live schema with migrations 001 through 038 before repairing migration history. Do
   not replay them against the existing schema.
4. With separate explicit production-write approval, repair only the verified 001-through-038
   versions listed in `supabase/production_synxis_rollout_manifest.json`.
5. Verify repaired history before requesting separate approval to apply migrations 039 through 048.
6. Apply and verify the pending migrations in exact order while keeping SynXis traffic disabled.
7. Run the manager-onboarding acceptance sequence before merging and deploying the application.
8. Follow `docs/SYNXIS_PRODUCTION_ROLLOUT.md` for stop conditions and the remaining external Sabre
   certification and activation phases.

Database repair or migration execution must not proceed from an autosaved SQL editor buffer
containing unrelated statements. Use a clean CLI session or a newly verified empty editor, and
inspect the exact command or SQL immediately before execution.

## Rollback preparation

- Migration 024 rollback: `supabase/rollbacks/202608020024_booking_messages.rollback.sql`
- Migration 025 rollback: `supabase/rollbacks/202608020025_cancel_unpaid_confirmed_bookings.rollback.sql`

The migration 024 rollback refuses to drop `booking_messages` once it contains any rows. After the
feature accepts production messages, recovery must use a verified database backup or a forward fix
instead of deleting the table. Migration 025 adds only a new function, so its rollback removes only
that function.

Keep the rollback for each migration ready in a separate, clean session. Do not run a rollback
unless the corresponding migration verification fails and the rollback target has been inspected
immediately beforehand.

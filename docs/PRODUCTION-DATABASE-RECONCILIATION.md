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

The forward reconciliation package restores the skipped contracts without automatically changing
conflicting property data and uses bounded lock and statement timeouts. It was applied to production
under explicit approval on 2026-08-14 after a fresh backup, catalog snapshot, and zero-blocker
preflight were confirmed.

The read-only production preflight was executed on 2026-08-13 and returned `ready_to_apply: true`:
all four blocking-row counts and all five existing bounds/status violation counts were zero. Every
target contract remained absent, matching the preceding catalog audit. This result is readiness
evidence only and does not authorize execution; it must be refreshed immediately before an
approved production write.

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
- The pre-039 reconciliation completed successfully. Its corrected read-only verifier returned
  `ready_for_history_repair: true`, every contract returned true, every blocker/violation count
  remained zero, and the migration-history table remained absent.
- The post-reconciliation catalog snapshot at `2026-08-14 02:50:52 UTC` contained 28 tables, 287
  columns, 57 indexes, 51 policies, 4 triggers, 22 functions, 137 constraints, and 784 grants.

Selected later schema work through migration 038 was applied outside reliable Supabase CLI history.
The missing pre-039 security contracts are now reconciled, but SynXis migrations 039 through 048
remain pending. Migration-history repair through 038 is still a separate production write requiring
its own source comparison, review, and explicit approval.

## Safe rollout order

1. Compare the reconciled live schema with migrations 001 through 038 before repairing migration
   history. Do
   not replay them against the existing schema.
2. Verify a current recoverable production database backup and refresh the read-only evidence.
3. With separate explicit production-write approval, repair only the verified 001-through-038
   versions listed in `supabase/production_synxis_rollout_manifest.json`.
4. Verify repaired history before requesting separate approval to apply migrations 039 through 048.
5. Apply and verify the pending migrations in exact order while keeping SynXis traffic disabled.
6. Run the manager-onboarding acceptance sequence before merging and deploying the application.
7. Follow `docs/SYNXIS_PRODUCTION_ROLLOUT.md` for stop conditions and the remaining external Sabre
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

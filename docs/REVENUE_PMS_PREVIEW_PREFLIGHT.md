# Revenue AI PMS-only Preview preflight

## Migration-history recovery (2026-09-28)

The original deployment commit `5abc0d2` contains the pre-migration
`supabase/schema.sql`. Its exact SQL body has been recovered as
`docs/recovered_migrations/202607260000_initial_schema.sql` for review. The
two fee migration bodies recovered from production logs have likewise been
copied into `docs/recovered_migrations/202608220062_hotel_partner_fee_schema.sql`
and `docs/recovered_migrations/202608220063_activate_hotel_partner_fee_schedule.sql`.
Their bodies match the SQL already recorded in this repository's
`RECOVERED_HOTEL_PARTNER_FEE_SQL.md`. These are **recovery source files**, not
active migrations. Moving them into `supabase/migrations/` and running `db push`
against main would try to create objects already present in production.

The branch cannot be declared healthy merely by adding repository files:
Supabase replays **main's database migration history** when creating a branch.
The production ledger needs a reviewed, replayable baseline before version
`202607260001`, and the missing fee versions must be reconciled with the
production schema. Test the complete ordered history on a fresh isolated
database or branch, compare its schema with production, then repair main's
history through the supported migration workflow. Create or rebase Preview and
confirm `MIGRATIONS_FAILED` clears before the six pending application migrations
are considered. Do not enable live Revenue AI or PMS delivery on this basis.

An isolated in-memory PostgreSQL replay is available with
`npm run migration:replay`. It runs the three recovered sources and all active
migrations in version order with minimal stand-ins for Supabase Auth. The only
SQL substitution is `uuid-ossp`, which PGlite does not bundle; its UUID helper
uses PostgreSQL's `gen_random_uuid()` instead. On 2026-09-28 this replay found
that `202607290001_stripe_webhook_reliability.sql` indexed `received_at` even
though the preceding financial reconciliation migration had already created
the table without that column. The migration now adds and backfills the four
missing webhook columns and updates the status constraint before indexing.
All 81 SQL files then replayed successfully, with the PMS-only column, fee
column, and Revenue AI RPC present at the end. TypeScript typecheck passed.

This is a **local SQL gate**, not a Supabase Preview branch replay. PGlite uses
PostgreSQL 18 and minimal Auth stand-ins; Supabase's managed roles/extensions,
the actual production history ledger, and version 16 behavior still need a
real branch check. No production or Preview schema or migration ledger was
changed by this recovery work. This environment has no Supabase CLI, so a
production-history repair was not performed here.

The Supabase dashboard identified project `tztrvyhqyhkjhjwhrbaa` as
`iratepilot-preview-sandbox` on 2026-09-27. Its migration history contained 72
versions through `202608150061`. The repository contained 78 versions.

The six pending versions, in order, are:

1. `202609070139` — transactional PMS outbox, disabled by default
2. `202609070140` — sandbox baseline and delivery gates
3. `202609070141` — delivery control receipts
4. `202609070157` — scoped event claim
5. `202609070158` — scoped claim identity correction
6. `202609270159` — inactive PMS-only property, authenticated inventory and
   room-rate write guards, and revenue approval guard

## Live branch check on 2026-09-27

The Supabase connection identifies `tztrvyhqyhkjhjwhrbaa` as the
`iratepilot-preview-sandbox` **development branch** of the main iRatePilot
project. Its migration ledger has exactly 72 entries through `202608150061`,
with the six versions above absent and no unexpected versions. The branch
has no PMS outbox tables, no `properties.pms_only` column, and no Red Roof
pilot draft row.

**Blocked:** Supabase reports the branch status as `MIGRATIONS_FAILED` even
though the database is reachable. Historical Postgres logs from branch creation
on 2026-08-14 show SQLSTATE `42P01`: migration `202607260001`
(`finance_revenue_ai`) attempted to alter `public.partners` before that base
table existed. Subsequent dashboard SQL attempts reported missing
`received_at` and an already-existing `rooms_max_guests_bounds` constraint.
The branch was later populated with tables and 72 migration entries, but this
does not establish that its schema replay is clean.

The main project has 79 migration entries,
including `202608220062` (`hotel_partner_fee_schema`) and `202608220063`
(`activate_hotel_partner_fee_schedule`), which are absent from this branch
and the repository. Their migration-ledger `statements` are null, but their
source SQL was recovered from production Postgres logs in
[RECOVERED_HOTEL_PARTNER_FEE_SQL.md](./RECOVERED_HOTEL_PARTNER_FEE_SQL.md).
Production has the four fee columns and the active 13% + 3% function; this
Preview branch has none of the four columns. Do not apply the six pending
migrations until the branch workflow failure is diagnosed and the two missing
fee migrations are reconciled with the repository and branch strategy. Never
repair history by marking versions applied without confirming the corresponding
schema.

Compare the branch's **View logs** workflow with the historical Postgres error
above. Follow Supabase's
[MIGRATIONS_FAILED troubleshooting guide](https://supabase.com/docs/guides/troubleshooting/branch-in-migrations-failed-status).
The current `supabase/schema.sql` is a cumulative snapshot that already
contains later objects; replaying it as the bootstrap would cause duplicate
schema changes. A reviewed initial schema must be represented in a
reproducible migration baseline before replaying `202607260001` on a fresh
branch. Review the recovered SQL for versions `062` and `063`, compare
their resulting schema with main, and reconcile the repository migration history.
Then create a clean Preview branch from that history or repair and verify this
one. Recheck project identity, branch health, and both ledgers before running
the preflight below. Do not use `migration repair` as a substitute for creating
the missing schema.

Run the preflight only from a trusted environment with the Supabase CLI installed.
Set `PREVIEW_SUPABASE_PROJECT_REF` to the project above and provide
`PREVIEW_SUPABASE_DB_URL` through a secure environment facility. Do not put the
database URL in shell history, GitHub, an issue, a PR, or chat.

```sh
node scripts/reconcile-preview-migrations.mjs --preflight
```

This command checks the project identity, compares the full local and remote
migration ledgers, and runs `supabase db push --dry-run`. It prints only the
project reference and versions. It never calls `db push --yes` or repairs
history. It refuses to proceed if the remote ledger or dry run differs from
the exact six-version set above. The ordinary reconciliation command still
blocks version `202609270159`; this preflight does not approve it.

Review the dry-run result and the six SQL files before separately approving a
Preview migration push. Verify the ledger and schema afterward. Do not merge
or deploy the application before its database guard exists. Do not enable PMS
delivery or create a hotel draft as part of this preflight.

The PMS-only guard rejects authenticated inventory writes and room base-rate
changes, including direct database API calls. A trusted service-role PMS
ingestion process may populate a pilot after hotel access is verified. The
partner rate editor returns a conflict for PMS-only inventory changes.

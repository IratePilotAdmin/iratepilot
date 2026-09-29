# Revenue AI PMS-only Preview preflight

## Migration-history recovery (2026-09-28)

The original deployment commit `5abc0d2` contains the pre-migration
`supabase/schema.sql`. Its exact SQL body has been recovered as
`docs/recovered_migrations/202607260000_initial_schema.sql` for review. The
two fee migration bodies recovered from production logs have likewise been
copied into `docs/recovered_migrations/202608220062_hotel_partner_fee_schema.sql`
and `docs/recovered_migrations/202608220063_activate_hotel_partner_fee_schedule.sql`.
Their bodies match the SQL already recorded in this repository's
`RECOVERED_HOTEL_PARTNER_FEE_SQL.md`. The originals remain review sources.
`supabase/migrations/202607260000_initial_schema_bootstrap.sql` replays the
base on an empty database and checks for all 17 base tables without recreating
them on production. The two fee files are in `supabase/migrations/` under their
existing production versions. Do not run `db push` against main merely because
the files now exist: the production history has been repaired separately below,
and the final property guard migration remains pending.

The branch cannot be declared healthy merely by adding repository files:
Supabase replays **main's database migration history** when creating a branch.
The production ledger now has the replayable baseline before version
`202607260001`, the corrected webhook migration, and SQL for the fee versions.
The existing Preview branch now reports `FUNCTIONS_DEPLOYED`; a fresh branch
replay is still needed for the older access history. Do not enable live Revenue AI
or PMS delivery on this basis.

## Hosted history repair (2026-09-28)

The connected production project `allliumarkejinplrggl` had all 17 original
base tables but no `202607260000` ledger entry. A guarded transaction inserted
that historical version with the executable bootstrap `DO` statement. Its
stored 30,999-byte statement matched the published PR file with MD5
`02e24eb0a7da99e3a00091d531d66f72`.

The two existing fee ledger entries had null `statements`. Production already
had all four fee columns, six fee constraints, and the active 13% plus 3%
function. Guarded updates restored the 10 and 4 parsed statements of versions
`202608220062` and `202608220063`. The stored MD5 digests over statements
joined with ASCII unit separator matched the published files:
`b2f4ad0779dad62cc7ee70f1f39856b1` and
`65cb4f1755e57cdd593d37f516d7eea6`.

The original six-statement webhook history for `202607290001` could not replay
against a fresh base. Production already had the four target columns, two
indexes, status constraint, and RLS. Its recorded statements were replaced in
a guarded transaction with the 11 statements from the corrected PR file;
the stored digest matched `742ef3ac32e84ddd2ce8ebc654e7273a`.
These changes only updated `supabase_migrations.schema_migrations`; they did
not execute DDL against production application tables or modify booking rows.
They used the connected SQL tool because an authenticated CLI session and the
shared dashboard browser were unavailable. The hosted branch replay remains
the release gate, since ledger shape alone cannot prove that branch
provisioning executes a repair-marked baseline.

The first hosted rebase executed the recovered bootstrap and fee versions, then
failed at `202609070139` with SQLSTATE `42601` near `manual`. Five production
PMS versions (`139`, `140`, `141`, `157`, `158`) had each stored the literal
placeholder `manual production rollout` as their only statement. Production
already had all five PMS tables with RLS, eight expected functions, the
booking outbox trigger, delivery column and constraint, and due index. A
guarded ledger-only transaction replaced the five placeholders with the
published files' parsed statements. Their statement counts are 23, 18, 9, 5,
and 5; stored digests respectively match
`21c79df2ceb21676c5aba5067eb3fefd`,
`5a5d9257889b69bb6e32aa2dc0c21a5f`,
`e0abba40e40cdc0b93a7720b9ad26f72`,
`cdc7f6ac3ab54d5176c4092c39941294`, and
`a34b0843b318844e0a813929962cbe10`. The next Preview rebase applied
these five PMS versions and reached `FUNCTIONS_DEPLOYED`.

Eight earlier hotel access versions (`202608150054` through
`202608150061`) also had empty or null statements in production history.
Production already had the two hotel access capability columns, the expected
hotel manager functions and enabled write guard triggers, the manager policies,
and the owner delete policies. A guarded, ledger-only transaction restored
51, 8, 10, 6, 6, 8, 6, and 6 parsed statements from the published migration
files. Each stored digest matched its source file, and no production history
version now has empty or null statements. Rebase then reached
`FUNCTIONS_DEPLOYED` with 80 versions on Preview, including the PMS
transactional outbox and access functions and policies.

This existing Preview branch retained 72 empty historical statement arrays
after rebase, including versions 054 through 061. Its objects and version
list are present, but rebase only logged application of the newly missing
versions. A fresh branch replay remains the proof that every older historical
statement executes from scratch. Do not reset the current Preview to force
that check: it contains one property and four bookings. New branch creation
requires a separate cost confirmation.

Red Roof Inn Ridgeland, MS has one sandbox iRatePilot outbox connection with
capture and delivery enabled in production, one released baseline run with
zero snapshots, and one delivered outbox event dated 2026-09-18. This is
limited sandbox evidence, not a verified live PMS feed. The property is
inactive. A 2026-09-28 read-only check found no matching
`property_pms_connections` record and no delivery control receipt; the
outbox event's result code is `reservation-staged`. Verify the source identity,
an actual PMS delivery receipt, and current PMS credentials before the live gate.

## Fresh hosted replay and isolated guard validation (2026-09-28)

After explicit confirmation of the Supabase branch price ($0.01344/hour), a
disposable branch `revenue-history-replay-20260928` was created from main with
no production data. It reached `FUNCTIONS_DEPLOYED` and contained all 80
production versions from `202607260000` through `202609070158`, with no
null or empty statement arrays. It had the PMS outbox, hotel access function,
and eight hotel manager policies; it had zero properties and bookings. This
proves the repaired main history replays from scratch on hosted Supabase.

The published `202609270159_pms_only_properties.sql` body (blob
`16ad15b0f83db76ccb69e5881ea38d2db13db2a3`) was then applied to this
isolated branch as a validation migration. The MCP tool assigned the
temporary version `20260929013714_pms_only_properties_release_validation`;
this does **not** mark repository version `202609270159` applied on main
or the existing Preview branch. The PMS-only column, both enabled write
triggers, and recommendation replacement RPC were present. Anonymous
`EXECUTE` on review was revoked and authenticated `EXECUTE` remained.

Rollback-only synthetic data checks verified that authenticated updates to
PMS-only inventory and room base rates were rejected, PMS-only activation
failed its check constraint, recommendation approval was blocked without
changing status, and rejection succeeded. The transaction left zero
properties, bookings, and recommendations on the validation branch.
The disposable branch was deleted after the evidence was recorded, stopping its hourly charge.

An isolated in-memory PostgreSQL replay is available with
`npm run migration:replay`. It runs all 81 active migrations in version order
with minimal stand-ins for Supabase Auth and checks that the bootstrap is a
no-op on a complete schema and rejects a partial schema. The only
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
fresh branch check. The CLI is installed in a disposable workspace, but no
linked database credentials are available. The production ledger repair above
was performed through the connected SQL tool and verified with read-only
queries; the existing Preview branch completed its incremental rebase.

The Supabase dashboard identified project `tztrvyhqyhkjhjwhrbaa` as
`iratepilot-preview-sandbox` on 2026-09-27. Its migration history contained 72
versions through `202608150061`. The repository had 78 active versions at
that time; it now has 81, including the three history-recovery versions.

The six versions absent from Preview on 2026-09-27 were, in order:

1. `202609070139` — transactional PMS outbox, disabled by default
2. `202609070140` — sandbox baseline and delivery gates
3. `202609070141` — delivery control receipts
4. `202609070157` — scoped event claim
5. `202609070158` — scoped claim identity correction
6. `202609270159` — inactive PMS-only property, authenticated inventory and
   room-rate write guards, and revenue approval guard

Versions 139, 140, 141, 157, and 158 reached Preview on 2026-09-28. Version
159 is still absent from main and Preview; applying it requires its own review.

## Historical branch check on 2026-09-27 (superseded above)

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
(`activate_hotel_partner_fee_schedule`), which are absent from this branch.
Their production migration-ledger `statements` are null, but their
source SQL was recovered from production Postgres logs in
[RECOVERED_HOTEL_PARTNER_FEE_SQL.md](./RECOVERED_HOTEL_PARTNER_FEE_SQL.md).
Production has the four fee columns and the active 13% + 3% function; this
Preview branch has none of the four columns. Do not apply the six pending
migrations until the branch workflow failure is diagnosed and the two fee
versions are reconciled with production history and the branch strategy. Never
repair history by marking versions applied without confirming the corresponding
schema.

Compare the branch's **View logs** workflow with the historical Postgres error
above. Follow Supabase's
[MIGRATIONS_FAILED troubleshooting guide](https://supabase.com/docs/guides/troubleshooting/branch-in-migrations-failed-status).
The current `supabase/schema.sql` is a cumulative snapshot that already
contains later objects; the bootstrap instead derives from the original
deployment commit. Its repository replay passes, but the hosted main ledger
has not received it. Compare the fee version schema with main and reconcile
the production migration history.
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
the exact six-application-version set above. It will block while the three
history-recovery versions also differ. The ordinary reconciliation command still
blocks version `202609270159`; this preflight does not approve it.

Review the dry-run result and the six SQL files before separately approving a
Preview migration push. Verify the ledger and schema afterward. Do not merge
or deploy the application before its database guard exists. Do not enable PMS
delivery or create a hotel draft as part of this preflight.

The PMS-only guard rejects authenticated inventory writes and room base-rate
changes, including direct database API calls. A trusted service-role PMS
ingestion process may populate a pilot after hotel access is verified. The
partner rate editor returns a conflict for PMS-only inventory changes.

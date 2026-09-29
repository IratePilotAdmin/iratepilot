# Hotel partner fee alignment

## Current contract

For newly recorded hotel booking financials:

- **13% iRatePilot Group, LLC commission**.
- **3% iRate Rewards Program contribution**.
- **16% total hotel distribution cost**, not 16% commission.
- **0% traveler service fee** is the application checkout policy; this migration
  changes only hotel-side financial snapshots.

Both hotel charges use post-discount gross room revenue and round independently
to currency cents. A $1,000 room subtotal records $130 commission, $30 rewards
contribution, and $840 hotel net, excluding separate taxes and adjustments.

The stored names remain `partner_commission`, `reward_program_fee`,
`partner_commission_rate_bps`, `reward_program_fee_rate_bps`, and
`fee_schedule_version`. The current version is
`hotel_partner_commission_13_reward_fee_3_v1`, with rates 1300 and 300 basis points.
This preserves compatibility with the existing schema and financial records.

## Migration and historical data

Use the new additive migration
`supabase/hotel-migrations/202609160139_reconcile_hotel_partner_fee_schedule.sql`.
Its matching rollback lives in `supabase/hotel-rollbacks`. This is a separately
reviewed hotel migration package, deliberately outside the flight installer's
pinned migration directory. It is not picked up by the flight plan, dry run, or
apply process, or an ordinary Supabase migration-directory push. An operator
must apply this exact reviewed hotel SQL explicitly to the approved target.
It works with both the older table without fee snapshots and the existing
schema's already-active 13% + 3% contract. It validates column types/nullability,
reconciles constraints, and replaces the authoritative insert/immutability trigger.
Non-finite `NaN` numeric amounts are explicitly rejected by a monetary constraint.
Migration and rollback bound lock waits to five seconds and individual SQL
statements to 60 seconds; a busy or oversized target fails rather than waiting
indefinitely with an exclusive financial-table lock.
It does not grant new access, change RLS, enable bookings, or initiate payments.

Existing money is never recalculated. Rows without previous rate snapshots gain
`legacy_recorded_split_v0`, a null commission rate, and zero new rewards amount.
Their actual recorded commission/net remain untouched. Previously recorded
14%/0% and 13%/3% snapshots retain their original version, rates, and money.
All seven money/rate/version fields are immutable after insert; status updates
remain available. Unexpected column shapes or irreconcilable amounts fail the
whole migration instead of repairing historical money by assumption.

The schema snapshot previously contained canonical 062/063 fee blocks without
their corresponding files in this checkout. The new migration deliberately does
not rename, replay, or fabricate those historical migration identities.

Remaining earlier `14%`/`0.14`/`1400` references in SQL are intentional:

- Migration `202608090033_raise_marketplace_commission.sql` records the old change.
- Migration `202608170063_traveler_membership_value.sql` contains historical RPC
  definitions with intermediate fee amounts. The active financial insert trigger
  overwrites those supplied amounts with the current split before storage.
- Earlier bootstrap function definitions in `supabase/schema.sql` are superseded
  by the final mirrored reconciliation block.
- The version `partner_commission_14_reward_fee_0_v1` remains allowed only to
  represent already-recorded historical terms. New inserts always use 13% + 3%.

## Controlled rollout and rollback

1. Review the actual target migration ledger and column/function definitions.
   A repository schema snapshot does not prove what is deployed remotely.
2. Keep hotel booking/payment writes disabled while applying this migration to
   Preview and deploying the compatible application. Apply the exact reviewed
   migration; do not run an unreviewed replay of the whole migration directory.
3. Verify the $1,000 split, mixed historical rows, financial reports, and payout
   amount reads in Preview. Complete the repository validation gate.
4. Review the production package and repeat target-specific verification before
   production activation. This local change does not itself authorize deployment.

The matching rollback retains all columns, constraints, and recorded money. It
**pauses new financial inserts** instead of guessing whether the previous target
used the old or new schedule. Disable hotel booking/payment writes before using
it; it is not a safe hot rollback during payment activity. Status updates remain
possible and snapshots remain immutable. Reapply migration 139 to restore new
13% + 3% inserts after the issue is resolved. Rollback never silently restores an
obsolete advertised fee or rewrites prior bookings.

## Verification completed locally

`tests/postgres/hotel-partner-fee-schedule-runtime.sql` ran through PGlite 0.5.8
(PostgreSQL 18.3) in a new in-memory database. The runner expanded the checked-in
SQL includes and replaced only the psql loopback safety preflight; it had no
external database connection. Verified legacy money preservation, the current
split, independent rounding, zero revenue, all seven immutable snapshot fields,
non-finite monetary refusal,
status updates, historical 14% snapshots, invalid null-rate refusal, migration
replay, rollback insert refusal, rollback preservation, and reapplication.
A separate malformed-column fixture verified refusal and transaction rollback.
The schema mirror matches the migration bytes.

For standalone PostgreSQL, run the checked-in SQL file with `psql -f` against a
new empty local loopback database named `hotel_fee_test_<suffix>`. Its fixture
guard refuses existing booking tables and other database names/hosts.

These fixtures test the real SQL trigger and constraints with minimal table
fixtures. They do not claim full-schema/RLS, hosted Supabase, payment-provider,
or hosted Supabase verification by themselves. The later reviewed Preview and
Production rollout is recorded separately in
`HOTEL_PARTNER_RECRUITMENT_RELEASE_2026-09-17.md`.

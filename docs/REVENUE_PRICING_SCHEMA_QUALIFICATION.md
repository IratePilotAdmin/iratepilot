# Actual pricing-schema qualification

On September 30, 2026, read-only catalog queries against PMS project `eiqmdldjnedqgbtoozqa` captured the pricing dependency slice used in `tests/fixtures/revenue-pms-pricing-schema.sql`. No production records or credentials were exported. The snapshot includes 18 tables and 178 columns, defaults and nullability, 127 primary/unique/check/foreign-key constraints, 17 enabled triggers, eight secondary indexes (including partial unique indexes), the trigger function definitions and their cleaning-fee/checklist helpers. The activity identity column retains `GENERATED ALWAYS AS IDENTITY`. The deferred whole-home constraint trigger is recreated as a trigger, rather than an invalid ALTER TABLE constraint.

The slice covers tenants, properties, memberships, room types, rooms, maintenance closures, capacity, rate plans, nightly prices, reservations, rate actions and activity, plus charge snapshots, service-close/reconciliation and turnover table dependencies. It is not the complete PMS: the live catalog contains 175 tables and 606 PMS functions. It does not copy Supabase Auth, RLS policies, grants, all service functions, cron jobs or deployment infrastructure.

`tests/revenue-atomic-approval.test.ts` now runs the same audited-save scenarios against both reduced tables and this captured pricing schema. Fixtures use complete reservation source identities, hashes and financial components, plus a synthetic local Auth user to satisfy foreign keys. Snapshot shape assertions verify 18 tables, 127 explicitly exported constraint types, 17 triggers, eight secondary indexes and the activity identity mode. PostgreSQL 18 catalogs NOT NULL constraints separately, so the constraint-count assertion selects primary/unique/check/foreign/exclusion types rather than counting those additional catalog entries.

Run:

```sh
npx vitest run tests/revenue-atomic-approval.test.ts tests/revenue-capacity-preflight.test.ts
```

Both audited-save schema variants and the preflight integration passed locally, along with lint and TypeScript. They verify deterministic calculation, rejected drift and unauthorized requests, exact replay, one rate/audit action, and rollback after forced audit failure with the captured table constraints and trigger definitions installed. This does not exercise every trigger branch, authentication via HTTP, real independent sessions, or sustained load. The source PMS is PostgreSQL 17.6; the local PGlite runtime is a different engine/build and does not establish production-runtime equivalence.

## Ready next step: independent-session qualification

The actual PMS currently has no Supabase development branch. The local container has only the root UID mapped; normal PostgreSQL service setup could not run within its permissions. No root-execution safeguard was bypassed. A temporary Supabase development branch is the next available server environment for independent-session tests.

Proposed branch: `revenue-atomic-qualification-20260930`, from the actual PMS project, with migrations only and no copied production data. Supabase's branch connector requires organization selection and a quoted-cost confirmation before creation. It has not been created or charged as part of this work.

Before testing, verify the returned test project reference differs from both live project references, compare the branch schema/functions/migration history to the actual PMS, and resolve any differences before claiming runtime equivalence. Apply the candidate only to that isolated branch, create synthetic test identities and properties, then qualify concurrent rate, reservation, capacity and membership changes; duplicate request conflicts; exact replay after response loss; and rollback of failed auditing. Record results and remove the temporary branch after qualification. Never merge the test branch into production as part of this test.

The candidate remains uninstalled in the actual PMS. Red Roof remains in shadow testing, and live rate writeback is disabled. UI rounding alignment, approval recovery, signed OTA delivery, forecast performance, mobile/portfolio verification and coordinated live activation remain separate work.

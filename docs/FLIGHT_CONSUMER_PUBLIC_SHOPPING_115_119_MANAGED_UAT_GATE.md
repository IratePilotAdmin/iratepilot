# Flight Consumer public-shopping migrations 115-119 isolated managed UAT gate

> **Status: UNEXECUTED PREPARATION ONLY.** This document is a controlled runbook,
> not an acceptance receipt. No database, provider, Stripe, Production, deploy,
> release, or migration-ledger action is evidenced by this file.

This gate is limited to applying and verifying the exact production-local
public-shopping migrations `202608260115` through `202608260119` in the
isolated, data-less Supabase UAT project whose ref is
`bzxqbvmrkmjyvudlspss`. It has no Production target and no default operation.

The source boundary is commit
`54b49dc3d4249d4358233a2b102cf12416396eb2`. Later migrations, including
`202608260139`, are outside this gate and must never appear in its apply list.

## Immutable source artifacts

| Version | Forward migration | Forward SHA-256 | Rollback SHA-256 | Rollback boundary |
| --- | --- | --- | --- | --- |
| `202608260115` | `supabase/production-migrations/202608260115_flight_consumer_live_public_shopping_admission.sql` | `06f956ac88cba042d34ae7ac1c8a628dcdee2ea76936ada1cf7d7577c863cd63` | `f1687425757d5856638a2f97d61d06c31cc77980e35113cbc0fa1ab7c8efc911` | Separately authorized rollback refuses while admission evidence exists. |
| `202608260116` | `supabase/production-migrations/202608260116_flight_consumer_live_public_offer_projection.sql` | `64237bd6afc967349940805876a1e432c78d21801ac520f6990f2f14053423d0` | `03640a468e17bd8213006a2f726dab40c740a7b6bd5855773e0a808acc90c232` | Separately authorized rollback refuses while any projection evidence exists. |
| `202608260117` | `supabase/production-migrations/202608260117_flight_consumer_live_public_offer_reference_retention.sql` | `1881c1e02e43a8e17129090ff41deb44f1f80feb4277905d40bd349131f727df` | `7e763fbf14350a78d731793bc545c82186f0c6d9f45326062a6aec81bab6d77e` | Separately authorized rollback refuses after any purge receipt exists. |
| `202608260118` | `supabase/production-migrations/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql` | `7bc225346c6b55c8a0c8f7b150a44c20c746bed092ac3a6e4791d89dddeda84f` | `ca145d0d4e0559a3c983fbc0a7b702986d3caaf175292b23d0df5ebf7f8df102` | **Forward-only boundary.** The canonical rollback always refuses because the prior Gate 105 RPC is unusable. |
| `202608260119` | `supabase/production-migrations/202608260119_flight_consumer_live_public_shopping_dispatch.sql` | `51329d4d4d95d5b8c0e7a90d239c760c0ce432e8766e3319ae3c02f31cf2269c` | `66be858df46aa4495bfef405ec17013598daa57a70bde55d92ae8e480e03f14d` | Separately authorized rollback refuses while dispatch evidence exists. |

The predecessor acceptance record is
`docs/evidence/FLIGHT_CONSUMER_LIVE_PAYMENT_UAT_101_114_2026-08-27.json`,
SHA-256
`ba04f38e0aa702d247f9d704ee344f109b22897d4c1a3f509d69bd21df781342`.
It records the exact predecessor set through 114 in the isolated UAT project;
it does not prove the current state at the time of a future 115-119 run. The
future read-only preflight must re-observe every prerequisite.

The managed package must pin its own artifacts before any apply is authorized:

| Required managed artifact | SHA-256 before authorization |
| --- | --- |
| `scripts/flight-consumer-public-shopping-115-119-managed-uat-preflight.sql` | `6678c663c4579405c3f60bdfad5086e0da929eba3b19328af361fb6f94006ed6` |
| `scripts/flight-consumer-public-shopping-115-119-managed-uat-verification.sql` | `23f727ab43728803ec60a7ffe15428727285d47372f25b433ed811462fe6562f` |
| `scripts/manage-flight-consumer-public-shopping-115-119-uat.mjs` | `3362a2d38af5cea83a08b006b454dd28735686b08c40ab5d2a8826451af465fa` |
| `scripts/render-flight-consumer-public-shopping-115-119-managed-uat-sql.mjs` | `14d502fc6c5f32cc95fbcf4ba4be30cce1010dff988e89a3becd7ddfd7dda9a8` |
| `scripts/verify-flight-consumer-public-shopping-115-119-managed-uat-pglite.mjs` | `b1ae4b1005aa804f5745741a2e37d7d02dac740ea1fa37d4e1a95e7bafcb50ad` |

Do not execute a command in this runbook until those files exist, their hashes
are independently recorded, and their tests pass.

## Only approved target

| Property | Required value |
| --- | --- |
| Target kind | `isolated_uat` |
| Supabase project ref | `bzxqbvmrkmjyvudlspss` |
| Branch | `iratepilot-flight-payment-uat-20260827` |
| Database | `postgres` |
| Database user | `postgres` |
| PostgreSQL major version | `17` |
| Predecessor state | Exact accepted predecessor set through Gate 114, reverified read-only |
| Data state | Zero transaction, provider, Stripe, order, charge, and ticket rows |
| Migration-ledger policy | Objects applied without writing `supabase_migrations.schema_migrations` |

The runner must accept only this target/ref. A direct connection must use
`db.bzxqbvmrkmjyvudlspss.supabase.co`, port `5432`, database `postgres`, and
user `postgres`. A managed Supabase pooler must use a
`*.pooler.supabase.com` host and user `postgres.bzxqbvmrkmjyvudlspss`.
Local databases, raw IPs, arbitrary URLs, arbitrary SQL paths, any other ref,
and any port other than `5432` must be refused.

PostgreSQL does not expose a universal intrinsic Supabase project-ref value.
The preferred `psql` runner therefore binds identity from the reviewed host and
user before SQL runs. SQL Editor is a weaker operator-bound fallback and
requires the exact project ref in both the dashboard URL and editor header
before every execution.

## Absolute prohibitions

This gate must not:

- access or mutate Production;
- call Duffel, Stripe, or any other provider;
- create a PaymentIntent, confirm or capture a payment, charge or refund money,
  create an order, or issue a ticket;
- deploy an application, change Vercel configuration, enable a route, change a
  feature flag, or release consumer traffic;
- run `supabase db push`, the generic Preview migration runner, or any directory
  glob that can include migrations outside 115-119;
- insert, update, delete, or repair a row in
  `supabase_migrations.schema_migrations`;
- apply a rollback, perform a blind retry, or hand-edit a pinned migration;
- inherit provider credentials into a database child process or store any
  database password, session ID, query ID, or raw provider identifier in
  evidence.

## Local immutable-byte check

Run from the repository root. A later repository `HEAD` is permitted only when
the exact ten forward/rollback files are byte-identical to the pinned source
commit. Unrelated dirty or untracked files must not be included in the apply.

```powershell
$sourceCommit = '54b49dc3d4249d4358233a2b102cf12416396eb2'

$forward = @(
  'supabase/production-migrations/202608260115_flight_consumer_live_public_shopping_admission.sql',
  'supabase/production-migrations/202608260116_flight_consumer_live_public_offer_projection.sql',
  'supabase/production-migrations/202608260117_flight_consumer_live_public_offer_reference_retention.sql',
  'supabase/production-migrations/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql',
  'supabase/production-migrations/202608260119_flight_consumer_live_public_shopping_dispatch.sql'
)

$rollback = @(
  'supabase/production-rollbacks/202608260115_flight_consumer_live_public_shopping_admission.rollback.sql',
  'supabase/production-rollbacks/202608260116_flight_consumer_live_public_offer_projection.rollback.sql',
  'supabase/production-rollbacks/202608260117_flight_consumer_live_public_offer_reference_retention.rollback.sql',
  'supabase/production-rollbacks/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.rollback.sql',
  'supabase/production-rollbacks/202608260119_flight_consumer_live_public_shopping_dispatch.rollback.sql'
)

git cat-file -e "$sourceCommit^{commit}"
git diff --exit-code $sourceCommit -- @($forward + $rollback)
Get-FileHash -Algorithm SHA256 @($forward + $rollback) |
  Select-Object Path, Hash
```

Stop on any missing commit, diff, unexpected filename, or hash mismatch. The
runner must perform the same hash checks immediately before each SQL session.

## Connection setup

The preferred managed path requires an absolute `psql.exe` path and a dedicated
password supplied only through the shell environment. Never put a password or
URL on the command line.

```powershell
$env:FLIGHT_MANAGED_115_119_DB_HOST = 'db.bzxqbvmrkmjyvudlspss.supabase.co'
$env:FLIGHT_MANAGED_115_119_DB_PORT = '5432'
$env:FLIGHT_MANAGED_115_119_DB_NAME = 'postgres'
$env:FLIGHT_MANAGED_115_119_DB_USER = 'postgres'
$env:FLIGHT_MANAGED_115_119_DB_PASSWORD = '<masked isolated-UAT database password>'
```

The runner must use TLS `verify-full` and pass only the reviewed operating-system
allowlist plus these five PG fields to child processes. Provider, Stripe,
Vercel, Production, and general Supabase tokens must not be inherited.

## Phase 1: read-only preflight

The preflight requires no apply confirmation and begins a read-only transaction.
After the managed package is implemented and hash-pinned, its intended invocation
is:

```powershell
node scripts/manage-flight-consumer-public-shopping-115-119-uat.mjs `
  --operation=preflight `
  --target=isolated_uat `
  --psql='C:\absolute\path\to\psql.exe'
```

It must stop unless all of the following are freshly observed:

1. The target binding is exactly `bzxqbvmrkmjyvudlspss`, database and user are
   `postgres`, PostgreSQL is major 17, required Supabase roles exist, and the
   session can assume the reviewed `service_role` context.
2. The accepted predecessor catalog through Gate 114 is present and exact.
   The UAT-only `public.profiles(id uuid primary key)` prerequisite remains
   empty, forced-RLS, grant-revoked, and is not treated as Production lineage.
3. Versions 115-119 are absent from `supabase_migrations.schema_migrations`.
   A read-only snapshot of the relevant ledger state is captured for comparison
   after verification.
4. Every 115-119 target table, function, trigger, index, constraint, type, and
   policy is absent. A partial apply or name collision is a hard stop.
5. The relevant predecessor data tables are empty, including shopping attempts,
   payment-intent plans, offer sources and refresh attempts, payment executions
   and receipts, checkout aggregates and receipts, order executions and
   receipts, confirmation attempts and receipts, authorization bridges, capture
   attempts and receipts, and booking settlements and receipts.
6. Provider requests, Stripe creates/confirmations/captures/mutations, orders,
   charges, tickets, and settlement evidence are all zero.
7. Gate 105's exact source constraint and required functions are present;
   shopping-attempt and offer-source history is both safe and empty before the
   Gate 118 repair/backfill boundary.
8. No verification harness schema or object exists and no network-capable SQL
   extension or helper will be invoked.

The sanitized preflight receipt must report the exact ref, database/user/server
version, predecessor tip 114, object absence, zero counts, ledger absence, and
`writesPerformed: false`. It must not report `PASS` unless every assertion
completed in the selected managed target.

## Phase 2: ordered object apply with a forward-only checkpoint

Each canonical migration contains its own transaction and must run in a separate,
fail-fast `psql` session in ascending order. Never concatenate the files.

The managed runner requires two independent authorities before the ordered
apply begins:

1. One target- and range-bound authority for exact object-only Gates 115-119,
   with no migration-ledger write.
2. A separate acknowledgement that Gate 118 is a forward-only canonical repair
   whose rollback always refuses.

After both authorities are present, the runner applies 115 through 119 in five
separate fail-fast `psql` sessions and then performs the exact managed
verification. It stops at the first error and never attempts cleanup or
rollback automatically.

The exact confirmations are:

```text
APPLY_115_119_OBJECTS_ONLY_bzxqbvmrkmjyvudlspss_NO_LEDGER
ACCEPT_118_FORWARD_ONLY_bzxqbvmrkmjyvudlspss_NO_ROLLBACK
```

No runner implementation is acceptable if it crosses Gate 118 without the
separate forward-only acknowledgement, offers a rollback operation, writes the
migration ledger, or can select another target. Stop at the first SQL error. Do
not retry or attempt cleanup without a new inspection and separate authority.

After 118 commits, 115-118 are retained as a unit. Reverting 115, 116, or 117
under the repaired 118 catalog would create a noncanonical partial state. Gate
119 may only be considered for separately authorized rollback while its dispatch
table is empty; this runbook does not grant that authority.

## Phase 3: managed verification and zero-residue receipt

Verification temporarily exercises only database RPC behavior inside one
transaction and one named savepoint. Its exact confirmation is:

```text
VERIFY_115_119_SAVEPOINT_ONLY_bzxqbvmrkmjyvudlspss_ZERO_RESIDUE
```

The verifier must check:

- exact table, column, constraint, index, trigger, owner, function body/security,
  immutable-evidence, forced-RLS, no-policy, ACL, and service-only execute
  contracts for 115-119;
- validated/immediate constraints and every false authority field;
- Gate 118's repaired source constraint, list/record functions, source-batch
  ownership, success guard, replay/collision behavior, and exact zero/nonzero
  response semantics;
- a digest-only synthetic chain under the named savepoint: admission, dispatch
  claim without provider fetch, zero- and nonzero-offer source recording,
  projection completion, safe projection read, replay/collision refusal, and an
  expired encrypted-reference purge;
- rollback to the savepoint, followed by zero rows in every predecessor and
  115-119 evidence table and zero verification-harness objects;
- the migration-ledger snapshot is unchanged and still contains no 115-119
  entry.

The probe must not contain a provider token, make an HTTP request, call Duffel
or Stripe, create an order or payment, deploy code, or access Production.

Only after all checks pass may an operator copy
`docs/evidence/FLIGHT_CONSUMER_PUBLIC_SHOPPING_UAT_115_119_TEMPLATE.json` to a
date-stamped acceptance filename and replace the null observation fields with
sanitized results. The template itself must remain unexecuted and must never be
renamed or edited into a false PASS receipt.

The resulting acceptance record must explicitly state:

- `object_applied_not_ledgered_in_isolated_uat`;
- exact project ref/branch/database/user/PostgreSQL version and source commit;
- all ten forward/rollback hashes plus the managed-package hashes;
- catalog, RLS, ACL, append-only, replay/collision, zero/nonzero, and purge
  results;
- synthetic residue, provider requests, Stripe requests/mutations, orders,
  charges, and tickets all equal zero;
- Production access, deploy, route/release change, and ledger mutation all
  equal false.

## SQL Editor fallback

SQL Editor may be used only if no reviewed `psql` path is available and the
operator has an authenticated session in the exact isolated UAT project. Before
every query, verify the dashboard URL and editor header both show
`bzxqbvmrkmjyvudlspss`. Use a new clean query for each preflight, each of the
five migrations, each read-only checkpoint, and the final verifier.

The renderer must generate target-bound, hash-pinned preflight/checkpoint/
verification text. If it does not implement every required checkpoint and the
separate Gate 118 acknowledgement, SQL Editor application is not authorized.
Never reuse a buffer, concatenate phases, add a ledger statement, or run a
migration other than the five exact files listed above.

## Cleanup and evidence hygiene

Remove the password from the shell without printing it:

```powershell
Remove-Item Env:FLIGHT_MANAGED_115_119_DB_PASSWORD
```

Store only sanitized receipts and hashes. Do not store credentials, connection
URLs, session/query identifiers, raw Duffel offer identifiers, Stripe object
identifiers, or synthetic secrets. This UAT gate does not authorize a Production
apply, provider canary, payment, booking, deploy, or consumer release.

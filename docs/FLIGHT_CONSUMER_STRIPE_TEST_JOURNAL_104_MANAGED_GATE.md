# Flight Consumer migration 104 managed gate

This package applies and verifies only the exact Stripe TEST execution-journal
migration `202608260104`. It has no default database target or operation.

The immutable source artifacts are:

| Artifact | SHA-256 |
| --- | --- |
| Forward migration 104 | `50dcca75f06111de027833ca138519dbe7f71e91bfd5ca9839fa9425699dfa1b` |
| Rollback 104 | `10d9095be8250a1f50247534aa98e8fc35f51a06211458b5f19f1df43d9d2328` |
| Managed preflight SQL | `3f29163d5b5cdf73a484a710e0bc19bcb60fda806eb4ec173984c8869bd83ef0` |
| Managed verification SQL | `4e8a19e5960208aedbb639fcfacdf6c6a22246b7dc12ce383cf410e36298b65b` |

The forward and rollback hashes are the existing canonical hashes. This gate
does not modify either migration file.

## Approved targets

The targets are deliberately different and are not interchangeable.

| Runner target | Supabase project ref | Required database identity |
| --- | --- | --- |
| `isolated_uat` | `exipwtvyjaihsvdhsbbt` | Migration 103 objects exist; Preview runtime controls are absent |
| `preview_runtime` | `eiqmdldjnedqgbtoozqa` | Canonical flight runtime controls exist and remain fully locked: kill switch engaged with every traffic, commerce, event, servicing, and release capability disabled |

The runner also binds the connection before executing SQL. A direct connection
must use host `db.<selected-ref>.supabase.co` with user `postgres`. A managed
Supabase pooler connection must use a `*.pooler.supabase.com` host with user
`postgres.<selected-ref>`. Local databases, raw IPs, port values other than
`5432`, arbitrary SQL files, and database URLs are refused.

These checks are intentionally redundant. PostgreSQL itself does not expose a
universal intrinsic Supabase project-ref value, so a receipt's project-ref is a
runner-bound managed-target assertion rather than a newly invented database
invariant. Runtime activation/binding is deliberately not a prerequisite for
104; that is a later, separately authorized gate.

## Connection setup

Use an absolute path to the managed operator's `psql` binary. Supply connection
fields only through the dedicated environment variables; never put a password
or connection URL on the command line or in an evidence file.

```powershell
$env:FLIGHT_MANAGED_104_DB_HOST = 'db.<selected-ref>.supabase.co'
$env:FLIGHT_MANAGED_104_DB_PORT = '5432'
$env:FLIGHT_MANAGED_104_DB_NAME = 'postgres'
$env:FLIGHT_MANAGED_104_DB_USER = 'postgres'
$env:FLIGHT_MANAGED_104_DB_PASSWORD = '<masked managed-database password>'
```

The child process receives only a small operating-system allowlist plus the
five reviewed PG connection fields. TLS is pinned to `verify-full`; the runner
does not inherit unrelated parent-process secrets.

## Read-only preflight

Preflight has no confirmation flag and starts a PostgreSQL read-only
transaction. It checks the selected target identity, PostgreSQL 17, required
Supabase roles, target-specific predecessor state, complete object absence, and
absence of a migration-104 ledger entry.

```powershell
npm run flight:managed-104 -- `
  --operation=preflight `
  --target=isolated_uat `
  --psql='C:\absolute\path\to\psql.exe'
```

Use `--target=preview_runtime` only after switching every connection field to
the reviewed Preview runtime project.

## Apply and verify

This operation performs three fail-fast sessions in this order:

1. read-only target/collision preflight;
2. exact hash-verified migration 104 object apply;
3. exact catalog, RLS, ACL, runtime, and zero-residue verification.

The confirmation is target-specific:

```powershell
npm run flight:managed-104 -- `
  --operation=apply-verify `
  --target=isolated_uat `
  --psql='C:\absolute\path\to\psql.exe' `
  --apply-confirmation=APPLY_104_OBJECTS_ONLY_exipwtvyjaihsvdhsbbt_NO_LEDGER
```

For Preview runtime, the exact confirmation is:

```text
APPLY_104_OBJECTS_ONLY_eiqmdldjnedqgbtoozqa_NO_LEDGER
```

The apply creates only migration-104 objects. It does **not** insert into
`supabase_migrations.schema_migrations`; the resulting state is intentionally
"object applied, not ledgered" unless a separately reviewed lineage policy is
later authorized.

### Exact Supabase SQL Editor qualification sequence

Use this sequence only after the operator has separately confirmed the schema
apply. It prepares exact target-bound text for SQL Editor without opening a
database connection from the repository.

1. Open the selected Supabase project. Verify the signed-in organization,
   project name, project ref in the dashboard URL, and the SQL Editor project
   header. For Preview, the ref must be `eiqmdldjnedqgbtoozqa`; for isolated
   UAT, it must be `exipwtvyjaihsvdhsbbt`.
2. Open a clean SQL Editor query. Do not reuse a buffer containing diagnostic,
   harness, ledger, or prior migration text.
3. Render the selected target's pinned read-only preflight directly to the
   clipboard, paste it into the clean query, and run it alone:

   ```powershell
   node scripts/render-flight-consumer-stripe-test-journal-104-managed-sql.mjs `
     --target=preview_runtime --phase=preflight | Set-Clipboard
   ```

4. Continue only if the single receipt says `result: PASS`, reports the exact
   selected target/ref, `target_objects_absent: true`,
   `migration_104_ledger_entry_absent: true`, and `writes_performed: false`.
5. In the terminal, recheck the canonical forward file immediately before
   copying it. The printed hash must be exactly the pinned forward hash:

   ```powershell
   Get-FileHash `
     supabase/production-migrations/202608260104_flight_consumer_stripe_test_execution_journal.sql `
     -Algorithm SHA256
   ```

6. Open a second clean SQL Editor query. Copy only the canonical migration file
   (never the disposable runtime fixture), paste it, and run it alone:

   ```powershell
   [System.IO.File]::ReadAllText((Resolve-Path `
     'supabase/production-migrations/202608260104_flight_consumer_stripe_test_execution_journal.sql')) `
     | Set-Clipboard
   ```

7. Confirm the editor reports a committed transaction and no error. Do not add
   or repair a migration-ledger row.
8. Open a third clean SQL Editor query. Render, paste, and run the exact
   target-bound verifier alone:

   ```powershell
   node scripts/render-flight-consumer-stripe-test-journal-104-managed-sql.mjs `
     --target=preview_runtime --phase=verification | Set-Clipboard
   ```

9. Accept the gate only if the receipt says `result: PASS`, the target/ref are
   exact, `synthetic_rows_after_savepoint_rollback: 0`,
   `verification_harness_objects: 0`, and
   `migration_104_ledger_entry_present: false`.

For isolated UAT, replace `preview_runtime` in both render commands with
`isolated_uat`; do not change or hand-type either project ref. Never concatenate
the preflight, migration, and verifier into one editor execution. A failure at
any step stops the sequence and does not authorize a blind retry or rollback.

## Verify an already applied target

Verify-only is available when the exact migration was applied through a
separately controlled channel. It requires a different target-specific
confirmation because it temporarily inserts synthetic digest-only rows:

```powershell
npm run flight:managed-104 -- `
  --operation=verify `
  --target=preview_runtime `
  --psql='C:\absolute\path\to\psql.exe' `
  --verify-confirmation=VERIFY_104_SAVEPOINT_ONLY_eiqmdldjnedqgbtoozqa_ZERO_RESIDUE
```

The synthetic probe runs inside the enclosing transaction and one named
savepoint. It tests service-role direct-table denial, prepare/replay,
one-field-drift refusal, malformed-evidence refusal, lease CAS, a bounded
Stripe TEST observation, and every zero-authority field. It then rolls back to
the savepoint and proves all three journal tables contain zero rows.

Unlike the disposable PostgreSQL test fixture, the managed verifier never
creates a harness schema, helper function, table, extension, or other
verification object. It fails if the historical `flight_stripe104_harness`
schema is present and checks again after the savepoint rollback.

## Scope and cleanup

This gate does not call Stripe or Duffel, create a PaymentIntent, charge or
refund money, create an order, issue a ticket, enable public traffic, apply a
rollback, or authorize any of those actions. The rollback remains a separately
pinned emergency artifact and requires separate approval.

After any operator run, remove the password from the shell without printing it:

```powershell
Remove-Item Env:FLIGHT_MANAGED_104_DB_PASSWORD
```

Store only the sanitized PASS receipts, the selected target kind/ref, the four
artifact hashes, and the observed object/ledger disposition. Never store the
password, host credential material, session identifiers, query identifiers, or
raw provider identifiers.

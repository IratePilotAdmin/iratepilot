# Flight Preview migration gate — 2026-08-24

## Status

Implemented, locally verified, and applied to the exact approved Preview database. The
Preview ledger now contains migrations 068 through 071; Production was not contacted or
changed.
Repository publication is approved only to the private backup branch
`agent/flight-live-foundation-20260823`; public repository publication is not authorized.

The gate is dedicated to flight migrations 068 through 071. It does not modify or extend the
legacy general Preview migration allowlist.

## Fixed scope

- Approved Preview project ref: `eiqmdldjnedqgbtoozqa`
- Hard-blocked Production project ref: `allliumarkejinplrggl`
- Any non-empty `PRODUCTION_SUPABASE_PROJECT_REF` is also treated as a Production ref and
  blocked.
- Required remote history: the repository migration ledger through
  `202608170067_automation_sandbox_executor.sql`
- Only accepted pending states:
  1. exactly 068, 069, 070, and 071 in order; or
  2. none pending because all four are already installed.

The four permitted files are byte-pinned:

| Order | Migration | SHA-256 |
|---:|---|---|
| 1 | `202608230068_flight_commerce_foundation.sql` | `29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d` |
| 2 | `202608240069_flight_provider_request_attempts.sql` | `7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611` |
| 3 | `202608250070_flight_duffel_test_order_attempts.sql` | `882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe` |
| 4 | `202608250071_flight_duffel_preview_rpc_bridge.sql` | `bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d` |

Any changed digest, missing history, local/remote ledger mismatch, unexpected migration,
partially installed 068–071 set, unknown argument, target mismatch, or verification failure
stops the gate.

## Target and secret handling

The operator must inject these environment variables through the approved secret-handling
workflow:

- `PREVIEW_SUPABASE_PROJECT_REF` must equal `eiqmdldjnedqgbtoozqa` exactly.
- `PREVIEW_SUPABASE_DB_URL` must be the PostgreSQL connection URL for that exact project.
- `PRODUCTION_SUPABASE_PROJECT_REF`, when configured, must identify Production and must not
  equal the approved Preview ref.

The database URL is accepted only for an official Supabase direct host or pooler host whose
database username contains the exact approved Preview ref. The database must be `postgres`;
arbitrary hosts, paths, query parameters, protocols, usernames, ports, and project refs are
rejected.

Do not paste the database URL into a command argument. The script never prints the URL,
password, environment values, or captured Supabase CLI output. It invokes the fixed
`supabase` executable directly with shell execution disabled and does not accept a custom CLI
path. The password is removed from the derived `--db-url` argument and supplied only through
the child process's `PGPASSWORD` and `SUPABASE_DB_PASSWORD` variables. The child receives a
minimal operating-system environment allowlist; the original Preview URL, access tokens, and
unrelated environment secrets are not inherited.

## Operator procedure

Run from the repository root after the exact environment has been injected.

### 1. Plan only

Planning is the default and performs no CLI, network, or database operation:

```text
node scripts/apply-flight-preview-migrations.mjs --plan
```

The plan reports only fixed non-secret gate metadata, file digests, migration order, and the
required confirmation flag.

### 2. Apply with exact confirmation

Only after reviewing the plan and receiving the separate shared-Preview approval, run:

```text
node scripts/apply-flight-preview-migrations.mjs --apply-confirmation=PREVIEW_eiqmdldjnedqgbtoozqa_FLIGHT_068_071
```

No shorter `--apply` or `--yes` mode exists.

## Apply sequence

The apply mode executes this bounded sequence with the validated URL:

1. Read the remote migration ledger.
2. Require local history to match the repository exactly.
3. Require remote history through 067 and pending migrations to be exactly `[068, 069, 070, 071]` or
   `[]`.
4. If pending, run a Supabase dry-run and require its migration references to be exactly 068
   through 071, once each and in order.
5. Recheck both pinned file hashes and the remote ledger immediately before mutation. If a
   concurrent operator has already installed all four migrations, skip the redundant push.
6. If they remain pending, use the Supabase CLI to push the four migrations in that order.
7. Recheck the pinned file hashes and remote ledger, requiring all four migrations to be
   installed.
8. Take a read-only `public` schema dump and verify the required flight key column contracts,
   exact RPC signatures, enabled RLS, and forced RLS.

If all four migrations are already installed, the gate does not push again; it still performs
the physical schema and RLS verification.

The final schema-dump result is deliberately reported as a **physical schema boundary**
verification: a narrow object-presence, key-signature, and forced-RLS sanity check. It is not
an exact ACL or definition attestation and does not claim that every remote function body,
constraint, policy, or ACL is byte-for-byte identical to the repository. The byte pins prove
the files selected for apply; a complete post-apply catalog attestation remains a separate
gate if that stronger claim is required.

## Failure and recovery boundary

The gate does not repair migration history, mark migrations as applied, run rollbacks, accept
a partially installed set, or continue after a verification failure. If any migration fails,
stop. Preserve the captured operator evidence outside public logs and perform a
separate incident review before any remediation. Do not bypass the ledger check.

These migrations remain default-off foundations. Applying them does not authorize provider
traffic, orders, payments, ticketing, email, customer advertising, Production deployment, or
live booking.

## Local verification

`tests/flight-preview-migration-gate.test.ts` covers:

- exact file digests and order;
- exact Preview identity and official URL shapes;
- Production and mismatch refusal;
- default plan behavior and exact apply confirmation;
- no secret disclosure in summaries and errors;
- complete, partial, missing, unexpected, and drifted ledger states;
- exact dry-run order;
- fixed non-shell CLI command sequence;
- post-apply physical key-column, exact-function-signature, and forced-RLS evidence; and
- already-installed verify-only behavior.

The test suite uses an injected in-memory runner. It does not contact Supabase or execute the
Supabase CLI.

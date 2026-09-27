# Revenue AI PMS-only Preview preflight

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

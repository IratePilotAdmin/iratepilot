# SynXis controlled production rollout

This runbook turns the verified read-only production inventory into a controlled write plan. It is
not write authorization. Keep the release PR in draft, do not merge or deploy the application, and
do not enable SynXis traffic until the relevant gate below receives explicit approval.

The canonical ordered version lists are in
`supabase/production_synxis_rollout_manifest.json`. Never infer repair versions from a missing
migration-history table, and never replay migrations 001 through 038 against the existing schema.

## Verified backup posture

The production Supabase project was inspected read-only on 2026-08-13. Daily physical database
backups were present, including a backup created at `2026-08-13 11:16:39 UTC`. Point-in-time
recovery was not enabled. Supabase also warns that database backups do not restore Storage API
objects; they cover database metadata, not deleted storage objects.

This observation is evidence for planning only. Immediately before any approved write, record the
newest backup timestamp privately and confirm it is recoverable. Stop if that cannot be verified.

## Phase 29: repair migration history only

Phase 29 is a production write and requires a fresh, explicit approval naming migration-history
repair. Before execution:

1. Verify the production project identity and a current daily backup in the dashboard.
2. Run both read-only preflights in a clean session and save results privately:
   `supabase/production_preflight.sql` and
   `supabase/production_migration_026_038_preflight.sql`.
3. Compare the live policies, grants, constraints, and function bodies for every version in
   `historyRepairCandidates` with the repository migration. Boolean existence markers alone are
   insufficient.
4. Run `supabase migration list` and stop if history is no longer empty or differs from the saved
   evidence.
5. Review one exact repair command per verified version immediately before execution. The CLI form
   is `supabase migration repair --status applied <version>`. Do not paste the entire list into an
   autosaved SQL editor and do not mark 039 through 048 as applied.
6. Re-run `supabase migration list` and confirm that only the verified 001-through-038 versions are
   recorded. Do not apply schema migrations in this phase.

If any comparison fails, stop and prepare a forward reconciliation migration instead of repairing
that version's history.

## Phase 30: apply migrations 039 through 048

Phase 30 is a separate production write and requires separate explicit approval after Phase 29 is
verified. Apply only the ordered versions in `pendingDeploymentVersions`. Verify each boundary
before continuing:

1. 039: distributed rate-limit table and reservation function.
2. 040: ordered SynXis launch-evidence gates; `live_enabled` remains false.
3. 041: immutable evidence audit history.
4. 042: request journal and single-transition receipt contract.
5. 043: immutable certification-export issuance receipts.
6. 044: schema-2 receipt binding.
7. 045: property-level hotel onboarding requests.
8. 046: integration-only access for general, revenue, and sales managers.
9. 047: email-bound owner invitations and atomic acceptance.
10. 048: invitation revocation, member deactivation, and immutable access events.

After 048, re-run the read-only production preflight. All 039-through-048 markers must resolve, the
application readiness endpoint must report all four manager-onboarding gates available, and
`live_enabled` must remain false.

## Phase 31: application deployment and acceptance

Only after the database is compatible may the draft PR be approved for merge and production
deployment. Verify this sequence with a designated test partner and non-production email address:

1. Admin Settings loads the SynXis readiness, audit, journal, export, and manager-onboarding panels
   without a missing-migration warning.
2. An approved hotel owner invites one manager with the intended general, revenue, or sales role.
3. The matching authenticated account accepts the invitation; a different email cannot accept it.
4. The active manager submits an onboarding request only for the owner's authorized property and
   with a representative role matching the membership.
5. The owner disables the membership and the manager immediately loses integration access.
6. The owner revokes a second pending invitation and both lifecycle actions appear in immutable
   access-event history.
7. No credential, Hotel ID, email address, invitation record, or SOAP body appears in public logs
   or aggregate readiness responses.

Passing Phase 31 makes controlled hotel onboarding available to authorized owners and managers. It
does not make live SynXis traffic available.

## Phases 32 and 33: external launch

Phase 32 completes Sabre approval, provisioned certification access, property/room/rate/channel
mapping, certification scenarios, and the controlled production smoke test. Phase 33 requires an
administrator's separate explicit live-traffic approval after every persisted evidence gate is
complete. Configuration, deployment, or manager onboarding must never activate traffic implicitly.

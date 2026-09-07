# iRatePilot initial booking baseline and activation

Status: implemented and tested locally only. No Supabase migration, connection activation, scheduler, or hosted-site update was performed.

## What this adds
Migration 140 follows 139. Existing bookings with check_out on or after an explicitly chosen business date become version-1 outbox snapshots. Preparation atomically enables continued change capture while delivery stays disabled. Repeating the original request does not duplicate events. Release records an operator review reference and opens delivery. Client roles cannot prepare/release; service_role cannot directly toggle the configuration.

## Sandbox operator procedure
1. Confirm the database target and isolate a sandbox property. The observed project was iratepilot-preview-20260817 (eiqmdldjnedqgbtoozqa); its dashboard also displayed main PRODUCTION. Its name alone does not establish isolation. Stop the worker before applying migrations 139 then 140.
2. Insert a disabled sandbox connection using property_id, connection_id, tenant_id and pms_property_id. Keep signing secrets outside these tables. Confirm the receiver maps this exact identity to the intended sandbox tenant/property.
3. Choose the baseline business date and retain one request UUID. Count and inspect source bookings for this property with check_out >= that date. Include pending, confirmed, cancelled and refunded rows. The selected baseline is limited to 1,000 rows. Old bookings are excluded from the initial snapshot; subsequent changes to them may still be captured.
4. Call irp_pms_prepare_baseline(property UUID, request UUID, from date, expected integer count). A changed count rejects the operation; recount and review before retrying. The operation briefly blocks ALL booking writers, including other properties, through a table lock. Use an operator transaction with suitable lock_timeout and statement_timeout; this is a bounded sandbox procedure, not a production bulk migration tool.
5. Inspect irp_pms_baseline_runs, the selected version-1 outbox payloads, source identifiers, amounts and statuses. Reconcile room-type mappings and receiver scope. Check that delivery_enabled is false while enabled is true. Edits now queue additional versions. Review any preexisting history separately; preparation refuses a connection with existing events or version heads.
6. After reconciliation, call irp_pms_release_baseline(property UUID, same request UUID, review reference of 8–200 characters). The reference is an operator attestation, not automated proof of reconciliation. Start the separately configured worker and inspect receiver acknowledgements/review results. Pending/refunded snapshots can require review in the adapter. Per-booking later versions remain blocked until the earlier event is delivered.
7. Verify both source delivery records and receiver staging. This does not yet write reservations into the hosted PMS/D1 demo and does not establish a live OTA connection.

## Stop and rollback
Stop the worker first and account for in-flight HTTP requests: disabling a flag cannot recall a request already sent. Run rollback 140 before rollback 139. Rollback 140 disables capture/delivery, removes prepare/release entrypoints and retains the delivery gate, restrictive grants, baseline ledger and outbox evidence. Rollback 139 can then remove capture entirely. This is a fail-closed shutdown, not restoration of the old unrestricted claim behavior. Resume requires a separately reviewed recovery procedure; replaying the same release reference is not a resume operation.

## Verification
14 activation checks pass in PGlite PostgreSQL using the observed Preview booking-trigger/payment-constraint fixture and minimal related tables. They cover count rejection and atomic rollback, size limit, permissions, date filtering, idempotent preparation, held delivery, continued versions, matching review identity, ordered claims, immutable release reference, and rollback retention. Testing found and fixed an ambiguous PL/pgSQL alias. These checks do not establish multi-session concurrency performance, production compatibility, or remote execution.

This is an initial OTA booking baseline, not full PMS migration. Guest profiles, deposits/balances, taxes, historical ledgers, payment credentials, locks/POS/accounting integrations and production cutover remain separate work.

# Backup and restore runbook

This runbook is a launch gate. It does not authorize a production restore, supplier activation, payment capture, or SynXis traffic.

## Recovery objectives

| Stage | Database RPO | Storage RPO | RTO |
| --- | --- | --- | --- |
| Private pilot, current maximum | 24 hours | Not yet guaranteed | 4 hours |
| Commercial launch target | 15 minutes or better using PITR | 24 hours or better | 2 hours |

The targets are not considered met until a timed restore drill is documented. Supabase database backups do not restore deleted Storage objects; Storage needs a separate versioned copy or export procedure.

## Daily evidence

1. Record the production project ID, newest successful backup timestamp, retention window, and verifier.
2. Confirm the migration ledger matches the repository through the approved version.
3. Verify Storage backup age separately.
4. Open an incident if either backup exceeds its RPO. Never copy credentials into the evidence record.

## Restore drill

1. Obtain explicit approval and restore into an isolated non-production project.
2. Record backup identity and start time. Do not point production applications at the drill.
3. Apply only migrations newer than the restored backup, in order.
4. Verify authentication, RLS, property/room/inventory counts, booking and financial ledgers, email outbox, and webhook event ledgers.
5. Restore representative Storage objects and compare checksums.
6. Run `/api/health` and the local commercial sandbox preflight with every live flag disabled.
7. Record achieved RPO/RTO, discrepancies, owner, and remediation due date. Destroy the isolated drill environment only under separate approval.

## Production recovery gate

Recovery requires an incident commander, database owner, application owner, current backup identity, rollback point, customer-communication decision, and separate production-write approval. Payment or supplier traffic must stay disabled until reconciliation is complete.

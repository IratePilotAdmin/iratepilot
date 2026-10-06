# Abandoned supervisor review recovery

PMS migration `20260930174855_revenue_abandoned_review_recovery.sql` adds explicit recovery of a review whose assigned user no longer has an owner or manager membership in that tenant. It belongs in `pms-migrations/`, outside the OTA migration chain.

The queue returns a `reclaimable` hint, without exposing the former user's identity. The private interface offers **Claim abandoned review** only for that hint. Old responses without the hint remain supported. Freshness/offline restrictions remain in place.

The hint is not authorization. The review RPC re-checks the caller's current manager access after the property advisory lock, then locks the issue and checks its expected revision. For another assignee, it reads that tenant membership with `FOR SHARE`. Only `claim` may recover an assignment whose member is absent or has a staff role; an owner/manager assignee remains protected. A membership restoration already committed before this check blocks recovery. When no membership exists, this is an absence check at that transaction's statement snapshot, not a lock on a nonexistent row.

Recovery changes the assignee to the caller, moves status to in_review and advances revision once. The existing claim audit event stores a receipt with `reclaimed=true` and `previous_assignee`; repeated identical requests replay it without another event. These identities stay in the authenticated audit receipt, not the queue listing. Release, acknowledge and reopen cannot bypass another assignee.

The administrator-only script `scripts/qualify-revenue-abandoned-review.sql` passed against the actual PMS database. It briefly uses two existing identities in a new isolated tenant inside a rolled-back subtransaction. It creates no user and changes no real membership.

| Case | Result |
| --- | --- |
| Active manager takeover | Denied |
| Demoted staff assignment | Queue hint and claim succeeded |
| Recovery receipt retry | Replayed without an extra event |
| Restored active supervisor | Protected |
| Removed membership | Claim succeeded |
| Stale revision | Rejected with SQLSTATE 40001 |
| Release before claiming | Denied |
| Caller demoted to staff | Denied |

All fixture and queue observation writes rolled back. This is sequential database qualification, not a simultaneous permission-restoration test or full mobile/HTTP qualification. Forecast accuracy and signed PMS-to-OTA HTTP validation remain open. Rate writeback stays disabled.

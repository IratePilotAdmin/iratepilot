# Revenue AI verified status — September 28, 2026

This ledger records observed state for the first milestone in the Revenue AI product plan. Counts and deployment state were checked on September 28, 2026; they can change. It is not a release approval.

| Surface | Observed state | Consequence |
| --- | --- | --- |
| GitHub | Draft PR #309 on `revenue-pms-private-handoff`; head `e3282e645755f599bb79347fa2922c2460c6319e`; Vercel status successful at that head. | Code remains unmerged. Preview compilation is not a live hotel connection. |
| Repository migrations | 78 SQL files, through pending `202609270159_pms_only_properties.sql`. | The local history does not include production's `202608220062` and `202608220063` fee migrations. |
| Supabase production (`allliumarkejinplrggl`) | Healthy project; 79 ledger entries through `202609070158`; `properties.pms_only` absent; zero revenue inputs and zero recommendations. | The pending PMS-only migration has not been applied. Revenue AI must remain disabled. |
| Supabase preview branch (`tztrvyhqyhkjhjwhrbaa`) | Branch status `MIGRATIONS_FAILED`; 72 ledger entries through `202608150061`; `properties.pms_only` absent; zero revenue inputs and recommendations. | Six repo migrations `139`, `140`, `141`, `157`, `158`, `159` are pending here. Do not use this branch as proof of a clean replay. |
| Red Roof Inn Ridgeland | Production has one existing record named `Red Roof Inn Ridgeland, MS`, inactive, with three room types and zero PMS connections. Preview has no matching record. | Its slug marks it as a test record; that is not evidence of an authorized live feed. Check ownership and source data before reuse; avoid creating a duplicate. |
| Application gates | `REVENUE_AI_ENABLED=false` in the example configuration. Recommendation and review routes require explicit `true`; PMS-only approval and authenticated rate writes have server/database guards in the pending code. | Do not enable live generation, approval, or rate publishing until schema, property access, and feed reconciliation pass. |

## Verified test scope

- Local TypeScript, lint (zero errors), all 947 tests, and production build passed at the PR head before this ledger update.
- On the preview database, the pending migration and synthetic hotel/user fixtures were executed in transactions and rolled back. Generation, PMS-only approval denial, rejection, standard approval, and stale-rate denial passed. Post-rollback checks found no retained fixtures or `pms_only` column.
- These transaction tests do not repair the branch's historical migration failure or prove an authenticated application session with a real hotel feed.

## Next gate

Reconcile the two production-only fee migrations with repository history through the approved review process, then make staging migration replay repeatable. The automatic approval review previously rejected publishing the recovered SQL as sensitive; this ledger does not include that SQL or authorize its publication. Once a clean staging branch exists, verify tenant access and the private Red Roof record with an authorized, de-identified export. Keep all rate writes disabled until a currently operating hotel's scoped publish and readback are verified.

# Isolated Home read-service prerequisite

This gate tests only the missing Home service boundary. It does not qualify the
full Home DOM, private-preview authorization, populated hotel inventory, iPhone
installation/recovery, forecasting or revenue outcomes.

Target is exclusively the nondefault synthetic branch `ybehrayzwzyufxbxcysq`.
The live parent `eiqmdldjnedqgbtoozqa` must remain read-only.

Before installation, nine workspace table column inventories matched the live
parent, as did the complete definitions of `pilot_require`,
`maintenance_capacity` and `inventory_occupies`. The isolated branch was missing
both public Home read services. Installed definitions retain the live parent's
stable, security-definer functions and `search_path=pg_catalog`:

| Function | Definition MD5 |
| --- | --- |
| `irp_pms_pilot_workspaces()` | `514bc9b4b0296872cff8e45de144e21a` |
| `irp_pms_pilot_workspace(uuid,uuid)` | `8fc5d16c1b2928de3f9d8d7c0da5be6f` |

Only `authenticated` receives EXECUTE. PUBLIC, anon and service_role are revoked.
Existing membership-based authorization remains in each definition. No tables,
rows, authorization helper, supervisor function or rate permission is changed.
The optional `workspace_sync` capability is absent in both inspected databases;
Home already falls back to periodic refresh.

Dispatch the existing Revenue Auth audited-write HTTP workflow on
`revenue-ai-forecast-evidence-20260930`, choosing `home-services`. This mode uses
the existing protected qualification environment and reads only the preserved
synthetic baseline. It signs in the three pinned actors and signs each out.
Credentials and tokens are never written to artifacts or copied to local files.
Every request is restricted to two Auth endpoints and the two Home read RPCs.

Acceptance requires eleven checks: two anonymous denials, and each role's
membership scope/role, scoped workspace read and unauthorized-property denial.
The baseline intentionally has no rooms, reservations, capacity or activity;
successful empty reads do not establish inventory reconciliation.

After any run, independently verify the unchanged baseline hash
`de351429652dba7c629ff9c705355a1b`, unchanged supervisor definitions and denied
rate-apply EXECUTE for anon/authenticated/service_role. No fresh fixture is used
and no test data needs deletion. The two read services remain installed as the
next isolated Home gate's prerequisite. Overall MIGRATIONS_FAILED status is not
resolved or hidden by installing this slice.

Next gate must exercise actual private-preview verification, Auth, Home,
membership/workspace services and supervisor recovery together. Simulated
authorization responses are not proof of that gate.

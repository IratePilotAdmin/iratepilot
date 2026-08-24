# Flight PostgreSQL runtime acceptance — 2026-08-24

Status: **PASS for local disposable PostgreSQL behavior and concurrency only; exact `server-only@0.0.1` locally installed and poison-pill verified; approved only for publication to the private backup branch `agent/flight-live-foundation-20260823`; no public repository publication; no shared, Preview, or Production database application; no provider credential or traffic; default-off/HOLD; not launch ready**

## Outcome

PASS on an ephemeral PostgreSQL 16.15 cluster bound to `127.0.0.1:64997` under the confirmed `codex-flight-pg-d5f05d63eba94fc191591c5702b51e05` temporary data path.

- Behavior evidence database: `flight_gate_behavior_1f6a3d90`
- Clean-rollback database: `flight_gate_rollback_1f6a3d90`
- Network scope: loopback only
- Local authentication: temporary isolated `trust` authentication inside the loopback-only disposable cluster
- Provider traffic: none
- Credentials, `.env` files, connection URLs, Preview, and Production: unused
- Database disposition: temporary audit evidence only; the runner never drops or reuses a target database, and the exact cluster and its databases are destroyed after audit. Their later absence is expected and this document does not claim that they remain available.

No existing database service, shared database, Preview environment, Production environment, application privilege, or deployment was touched.

## Server-only dependency proof

The exact `server-only@0.0.1` package was downloaded from the official npm registry URL already pinned in the lockfile, verified against its lockfile SHA-512 integrity, and extracted locally without changing `package.json` or `package-lock.json`.

- Ordinary ESM loading throws the intended client-import poison pill.
- Ordinary CommonJS loading throws the intended client-import poison pill.
- Loading with the `react-server` condition resolves the package's empty server entry.
- Package manifest SHA-256: `E4B0CC01E2E0349C51C694FA97D8A642EB8322521CA1444B20BD1842594B4339`.
- Poison-pill `index.js` SHA-256: `2C4720B71EB03E5F75A83D43E6FD83C0446AA172A58A4D6FFBD74ECAD72BA7B5`.
- Empty server entry SHA-256: `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

This verifies only the local server/client import boundary. It does not configure the transport, credentials, a route, provider traffic, or a deployment.

## Reviewed bytes

| Artifact | SHA-256 |
| --- | --- |
| Migration 068 | `29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d` |
| Migration 069 | `7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611` |
| Rollback 069 | `16fee4c1e7b4fdcf14a68a06f3e09b43947d7dde4643b5ed6b30d43f8c6ba30d` |
| Rollback 068 | `7013118e4f5a42b8f883f75aaa06abaeb68c51dd489be4844cd86a9cc3a6b1ae` |
| Bootstrap schema | `a92caef22676ef7c59677fc176566262171dc477b2ef2e82b2acdee160ab9340` |
| Acceptance runner | `cb3edfb0aec410a1c3fd8f647963f00b6d7b247105bdd75ad621885808d8a9c4` |
| Runtime SQL | `3f1893cd92b3f896eb2ed76347dc0b9f5280387bc6be64386061e5da5ec18edb` |
| Static runner test | `44fcb1738226be73e5c128a9b718aadbbaa876b127bf8ae40fdb8aef0112750d` |

The pinned 068 bytes include the corrected parenthesized `IS DISTINCT FROM (CASE ... END)` expression. The pinned 068 rollback refuses while the dependent 069 journal or preparation function remains installed.

## Defects found and corrected

Running the exact SQL against PostgreSQL found two blockers that repository-static checks had not established:

1. Migration `068` used an unparenthesized `CASE` expression after `IS DISTINCT FROM`; PostgreSQL rejected it. The migration and its exact bootstrap-schema mirror now use `IS DISTINCT FROM (CASE ... END)`.
2. Rollback `068` could previously remove the foundation while migration `069` remained installed. It now refuses while the dependent journal table or preparation function exists.

The corrected bytes were then applied and exercised in fresh disposable databases. The clean rollback passed only in the required `069` then `068` order.

## Runtime proof

The runner verified the PostgreSQL server address, high port, administrator session, non-recovery state, version, and GUID-bound temporary `data_directory` before creating anything. It then created only two new names matching the strict `flight_gate_*` allowlist and installed minimal local Supabase-compatible prerequisites.

It also proved that applying migration `069` before migration `068` fails closed without leaving partial journal objects.

The behavior database proved:

- migration 068 followed by 069 applies from the exact pinned files;
- the kill switch and every execution capability start disabled;
- forced RLS, table ACLs, RPC ACLs, and journal defaults match the contract;
- an authenticated administrator can activate only test-mode sandbox shopping for the exact database, session, provider, and execution scope;
- live, order, mismatched provider/scope/evidence/point-of-sale, and mismatched opaque receipts fail closed;
- `create_order` remains explicitly unauthorized;
- prepare/claim/complete transitions produce succeeded, failed, ambiguous, and never-dispatched blocked evidence;
- duplicate request identity, stale CAS, retry authorization, direct mutation, deletion, and authenticated table access fail closed;
- two independent PostgreSQL sessions raced the same prepared row after the winning transaction's post-claim advisory marker was observed: one claim succeeded and the blocked claimant failed exact CAS;
- rollback 069 refuses after request evidence exists, and rollback 068 refuses while 069 remains installed.

Recorded terminal evidence at acceptance time is:

| State | Rows | Revision | Retry authorized |
| --- | ---: | ---: | --- |
| `succeeded` | 1 | 2 | false |
| `failed` | 1 | 2 | false |
| `ambiguous` | 2 | 2 | false |
| `blocked` | 1 | 1 | false |

The clean-rollback database first proved that rollback 068 refuses when 069 is still installed. It then rolled back 069 followed by 068 and verified that no flight migration relations or functions remained while the prerequisite `profiles` and `auth.users` tables remained intact.

## Repository verification

- Disposable PostgreSQL acceptance runner: PASS, including the strict create-only target protections and independent-session race.
- Flight suite: 34 files / 290 tests passed.
- Full repository: 275 files / 1,449 tests passed.
- Full TypeScript: passed.
- Lint for all changed code: passed.
- Whitespace and merge-conflict checks: passed.
- Independent current-byte PostgreSQL harness red-team review: passed with no remaining blocker.
- Webpack Production build: 119 / 119 pages passed.
- Turbopack alone was blocked by the workspace's out-of-root `node_modules` junction; the webpack build demonstrated the application build and this was classified as an environment limitation, not an application failure.

## Boundary

This acceptance proves local disposable-database behavior only. It does not apply either migration to a shared, Preview, or Production database, enable the server transport, source a Duffel token, authorize provider traffic, create a booking, take payment, issue a ticket, send an email or other traveler communication, or grant advertising authority.

## Remaining launch gates

`HOLD` remains in force. The next technical work is to implement and independently accept the injected traffic-gate, journal-adapter, credential-provider, and HTTP-dispatcher ports while keeping traffic disabled, then perform a separately approved isolated Preview migration. Provider account/KYC and commercial acceptance, privacy and operational controls, payment and ticketing integration, provider sandbox certification, deployment acceptance, and a controlled live canary all remain outstanding. No “book flights” advertising is authorized.

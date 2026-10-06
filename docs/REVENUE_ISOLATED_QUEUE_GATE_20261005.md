# Isolated supervisor queue prerequisite — October 5, 2026

The missing isolated queue backend is installed and verified. The next genuine-Auth recovery suite is prepared, but has not run. This closes a prerequisite within the operator recovery gate; it does not qualify production or installed-phone operation. Writeback remains disabled.

## State and scope

The previous completed implementation was private PMS Site246, source efe6b94765e39f4aa5e916375600666de0750441: access-denial purging, retained uncertain-command journal, responsive 48px controls, and signed-in queue loading. The earlier supervisor review-only HTTP qualification passed in run37173953707. Those completed changes were preserved.

Existing nondefault isolated project ybehrayzwzyufxbxcysq belongs to live parent eiqmdldjnedqgbtoozqa. No new branch was purchased or created. Its global migration status remains MIGRATIONS_FAILED; this is a partial test backend, not a full PMS copy. One live property activation trigger is absent from the preexisting isolated properties table. This slice neither repairs unrelated migrations nor claims full schema parity.

Migration revenue_supervisor_queue_isolated_slice adds three empty tables (gateway_connections, revenue_forecast_records, revenue_shadow_snapshots; 35 columns total), the exact queue function, and its two observation helpers. Only catalog definitions were copied; no hotel rows, gateway signing secrets or Auth credentials were copied. The tables retain RLS with direct app access denied. Queue EXECUTE is authenticated-only. Internal helpers have no direct anon/authenticated/service_role grant. Functions use fixed pg_catalog search paths. Existing review and rate functions were left unchanged.

Installed function fingerprints:

| Function | MD5 of complete definition |
| --- | --- |
| public.irp_pms_pilot_revenue_supervisor_queue | c4ae842e83094387889917f2600050c0 |
| irp_pms.observe_revenue_supervisor_issue | 7792d1b13cd5c7bcfdd9d210e28a2f5a |
| irp_pms.observe_revenue_forecast_health | 1d5fa05f0d3181d7d850b8f13428dca2 |
| Existing review | ae12f9df71b5335f86614494ff07dff8 |
| Existing pilot_require | 7f62d01281c4f47257d179a95f34f632 |

The candidate SQL stays outside automatic migrations and refuses an existing queue slice, changed authorization definitions, unfinished review fixtures, or executable rate apply. Do not replay it on the live parent or OTA database. Live PMS remains Site246 and auditedSaveEnabled remains false; no live schema, rate or distribution change occurred.

## Verification and cleanup

Five administrative, non-Auth database smoke assertions passed in a rolled-back transaction: anonymous queue denial42501, unchanged-fingerprint observation keeps revision1, changed fingerprint advances revision2, reactivation clears assignment and reaches revision3, and nonpilot forecast-health observation returns safely. This is not sign-in proof.

Seven Node preparation tests passed with no failures/skips. They cover fresh expiring scope generation, target/actor/source/secret rejection, expiration, preservation of nonempty output directories, required supervision and sanitized failures, verified Auth identity mismatch stopping before RPC with empty204 signout, and a simulated full HTTP sequence where revoked new-property access preserves the other property. Simulation is explicitly not genuine Auth evidence. The tests run separately with Node's test runner; the .node-test.mjs filename avoids Vitest suite discovery.

The first fixture preflight rejected existing test-actor memberships and rolled back. Inspection identified the retained earlier synthetic pricing fixture. Preparation now admits only its exact tenant/property/three roles and one room type; any additional scope or unexpected supervisor starting rows fails closed. The HTTP runner expects two authorized properties initially, retains only the earlier property after new-scope demotion, and never reviews an issue belonging to the earlier scope.

The adapted fresh fixture installed successfully. A two-assertion administrative rollback test proved manager demotion on the new tenant and retention of the earlier tenant's manager role. No Auth identity was fabricated. Generated data and guards were then removed. At 19:00:24UTC all five generated fixture counts were zero, supervisor issues/events were zero, and generated functions/triggers were absent. Earlier tenant/property/membership/room-type aggregate hash was cde21b6c192b80c6380067a9e2173d1a before and after. Queue/review fingerprints stayed unchanged and rate-apply EXECUTE remained denied to anon/authenticated/service_role.

Security advisors after slice installation retained 24 deny-all RLS informational notices, three restricted authenticated SECURITY DEFINER warnings, and an existing leaked-password-protection warning. No grants were broadened to suppress them. References: [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Next execution gate

The registered revenue-auth-write-http-gate.yml entry point now offers supervisor-queue mode. It checks out the immutable dispatch SHA, runs the seven preparation tests without secrets, validates a fresh manifest, and uses the existing protected revenue-http-qualification environment only for genuine sign-in. Other suite pins and behavior are preserved. No dependency was added.

The suite needs the existing six saved test-account credentials. No passwords are supplied in dispatch inputs or printed. Review the exact new dispatch commit and authorize this concrete suite before protected execution; previous review-only results do not qualify it. Generate/install a new 30-minute fixture, install guards through a DDL migration, retain before/audit evidence, then dispatch with the manifest, isolated publishable key, and supervised_cleanup=true. Never reuse the cleaned smoke manifest.

The sequence checks a committed owner claim followed by deliberately discarded reply, exact command replay, release, manager claim with fixture-only membership demotion, denied revoked-manager replay and staff review, owner reclaim, and release. Required database audit: exactly five events with expected revisions1–5, final issue revision6/open/unassigned, no baseline review events, and unchanged earlier fixture state. The new manager membership must be staff while the earlier manager membership remains manager.

After every outcome/cancellation/dispatch failure, use the exact generated cleanup-data.sql and cleanup-guards.sql, then verify zero new fixture rows/guards and disabled rate apply. Cleanup removes only baseline queue observations created from the verified empty starting state; if those observations have been reviewed or changed, cleanup refuses and retains them for inspection. Earlier pricing tenants, properties, room types, rates, memberships and Auth users are preserved. Expiry blocks new fixture mutations; it does not delete rows or revoke sessions. Runner attempts local signout in finally; cancellation can interrupt it. Operator database audit/cleanup is required.

This suite proves only a controlled HTTP recovery scenario if it actually passes. It does not exercise the React UI, SDK auth refresh, browser storage, Web Locks, physical phone, actual packet loss, authorization revoked while a request waits for a lock, reauthorization, or sustained 500-property capacity. Installed iPhone/Android standalone launch, background/resume, offline behavior and reload remain the subsequent device gate. Source reconciliation, forecast accuracy, signed OTA delivery, portfolio capacity and controlled launch remain open.

Production release completion remains **0/5 fully cleared end-to-end gates (0%)**. The isolated queue prerequisite is complete; the parent gate is still open. There is no supported weighted percentage of total code implementation.

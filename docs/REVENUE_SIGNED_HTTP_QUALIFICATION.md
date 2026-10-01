# Signed-session status qualification — prepared, not executed

`tests/revenue-signed-http.integration.test.ts` is an opt-in network suite that signs three isolated test accounts in through Supabase Auth, verifies their issued tokens with getUser and calls the actual candidate status adapter. It has no audited-save or rate-write calls.

Five cases require: owner receipt found, second manager's actor-scoped not-found, staff authorization denial, unused owner request not-found and invalid bearer rejection by the deployed gateway. Local CI skips all five unless explicitly enabled. Skipped tests are not signed-session evidence or a release pass.

## Isolated setup

1. Create a development branch under the PMS parent using the native organization/cost confirmation workflow. Name it with the `revenue-auth-` prefix. Retain the actual connector branch response; never target a live project.
2. Install the pricing slice and repaired audited candidate on that branch, with the synthetic tenant/property/plan/request IDs used by the existing qualification scripts. Preserve dependency ACL parity. Create three test users through Supabase Auth, not by inserting auth.users IDs, and assign their actual UUIDs to owner, manager and staff membership rows.
3. Prepare one synthetic owner receipt for request 00000000-0000-4000-8000-000000000006: plan 00000000-0000-4000-8000-000000000004, stay 2026-10-01, recommended rate 16100. This suite reads that fixture; it does not qualify how the receipt was written.
4. Store a nonsecret JSON manifest in the authorized runner. It must contain `branch` (actual project_ref, parent_project_ref, is_default=false, with_data=false and name), `publishableKey`, `tenantId`, `propertyId`, `requestId`, `planId` and `actors` with `owner`, `manager` and `staff`, each containing `id`. Synthetic scope IDs are fixed by lib/revenue-http-qualification-config.ts. The manifest is a supplied assertion, not independent proof that a project is a branch. Verify its provenance against the connector before running.
5. Supply test credentials through the runner's secure environment: IRP_HTTP_TEST_OWNER_EMAIL/PASSWORD, IRP_HTTP_TEST_MANAGER_EMAIL/PASSWORD and IRP_HTTP_TEST_STAFF_EMAIL/PASSWORD. Do not paste passwords or tokens into chat, command arguments, a committed manifest or a report. A service-role key is never used as a user session.
6. Set IRP_HTTP_QUALIFICATION_CONFIG to the manifest path and IRP_RUN_SIGNED_HTTP_QUALIFICATION=1, then run `npx vitest run tests/revenue-signed-http.integration.test.ts`. The runner needs permitted direct HTTPS access to that branch's Supabase endpoint.
7. Preserve sanitized results, sign-out/cleanup failures and branch identity. Delete the temporary branch after diagnostics even if authentication or tests fail. The suite signs out the in-memory clients; sign-out does not establish immediate invalidation of already issued access tokens. Branch deletion is the final isolated-environment cleanup step.

## Safeguards and current evidence

Configuration is validated before any client creation or sign-in. The known live PMS and OTA project references, default/data-bearing/wrong-parent branches, non-test names, real property scope, duplicate actors and secret client keys are rejected. Sessions are not persisted or automatically refreshed. Auth requests have a client deadline and refuse redirects. Raw Auth errors and credentials are not printed by the suite. Three distinct accounts and current server membership remain required; a manifest label alone grants no access.

Nine configuration cases and seventeen simulated transport cases passed locally (26 total). The five real signed-session cases were explicitly skipped. The workspace has no isolated user credentials/branch manifest, and the connector has no isolated-user sign-in operation. No branch was created, no password entered, no real token copied, no live request made and no browser policy workaround attempted for this preparation.

This suite qualifies only the listed read-only HTTP behaviors when actually executed. It does not establish full-schema parity, controller/browser persistence, cross-tab Web Locks, revoked-token guarantees, audited write behavior, sustained concurrency or live readiness. Red Roof remains shadow-only and live rate writeback stays disabled.

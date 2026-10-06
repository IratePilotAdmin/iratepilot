# Read-only status HTTP transport candidate

The recovery controller now has a candidate HTTP adapter in `lib/revenue-approval-status-transport.ts`. This is repository-only, with no active application call sites or deployment. Its apply method always refuses audited saving.

Construct the adapter with the configured standard HTTPS Supabase project origin, a publishable client key, scoped actor/tenant/property IDs and the existing client's Auth methods. The controller supplies its 30-second reply deadline and exclusive lock. Recreate both objects when the account or property changes; retain the interface's stale-scope response suppression.

For each status request, the adapter obtains an access token from getSession and verifies that exact token with getUser(token). The stored session user object is never an authorization source. It checks the session token again before posting, uses the captured token in the Authorization header and checks for session changes before returning the reply. Even a same-actor token refresh conservatively discards the earlier response; check status again. The server remains responsible for current manager membership and actor-scoped receipt access.

Only the status RPC endpoint is used. The POST body contains tenant, property and request IDs. Requests use no-store, omit cookies and refuse redirects. All non-success HTTP replies throw, including authorization failure, unavailable RPC and server errors; none become found=false. Successful JSON must be at most 16384 characters and is then validated by the recovery controller's strict status/receipt schema. No credentials, raw service error bodies or tokens are logged.

## Validation and limits

Seventeen simulated HTTP cases cover request headers/body, token verification, cross-property refusal, mismatched verified identity, signed-out state, session changes before/during HTTP, disabled write transport, 401/403/404/500 uncertainty retention, invalid/oversized replies, endpoint restrictions and secret-key refusal. All 34 combined transport/recovery tests passed. These tests use synthetic tokens, mock Auth and an injected fetch function: they are not signed-session or deployed HTTP evidence.

Run `npx vitest run tests/revenue-approval-status-transport.test.ts tests/revenue-approval-recovery.test.ts`.

The available connector exposes SQL role testing but no isolated-user sign-in operation. Actual Auth-issued user sessions, gateway/RPC validation, revoked-session behavior, full PMS schema compatibility and browser storage/Web Locks remain unqualified. No real user token was requested or copied, no temporary branch was created, and no browser policy workaround was attempted. Do not use a service-role key as a user session. An isolated application with the candidate RPC and real test-user sign-in is still required before live activation.

Red Roof remains shadow-only, with audited saving and automated rate writeback disabled.

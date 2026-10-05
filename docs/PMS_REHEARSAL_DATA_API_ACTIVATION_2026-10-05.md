# Isolated PMS/OTA Data API activation gate

**Target:** `onbdizzwwubfdgkgaphx` (`iratepilot-pms-restore-drill-20260925`) only. This is an isolated rehearsal project, not the live Red Roof PMS database. No setting is changed by this plan.

## Observed baseline, October 5, 2026

- The signed-in Supabase dashboard says **Data API is disabled**. A public-key read of `/rest/v1/properties?select=id&limit=0` returns HTTP 503. Recent PostgREST logs cite missing `pg_pgrst_no_exposed_schemas`; Supabase documents that signature for disabled Data API. Do not create the placeholder schema as an activation workaround.
- All 116 `public` base tables have RLS enabled. Nineteen have `anon` SELECT grants; 45 have `authenticated` SELECT grants. Seventeen tables have `anon` INSERT grants, and those 17 also have UPDATE and DELETE grants; RLS must be verified through HTTP, not inferred from grants alone.
- The 36 `anon` SELECT/ALL policies reviewed have no literal unconditional `true` predicate. The public listings for properties, rooms, and inventory are constrained to approved marketplace records; other inspected read predicates use ownership/admin checks. Two `anon` INSERT/UPDATE policies use ownership predicates. This is a catalog review, not a proof of API behavior.
- One `public` view has no `anon` or `authenticated` SELECT grant. Four ordinary `public` functions have `anon` EXECUTE privilege: `apply_marketplace_commission`, `is_approved_marketplace_property`, `is_approved_marketplace_room`, and `rls_auto_enable`. The first and last are trigger/event-trigger functions. Three are SECURITY DEFINER. Review callable functions and responses during HTTP testing.
- Supabase's security advisor reports only 65 informational `rls_enabled_no_policy` findings, which are deny-by-default tables; no higher-severity advisory was returned. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Fresh row-count checks show zero profiles, properties, rooms, and bookings in this isolated source. This reduces test-data exposure risk but does not replace an HTTP authorization test.
- The separate restored project `tcybafuktsxmdxccopkp` still has zero `public` base tables versus 116 in its source. Activating this Data API will not fix the failed backup restore.

## Proposed limited test sequence

1. Record the dashboard toggle, exposed schemas, current grants, migration ledger, and database backup status. Confirm the target ref again immediately before changing any setting.
2. Enable the Data API **on this isolated project only**, with the minimum required exposed schema (`public`). Do not enable automatic grants for new objects, or change existing grants or RLS during activation.
3. Verify an anonymous key can reach the API, then check that private profile, booking, payment and revenue rows are inaccessible. Check public listing routes return only approved marketplace properties/rooms. Reject any unexpected result before creating test bookings.
4. Use two disposable confirmed test accounts and two synthetic properties to test owner read/write, cross-property read/write denial, manager scope, and anonymous denial. Record HTTP status and row counts, not credentials or guest details. Remove test identities and fixtures after verification.
5. Only after isolation passes, run one Stripe-test booking through the OTA route into the PMS, then modification, cancellation, capacity reconciliation, and staff check-in/checkout in rehearsal. Keep live provider traffic and real guest data disabled.
6. If any access check fails, turn the Data API off on the isolated project, verify REST stops serving table data, and investigate before another test.

**Separate launch blocker:** a successful restore drill must reproduce schema and operational records before any real hotel launch. The current zero-table restore remains under Supabase Support investigation.

## Activation result, October 5, 2026

- After the owner's “Next” response to the specific activation request, the Data API was enabled on `onbdizzwwubfdgkgaphx` only. The dashboard switch remained on after saving. No live PMS or OTA project setting was changed.
- The Settings screen showed `public` as the one exposed schema, 17 of 117 tables exposed, four of 282 functions exposed, and automatic exposure for new tables initially on. Automatic exposure was switched **off**, saved, and verified off after a page reload. Existing grants, RLS policies, and table data were not changed.
- Anonymous public-key HTTPS GETs returned HTTP 200 with empty arrays for `profiles`, `bookings`, `booking_financials`, `properties`, `rooms`, and `inventory`. This proves the gateway works and that these empty rehearsal tables did not disclose rows. It does **not** prove private-row isolation because the source contains no profiles, properties, rooms, or bookings.
- A request with a deliberately invalid bearer token returned HTTP 401. The Auth catalog contains zero users, including zero confirmed users, so authenticated ownership checks require disposable test identities.
- **At this stage:** authenticated owner, manager, cross-property, and anonymous HTTP checks still required disposable confirmed Auth identities and synthetic properties. See the signed HTTP result below for the completed check. Live booking traffic remains disabled pending the other launch gates.

## Rollback-only ownership recheck, October 5, 2026

- Re-ran `tests/postgres/rehearsal-owner-isolation.sql` against the isolated rehearsal source after Data API activation. It passed: each synthetic approved owner could read only their own property, room, and booking under the actual `authenticated` database role with test JWT subject claims; `anon` could read none of the private fixtures.
- The script ended with `ROLLBACK`. A fresh catalog/data check showed zero Auth users, partners, properties, rooms, and bookings, and the booking availability trigger remained enabled (`tgenabled = 'O'`). No synthetic guest or booking data persisted.
- This verifies database RLS under simulated claims, not a signed HTTP session. The latter remains the next gate once disposable confirmed identities are available.

## Invitation preflight and live-route check

- The isolated project's Auth URL Configuration currently has Site URL `http://localhost:3000` and no additional allowed redirect URLs. Supabase's dashboard invitation flow would send a link that returns to localhost unless an allowed callback is configured. Do not send invitations until a working isolated callback and two controlled test inboxes are ready. The Dashboard's alternative “Create new user” form requires a password; no password was entered and no user was created.
- Read-only GET checks of `https://www.iratepilot.com/api/ota/capabilities`, `/api/pms/ari`, and `/api/pms/reservation-changes` all returned HTML HTTP 404 on October 5, 2026. The native OTA connector is not yet verified on the public production site. No booking or provider traffic was sent.

## Authenticated HTTP gate preparation

- The rehearsal project's **Sign In / Providers** screen shows email auth enabled, email confirmation required, and anonymous sign-ins disabled. It still has no test users. These settings were read only and left unchanged.
- `scripts/verify-pms-rehearsal-http-isolation.mjs` now provides a read-only, project-pinned HTTP check. Once disposable confirmed owner A, owner B, and manager A sessions and two synthetic property/room/booking fixture sets exist, it will make 24 REST GET checks across those three identities plus `anon`. It refuses any Supabase URL other than the isolated `onbdizzwwubfdgkgaphx` project. Authenticated requests use a user access token; anonymous requests send only the publishable key, per [Supabase's API key guidance](https://supabase.com/docs/guides/api/api-keys). Access tokens are supplied through process environment variables and are not printed or saved by the script.
- The helper's mocked tests pass. At this stage the hosted authenticated check had not run because the rehearsal database was empty. The later test used dashboard-created, auto-confirmed disposable identities without sending invitations; see the result below. Auth's Site URL still points to `http://localhost:3000`, so invitation onboarding remains a separate gate.
- Source-policy review found that OTA partner managers have delegated `properties` and `rooms` SELECT policies (`202608150054_partner_team_hotel_management.sql`), while the `bookings` partner SELECT policy (`202608020015_enforce_approved_partner_reservations.sql`) checks only `partners.owner_id = auth.uid()`. This is consistent with the existing partner-team invitation scope, which explicitly covers draft property content, rooms, rates, future inventory, and integration work, not guest bookings. The verifier therefore expects manager A to see its assigned property and room but no booking row. Front-desk reservation access needs a separately specified PMS staff role and guest-data policy; do not expand this OTA manager role silently.

### Signed HTTP isolation result — 2026-10-05

- Created three disposable, auto-confirmed users in the isolated `onbdizzwwubfdgkgaphx` project only; the dashboard sent no confirmation emails. Added two synthetic partners, properties, rooms, and bookings, plus one delegated manager assignment. Booking triggers were disabled only inside the fixture transaction and all four were restored before commit. No real hotel or guest data was used.
- Added `scripts/run-pms-rehearsal-http-with-passwords.mjs` to sign in those disposable users and pass access tokens in memory to the existing project-pinned read-only verifier. No password or token is written to the repository or printed by the runner.
- The first run passed 22/24 HTTP visibility checks. The two failures were the assigned manager's own property and room. Catalog inspection showed the manager policy requires `profiles.role = 'partner'`; Supabase's dashboard initially created all test profiles with the default `customer` role. Setting the three disposable profiles to `partner`, as the actual partner onboarding flow does, made **all 24/24 signed HTTP checks pass**: owner A and B saw only their respective property, room, and booking; manager A saw only property A and room A and no bookings; anonymous callers saw none of the private fixture rows.
- Removed the two bookings, rooms, properties, partners, and team assignment, then deleted all three disposable users in the dashboard. Final read-only SQL confirmed zero auth users, sessions, refresh tokens, profiles, partners, team members, properties, rooms, and bookings; all four booking triggers are enabled. The isolated schema restore passed separately. At this point cross-tenant writes and the end-to-end booking/payment/stay cycle still needed testing before live traffic; the write test followed below.

### Signed HTTP write-policy result — 2026-10-05

- Created a fresh set of three auto-confirmed disposable users and two synthetic partner/property/room/booking fixture sets in `onbdizzwwubfdgkgaphx`. All three test profiles had the intended `partner` role; the manager was assigned only to partner A. No invitation email or real guest data was involved.
- Added `scripts/verify-pms-rehearsal-http-writes.mjs`, which signs in through the project-pinned helper and limits PATCH requests to fixture IDs supplied in the environment. It passed **15/15 signed HTTP write checks**: owner A, owner B, and manager A could make idempotent name updates to their permitted property and room; cross-property updates returned no changed rows; three attempts to reassign an owned property or room into partner/property B were rejected.
- A SQL integrity query after the HTTP calls found both fixture properties and rooms still had their original names and ownership links. Removed all synthetic rows and dashboard-created users. Final SQL found zero users, sessions, refresh tokens, profiles, partners, team members, properties, rooms, and bookings; all four booking triggers remain enabled. This passes the tested partner/property write-isolation gate. Booking write authorization, populated-data recovery, payments, and the end-to-end stay cycle remain separate gates.
- Cross-property write denial, real OTA booking delivery, and the failed backup restore require separate verification. Do not treat a future 24/24 read pass as a full launch approval.

# Recovery access and history cursor repair — September 30, 2026

Authenticated database-role qualification found and repaired a real history defect in the uninstalled audited approval candidate. PostgreSQL 17.11 rejected `min(request_id)` because it has no `min(uuid)` aggregate (42883). Earlier approval tests had not called history. The candidate now derives the cursor from the final item of its ordered, bounded page.

## Confirmed results

Eighteen distinct server cases passed after the history repair (including initial save and status checks that passed before the repair). The original failing history attempt is retained in the evidence.

- The authenticated owner saved one synthetic decision and could retrieve its receipt.
- A different manager received found=false for that actor's request; manager property history intentionally includes approved decisions from other actors.
- Staff history/status, outsiders, missing identity, wrong tenant/property, anon and service-role status calls were denied with 42501.
- Authenticated direct audit SELECT and UPDATE were denied. A spoofed user_metadata owner claim did not elevate staff.
- An incomplete history cursor was rejected with 22023; an owner demoted in the current transaction could no longer retrieve the receipt.
- Twenty-eight records sharing one timestamp traversed pages of 25 and 3. Exact ordered IDs matched the fixture, the first cursor matched its last item, and the final next cursor was null. Twenty-seven cloned audit rows rolled back.

Final persisted fixture: one decision and one rate action, rate 16100 minor units/version 2, owner membership restored. The audit table has RLS enabled and all direct SELECT/INSERT/UPDATE/DELETE grants are false for anon, authenticated and service_role. All three candidate RPCs use fixed search_path=pg_catalog and grant execution only to authenticated.

Two local integration variants (reduced and captured actual pricing schema) now cover complete tied-timestamp pagination and empty history; both passed. Targeted lint and TypeScript passed.

## Advisor review and fixture parity

The security advisor found the copied nightly-rate dependency was anonymously executable because copying its function definition omitted its original ACL. A read-only live catalog check showed anon=false, authenticated=true, service_role=true. The isolated dependency ACL was aligned with those existing live values, and the anonymous-function warning disappeared. No live grants were changed.

Remaining isolated notices:
- [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): intentional deny-all direct audit access.
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): the scoped RPC boundary is intentional; owner/manager checks remain essential.
- [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): branch Auth configuration was not changed. No password accounts were created.

## Reproduction and limits

Full attempts, original error, role/actor readbacks, grants and before/after advisors are in `evidence/revenue-recovery-access-20260930.json`. `scripts/qualify-revenue-recovery-access.sql` packages the separately executed cases; it was assembled after testing and was not rerun as one script. Install the captured pricing slice, four current dependency functions, capacity repair and repaired candidate. Use the seed section of the receipt-race driver, apply the guarded scripts/revenue-recovery-test-dependency-grants.sql, then run these cases.

The isolated branch began with zero PMS tables and zero Auth users. This qualifies database roles with an injected subject, not Supabase Auth-issued tokens, gateway validation, HTTP sessions, real-browser persistence/Web Locks, or complete PMS schema parity. Direct audit access is denied by privileges; these checks do not separately exercise row filtering under a granted table role. No unsupported browser path was attempted.

Temporary branch mtqrgrolepovidlsfvuh was deleted after diagnostics were saved. Production audited saving, Red Roof writeback and commercial activation remain disabled. Authenticated HTTP and real-browser pending-approval recovery remain open.

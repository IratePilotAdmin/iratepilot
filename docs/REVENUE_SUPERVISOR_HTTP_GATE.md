# Isolated supervisor HTTP qualification

Prepared October 2, 2026. Isolated real-Auth HTTP checks, receipt audit and cleanup passed October 4 after a branch-only conflict-code repair. Keep PR #322 draft and Red Roof shadow-only. Production promotion and the overall release remain unqualified.

The manual workflow `revenue-supervisor-review-http-gate.yml` uses the immutable dispatch commit, the existing protected `revenue-http-qualification` environment, and its six owner/manager/staff test credentials. The runner uses only the isolated branch `ybehrayzwzyufxbxcysq`, verifies actual Auth user IDs against the fixture, and never invokes rate apply. No new admin secret or database grant is needed.

## Supervised execution

1. Review the exact dispatch commit and authorize this supervisor suite's use of protected test credentials. Earlier pricing approvals do not qualify this different suite.
2. Confirm the nondefault branch still belongs to parent `eiqmdldjnedqgbtoozqa`. Check the expected review function fingerprint and disabled rate-apply grants. Generate a fresh bundle with `node scripts/prepare-supervisor-review-fixture.mjs <empty-directory>`; its IDs and expiry must match the installation.
3. Install the generated SQL only on the isolated branch and retain the initial audit: issue revision 1, open, unassigned; no events; rate apply disabled. Use DDL migrations and administrative DML separately if required by the connector. Never set an Auth identity through SQL. The scoped guard expires after 30 minutes; regenerate if environment approval or runner scheduling consumes that window.
4. Dispatch from `revenue-ai-forecast-evidence-20260930`, supplying that manifest JSON and the isolated publishable key. Confirm operator supervision. Inputs contain no passwords. Manifest preflight runs before the credentials step; the HTTP runner validates again immediately before sign-in.
5. After any terminal result or cancellation, retain the database audit before cleanup. For a passing run require exactly two events: claim at expected revision 1 and release at expected revision 2, both by the same real owner or manager; final issue revision 3, open and unassigned; no staff event. Match claim request ID to the HTTP receipt. Failure is evidence of an open gate, not permission to relax checks.
6. Run the exact generated scoped cleanup after success, failure, timeout, cancellation, or dispatch failure. Verify zero fixture tenants/properties/memberships/issues/events, absent guard function and both triggers, unchanged review fingerprint, and rate-apply EXECUTE denied to anon/authenticated/service_role. Retain dated run URL, commit, sanitized HTTP checks, database audit and cleanup evidence.

The runner attempts local sign-out in `finally`; abrupt cancellation may interrupt it. The GitHub `always()` step removes only the local manifest. Database cleanup is operator-supervised, not automatic, and fixture expiry is not record deletion or session revocation. Do not dispatch unattended.

## Acceptance and limits

The HTTP checks require staff denial, one successful claim and one revision conflict from concurrent clients, exact retry replay, assignee protection, actor-bound receipt denial, and winner release. This does not establish observed PostgreSQL lock overlap, authorization revocation while waiting, phone operation, queue refresh, sustained 500-property capacity, pricing accuracy, or live activation. The isolated branch contains a partial backend, not complete PMS parity.

Red Roof nightly reconciliation still needs actual nightly charge and effective inventory evidence for September 10, 22 and 24 plus a variable-price multi-night stay. No synthetic fixture can close that source-data gate.

## October 4 preparation repair

The standalone new workflow is not registered in GitHub Actions because it is absent from the default branch. The already registered `revenue-auth-write-http-gate.yml` now provides `supervisor-review` mode with the same non-secret inputs and protected environment. Use this entry point on the draft branch; no main-branch merge or workflow registration change is required. Existing pricing modes keep their prior immutable source pin; supervisor mode checks out its dispatch SHA. Seven preparation/preflight tests now use this repository's Vitest runner after the original Node test files caused CI suite-discovery failures. These fixes do not constitute real Auth execution.

## Retained cancellation evidence

Repair commit b57c6a73c91792e93b656bffbb5c8c4259fa1968 passed full CI (37172800766), CodeQL (37172800844), dependency review (37172800820) and existing recovery checks (37172800785). The registered supervisor form was visibly available on the draft branch. Manual run 37172956377 reached protected environment review, but automatic approval review rejected execution because the user had not explicitly authorized this concrete use of saved credentials. No workaround was attempted. The waiting run was cancelled before any job steps ran; no Auth suite execution is claimed.

The synthetic issue remained revision 1/open/unassigned with zero events before scoped cleanup. Cleanup verified all five fixture counts zero, absent guard function and triggers, unchanged review fingerprint, and disabled rate-apply privileges at 2026-10-04T03:06:02Z. See `evidence/revenue-supervisor-cancelled-dispatch-20261004.json` and `evidence/revenue-supervisor-cancelled-dispatch-20261004.jpg`. Never rerun the cancelled job with its cleaned manifest. A specifically authorized execution needs a fresh generated fixture and new dispatch.

## Real-Auth result — October 4, 2026

After explicit user approval, run 37173303644 signed in real owner/manager/staff accounts and denied staff review, but timed out during competing claims. Diagnostic repeat 37173580689 identified TimeoutError in concurrent-claims after 20 seconds. Each attempt stored exactly one owner claim; neither reached release or qualified. Both fresh fixture scopes were audited and fully removed.

The review RPC raised SQLSTATE 40001 for a deterministic revision mismatch. [Supabase documents that this can trigger PostgREST transaction retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). The isolated candidate changes only that code to PT409, preserving authorization, advisory/row locks, revision rejection, actor-bound exact replay, audit and existing ACL. The new installed fingerprint is ae12f9df71b5335f86614494ff07dff8. This is consistent with the observed timeout and its resolution; the project's PostgREST version was not measured. An initial DDL syntax error rolled back; readback confirmed no change before corrected application. No live parent function was changed.

[Repaired run 37173953707](https://github.com/IratePilotAdmin/iratepilot/actions/runs/37173953707) passed all supervisor HTTP assertions at 03:24:29Z: staff denial, one winning claim and one HTTP409/PT409 conflict, exact replay, assignee protection, actor-bound replay denial and release. Administrative audit retained exactly two events by owner 7e3ac7b8-3286-4fcb-aaa9-a850390d787c: claim expected revision1/receipt2 and release expected revision2/receipt3. Final issue was open, revision3, unassigned. No duplicate retry or staff event was present.

At 03:25:56Z, all three attempt scopes had zero tenants/properties/memberships/issues/events, zero fixture functions/triggers, and zero active review backends. The repaired review fingerprint remained unchanged and anon/authenticated/service_role rate-apply permissions stayed disabled. See `evidence/revenue-supervisor-auth-20261004.json` and the passing screenshot. Source17c291b24b7460678acfae4e78af72fbd0c20250 passed full CI37173874288, CodeQL37173874287, dependency review37173874289 and existing recovery37173874293.

The passing outcome closes this isolated HTTP/receipt/cleanup qualification only. `pms-candidates/revenue_supervisor_http_conflict_candidate.sql` remains a production candidate; it must not be replayed as an OTA migration. Before any live promotion, reconcile the current live definition, validate compatibility with callers expecting40001, and review a scoped production migration. No merge, rate activation or OTA delivery occurred. Phone/PWA, complete queue refresh, membership-revocation races, observed lock overlap and sustained portfolio qualification remain open.

Security advisors were rerun after cleanup. Existing deny-all private RLS notices and restricted authenticated SECURITY DEFINER notices do not justify broader grants. Existing leaked-password protection configuration remains unchanged. Remediation references: [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

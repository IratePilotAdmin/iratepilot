# Live supervisor HTTP conflict repair — 2026-10-04

Installed `revenue_supervisor_http_conflict_repair` on the existing PMS project. Only the stale-revision SQLSTATE changes from `40001` to `PT409`; PostgREST can return HTTP 409 without serialization retry semantics.

The installation rejects unexpected source/security metadata, uses short lock/statement limits, and checks the exact qualified post-change fingerprint and unchanged owner, ACL, SECURITY DEFINER and fixed search path inside the same transaction. No hotel data DML, grants, rate activation or draft merge occurs.

## Evidence

- Qualified real-Auth isolated test: https://github.com/IratePilotAdmin/iratepilot/actions/runs/37173953707
- Actual deployed PMS source: `5a6f8f0283e101a133a1e205eae4f62ea08e0090`, Site version 231. Its hotelRpc preserves errors and the queue displays their messages; errors stop further review until fresh refresh. Exact retry request identity remains retained.
- Live readback at 2026-10-04 13:39:42.576539+00: fingerprint `ae12f9df71b5335f86614494ff07dff8`, owner postgres, SECURITY DEFINER, search_path=pg_catalog. Authenticated execute true; anon/service_role execute false.
- Six existing deployed-source queue and timeout/recovery tests passed. First invocation lacked local test dependencies; rerun used the retained isolated UI runtime and passed. No production dependencies or Site source changed.
- No active supervisor review backends at read-only checks before and after installation; no termination or restart performed.
- Security advisor returned project findings: 234 RLS/no-policy INFO, five mutable-search-path warnings, 13 anon SECURITY DEFINER warnings, 385 authenticated SECURITY DEFINER warnings and one leaked-password-protection warning. This repair preserves restricted authenticated review access and fixed search path; unrelated findings were not changed.

See `docs/evidence/revenue-supervisor-live-repair-20261004.json` and `pms-candidates/revenue_supervisor_http_conflict_promotion.sql`.

## Recovery and limits

An unexpected hash or changed security metadata aborts the installation transaction. If a later regression appears, pause supervisor review and inspect the deployed function before any explicit rollback; restoring 40001 can restore the retry failure and must not be an automatic fallback. The previous definition remains in the repository history. A prior application of this script intentionally fails its old-source guard rather than reinstalling.

This is installation/readback evidence, not an actual signed-in live HTTP conflict or phone test. Isolated Auth passed against the exact same resulting function. Full PMS schema parity, membership-revocation races, sustained 500-property operation and phone/PWA remain unqualified. Actual nightly-room-charge reconciliation remains open. Red Roof remains shadow-only; automatic rate saving/writeback and OTA activation remain disabled. PR #322 remains draft and unmerged.

Official mechanism: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
The observed timeout and isolated resolution fit that documented mechanism; the project's PostgREST version was not measured.


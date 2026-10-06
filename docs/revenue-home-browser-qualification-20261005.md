The actual Home read/recovery boundary passed with genuine isolated Auth on
5 October 2026. GitHub run 37391089003 (job 112036075687) qualified public capture
bedcca876980c340cd7e0f52359610e2a5f7ad15 of private candidate
2fb5285ac74314e97a9161dd8872d7088ccb8a92.

The capture preserves 431 transitive Home source files plus the disabled-save
safety source and locally compiled browser/server/style assets. CI verified their
SHA-256 hashes and ran actual Home, AuthPanel, ReleasePreviewGate, supervisor queue
and release-preview GET. The server checked actual isolated Auth-issued identity;
there were no successful Auth, preview, membership or workspace response stubs.

All ten checks passed: actual owner sign-in and access verification, authenticated
Home reload, interrupted membership read with closed access and Retry recovery,
offline warning, reconnect with explicit refresh, Home-to-supervisor navigation,
owner sign-out, manager preview denial, staff preview denial, and absence of
unexpected network operations or uncaught browser errors. All three accounts were
signed out. Only allowlisted isolated Auth and read transports were available.

Artifact 11380709308 contains report.json and masked Home/queue screenshots.
Its downloaded archive SHA-256 independently matches GitHub's reported digest:
ea210626015d2dfe41c7878e0a2fa0780a148169b8a40f24dc803e96c6081c29.
Independent database readback confirms the baseline hash remains
de351429652dba7c629ff9c705355a1b, with zero physical rooms/reservations.
The supervisor queue/review definitions are preserved. The nightly rate setter
remains non-executable by anon, authenticated and service_role. No rate or OTA
operation was invoked. The queue read created two synthetic observation records,
with no review events. Exact full-row guards removed only those two records;
independent readback confirmed zero observation/review records afterwards. No
tenant, property, membership or inventory fixture was added; no pricing flags
changed. The original artifact's read_only flag describes client commands and is
misleading for database effects. This audit supersedes that flag. Future runs
require an operator for observation cleanup and report that effect explicitly.

The test uses Chromium, an HTTP host and a synthetic empty baseline property whose
queue reports unenrolled capture and incomplete room mapping. This does not prove
live PMS deployment, populated inventory, review journal replay/access revocation,
service-worker installation, physical iPhone recovery or real hotel forecasts.
The optional workspace_sync service is unavailable; periodic refresh remains the
actual application's fallback. The wider isolated branch still reports
MIGRATIONS_FAILED. The production PMS remains version 246; the local code candidate
has not been published there.

Next gate: actual full Home saved-review recovery on a fresh bounded disposable
scope, including uncertain reply, reload and genuine Auth re-entry, access loss
and restoration, exact-request replay, independently audited single effects and
complete scoped cleanup. Rate writeback and OTA publication stay disabled.
Physical installed-iPhone observations and real PMS rows, mapped IDs, inventory
truth, pricing constraints, historical inputs/outcomes and a baseline remain
required before a one-hotel production shadow pilot is proven. Complete production
acceptance remains 0/5 gates (0%), an evidence measure rather than implementation
progress.

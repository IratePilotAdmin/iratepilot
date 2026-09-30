# Revenue recovery DOM qualification

Eight isolated DOM tests load the actual private PMS recovery panel and controller, with synthetic transport responses, DOM storage and a simulated exclusive lock. They cover lost-response recovery after controller recreation/component remount, offline refusal, service errors, scoped not-found, actor change during a delayed reply, missing lock capability, mismatched receipt and stalled-status deadline/late-response recovery. No production records, credentials or RPC calls are used.

The stalled-status investigation found that the earlier panel's transport had no deadline. The private PMS repair wraps only its read-only status transport in a 30-second deadline. Timeout retains the exact unresolved journal and releases the check/lock; a late reply cannot mark it saved. A subsequent status check can reconcile the same request. It does not cancel a server operation, authorize another request or enable rate saving.

## Reproduce the component checks

Use the selected PMS checkout and an isolated test-dependency directory with exact versions: jsdom 26.1.0, @testing-library/react 16.3.0, react/react-dom 19.2.6, typescript 5.9.3 and zod 3.25.76. Set `IRP_QUALIFICATION_PMS_CHECKOUT` to the PMS checkout and `IRP_UI_RUNTIME_PACKAGE` to that dependency directory's package.json, then run `node --test scripts/qualify-revenue-recovery-dom.mjs`. The PMS source also carries the focused UI suite under tests/ui/revenue-approval-recovery-panel.test.mjs. The deadline regression intentionally fails against the earlier panel without the repair.

The native private PMS checkout passed eight focused tests, all 336 top-level PMS tests and TypeScript. Production build/publication results are recorded in PR #322 after completion.

## Browser fixture and explicit limitation

`scripts/build-revenue-browser-qualification.mjs PMS_CHECKOUT OUTPUT_HTML` bundles the actual component/controller with a synthetic-only transport, recording their SHA-256 hashes. The fixture source is `scripts/revenue-browser-qualification.tsx.fixture`, outside application compilation. It has no PMS/Supabase/OTA network transport. The fixture compiled successfully but was **not executed in a real browser**: cloud Browser rejected local-file navigation because only HTTP/HTTPS protocols are allowed. No alternate URL, browser, raw command or indirect serving path was attempted to get around that rejection.

DOM storage is not proof of browser persistence; a simulated lock is not Web Locks or cross-tab qualification. Offline state is simulated, and scope changes are component rerenders rather than authenticated account changes. Full pending-request browser/storage/lock and authenticated candidate-RPC qualification remains open. This document does not clear live launch, audited writeback or the historical unexplained cron-run discrepancy.

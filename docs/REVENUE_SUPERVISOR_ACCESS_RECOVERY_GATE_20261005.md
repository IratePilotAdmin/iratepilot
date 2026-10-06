# iRatePilot next gate — October 5, 2026

Gate: real-Auth mobile supervisor recovery and installed phone/PWA qualification.
Status: advanced, not cleared. Automatic recommendation saving/writeback stays disabled.

## Exact changes

Private PMS source efe6b94765e39f4aa5e916375600666de0750441, based on deployed
422ac796d6c875a4a59e9ffa449ac764b2219a17:

- components/revenue-supervisor-queue.tsx: failed refresh now purges the previous
  exception snapshot. It retains the original unresolved command; retry remains
  disabled until a successful fresh queue read. Stale replies still cannot replace
  a newer scope. No automatic mutation, new request ID or journal clearing added.
- tests/ui/revenue-supervisor-read-timeout.test.mjs: two regressions cover denied
  refresh after an uncertain review, journal retention and reauthorization; focus
  refresh failure also hides old details without submitting any review.
- app/globals.css: qualify queue button/select minimum-height rules with the PMS
  shell class so its existing secondary-button minimum cannot override them.
  Desktop controls require 44 pixels; below 600 pixels they require 48 pixels.
- docs/revenue-supervisor-access-recovery-gate.md: current evidence, isolation
  limitation and explicit acceptance checklist.

## Verification

46 focused tests passed, zero failed/skipped: journal 3, transport 4, queue UI 12,
actual Home/navigation 19, PWA manifest/offline route/worker 8. Worker checks prove
only the reconnect shell is cached; operational/API/Auth/guest traffic is not.
These are automated tests, not a physical-phone installation. Focused lint and
the final Vinext production build exited zero.
No full-suite claim: earlier 16 baseline failures and two baseline TypeScript
errors remain recorded in the preceding report.

A genuine signed-in owner browser loaded 10 shared exceptions across four
authorized properties; sign-in survived reload. Queue observation can refresh
issue records. No claim/release/acknowledgment, Auth change, rate save or OTA
delivery was executed. No user bearer token or password was extracted.

At 18:27 UTC, live supervisor definition hash remained
ae12f9df71b5335f86614494ff07dff8; SECURITY DEFINER, fixed pg_catalog search_path,
authenticated EXECUTE true, anon/service_role false. Audited decision table/apply
and status RPCs remain absent, and the UI audited-save flag remains false.

## Connected state

GitHub PR 322 remains open, non-draft and unmerged, revenue branch head
08d4aecae8b6d7584e62dfbd42ddfd09b96b3953 at inspection. The matching Vercel preview
dpl_5zCGApf1NLT7Vk4jx2JHXSDUx5Qz was READY. It is separate from the native PMS Site.
No GitHub merge or Vercel production promotion performed.

Intermediate successful native PMS publication for source149d1a1 (version245):
version ID appgprj_6a9ef311e9f08191b44e8d5598802ccc~appgver_fdb604cb49688191948dcc8a0cf70f37;
deployment appgdep_6ac3ecc4b0c08191b901bc61484b0558. Final source efe6b94 adds the
CSS precedence repair; its publication is recorded below.
Owner-only audience retained. Local archive helper cannot run without Bash;
the supported native remote-build fallback is used after exact source push.

## Blockers and next required evidence

The isolated branch ybehrayzwzyufxbxcysq is non-default, without parent data,
ACTIVE_HEALTHY but MIGRATIONS_FAILED. At 18:30:41 UTC, its review definition matched
live; zero issues/events remained; the full queue RPC was absent. Existing genuine
Auth review-RPC evidence does not qualify the complete mobile queue. A verified
isolated queue dependency slice and protected test sign-in are required before
lost-response/revocation tests can safely cover this component.

Installed physical-phone standalone launch/background/offline/reload remains
unobserved. Browser emulation alone cannot clear it. Real isolated Auth loss after
commit, exact-replay audit, revoked membership before retry/while lock-waiting,
two-operator browser behavior and scoped cleanup remain required.

Initial real browser width390/content375 had action minimum44.6 and computed
minimum42. Source inspection found .pilot-shell .secondary overrides the less
specific .revenue-supervisor button selector. Synthetic fixtures lacked the shell.
Both mobile button and select rules now use the stronger shell-qualified selector.
Browser and Windows build CSS hashes differ; this alone does not prove a stale
deployment. Final rendered sizes require browser verification below.

Release completion: 0/5 full end-to-end gates (0%). This strict gate count does not
measure overall code implementation. Next gate remains this Auth/phone recovery
qualification; forecast accuracy, full schema parity, signed OTA delivery,
sustained 500-property operation and controlled launch are still open.

## Final publication verification

Native Site version246, exact source efe6b94765e39f4aa5e916375600666de0750441,
deployment appgdep_6ac3ee1638d0819180d717d7697fed1c succeeded at 18:39:32 UTC,
environment revision5. Version ID:
appgprj_6a9ef311e9f08191b44e8d5598802ccc~appgver_1791f3ca08888191957157c50c0e6e06.
Generated URL https://iratepilot-pms.iratepilot-7561.chatgpt.site;
canonical https://pms.iratepilot.com; private audience retained.

Genuine signed-in owner reload and queue load passed on this publication.
10 exceptions remained visible across four authorized properties. At width320,
content width305; at width390, content width375. Every queue button and selector
measured48 pixels in both viewports. The served CSS changed to index.CzUHTNYk.css;
computed minimum48px confirms the shell precedence repair is active.
Screenshot: iratepilot-signed-in-mobile-queue.jpg. Temporary browser tab closed
and viewport override reset. No live review action or pricing mutation was sent.

The implementation fixes and signed-in responsive baseline are complete. The
larger real-Auth fault/revocation and installed-phone gate remains open for the
isolation/device reasons above; no protected credential test was dispatched.


# Genuine-Auth supervisor queue recovery — October 5, 2026

The controlled isolated HTTP recovery qualification passed, including its database audit and complete scoped cleanup. Actual mobile interface/browser recovery and installed-phone/PWA qualification remain open. Rate writeback remains disabled; no production gate is fully cleared.

[Run37361767910](https://github.com/IratePilotAdmin/iratepilot/actions/runs/37361767910) executed supervisor-queue mode from exact reviewed commit bcf88b01759c30111f8a3b5356844e6c8d16ce85 on nondefault Supabase branch ybehrayzwzyufxbxcysq. The protected environment was approved through its existing review control. No protection was disabled or bypassed. The seven preparation tests and manifest preflight passed before the genuine-Auth step. Other pricing/browser suites were skipped as intended. This report contains no account passwords, emails, Auth tokens or admin credentials.

## Observed behavior

Real owner, manager and staff sign-ins were verified against their Auth-issued identities. Owner and manager initially saw both authorized synthetic properties; staff saw none. Owner claimed the new property's capture_missing issue, reaching revision2. After deliberately discarding the validated committed reply, the exact original command returned replayed=true without another event. Owner release reached revision3.

Manager then claimed at revision3, reaching revision4. A reviewed fixture-only trigger demoted the manager membership on the temporary tenant in that transaction. A subsequent manager queue read excluded that property while retaining the earlier authorized synthetic property. Exact manager replay and staff review both returned42501. Owner then reclaimed the abandoned assignment at revision5, with reclaimed=true and previous_assignee equal to the manager, and released at revision6. The final queue issue was open and unassigned.

HTTP assertions passed at19:14:09UTC. Administrative audit at19:14:59UTC retained exactly five unique request IDs and this sequence:

| Actor | Action | Expected revision | Receipt revision |
| --- | --- | --- | --- |
| Owner | Claim | 1 | 2 |
| Owner | Release | 2 | 3 |
| Manager | Claim | 3 | 4 |
| Owner | Reclaim via claim | 4 | 5 |
| Owner | Release | 5 | 6 |

No retry, denied manager or staff event was added. The temporary manager membership was staff, while the earlier synthetic manager membership remained manager. No baseline issue was reviewed. The runner's finally block completed its local signout requests successfully; this does not prove instant JWT invalidation or cancellation behavior.

## Cleanup and preserved state

The generated data cleanup removed new fixture events, issue, three memberships, property and tenant, plus the two unchanged baseline queue observations created from the verified empty starting state. It preserved earlier pricing tenants, properties, room types, rates, roles and Auth accounts. The generated DDL cleanup removed both functions and all three triggers.

Final readback at19:15:28UTC showed zero supervisor issues/events, zero temporary tenants/properties/memberships and zero fixture functions/triggers. The earlier tenant/property/membership/room-type aggregate hash matched before/after: cde21b6c192b80c6380067a9e2173d1a. Queue definition hash stayed c4ae842e83094387889917f2600050c0; review stayed ae12f9df71b5335f86614494ff07dff8. Rate-apply EXECUTE remained denied to anon/authenticated/service_role.

No live-parent SQL mutation, PMS deployment, pricing save, OTA delivery, account/password change or new paid branch occurred. Private PMS remains Site246. This turn changes only qualification evidence and documentation; it uses the preceding implementation without redoing completed work. The executed source previously passed full CI37360385553, CodeQL37360385565, dependency review37360385502 and existing recovery37360385573; its Vercel repository preview was READY. Documentation publication checks are separate from this immutable test source.

Evidence: evidence/revenue-supervisor-queue-auth-20261005.json and the saved passing-run screenshot. Never rerun this job with its removed fixture. A repeat needs a fresh scoped bundle and audit/cleanup supervision.

## Next gate and blockers

This is a controlled reply discard in a raw HTTP runner, followed by fixture-trigger membership demotion. It does not prove actual network packet loss, SDK token refresh, React rendering, durable journal behavior, browser Web Locks, reauthorization, or revocation while blocked on a database lock. The existing responsive/private PMS tests are useful evidence but do not substitute for those observations.

Next: qualify the actual supervisor interface against an isolated backend with fresh test scope, then observe installation and standalone operation on a physical iPhone or Android device. No phone is connected in this task and no isolated phone-accessible PMS interface has yet been qualified. Do not point mutation-fault tests at the live parent or temporarily reconfigure the live private PMS to use the test backend.

Required observations are: exact uncertain-command retention through reload, cross-tab exclusivity, failed/revoked queue refresh hiding stale details, denied retry until a fresh authorized read, authorized reclaim without duplicate audit, installed standalone launch, background/resume, offline reconnect shell without operational/Auth/guest caching, and successful online reload. Record device/browser/OS, exact interface source/backend, before/after audit and cleanup. A mobile-size browser viewport cannot establish physical-device results.

The inherited production rubric remains **0/5 full end-to-end release gates (0%)**. This HTTP subgate is now qualified; its larger operator/mobile gate is not cleared. Forecast accuracy, source-data reconciliation, full schema parity, signed OTA delivery, sustained capacity and controlled launch remain open. No supported weighted total-code percentage exists.

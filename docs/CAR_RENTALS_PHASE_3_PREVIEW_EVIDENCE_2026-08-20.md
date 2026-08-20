# Car Rentals Phase 3 — Isolated Preview Evidence

Recorded: August 20, 2026 at 09:59 CDT

## Release identity

- Private repository: `IratePilotAdmin/iratepilot-private-laptop-backup-2026-08-16`
- Branch: `agent/align-homepage-pilot-claims`
- Published commit: `bd186223f6dd4b76b59be7fe9e9da851976aec55`
- Git tree: `52de27006df502a03e09aaf864c833968bbfcb54`
- Publication behavior: remote parent `8f581d03e598eb7d91565d7c5c4765e7e5bda5f0` was rechecked immediately before a fast-forward branch update with `force: false`
- Local HEAD and `origin/agent/align-homepage-pilot-claims` were verified at the published commit

## Isolated Preview deployment

- Vercel team: `irate-pilot`
- Vercel project: `iratepilotadmin-private-preview`
- Project ID: `prj_pasFoRHteHE1W0YZzQwjZrONDrNc`
- Deployment ID: `dpl_5reyoNQMTNen7Qg8ut1dmf7PTGxs`
- Target: `preview`
- Status: `Ready`
- Preview URL: `https://iratepilotadmin-private-preview-4s5f53xyz-irate-pilot.vercel.app`
- Inspector: `https://vercel.com/irate-pilot/iratepilotadmin-private-preview/5reyoNQMTNen7Qg8ut1dmf7PTGxs`
- Deployment source: clean Git archive of the published commit; 1,004 tracked files matched 1,004 archived files before the isolated project link was added
- Remote build: Next.js 16.2.12 compiled successfully, TypeScript passed, and 115 pages were generated
- Vercel error-log query after authenticated acceptance: no logs found

No Production target, alias promotion, database migration, environment mutation, or deployment-protection change was used.

## Authenticated browser acceptance

The protected route first redirected an unauthenticated request to `/login?next=%2Fadmin%2Fcars`. After the administrator signed in, the same Preview returned to `/admin/cars`.

Accepted results:

- [x] Final URL is the isolated Preview `/admin/cars` route.
- [x] Page title is `Car Rentals inventory normalization | iRatePilot Admin | iRatePilot`.
- [x] The single page heading is `Inventory-normalization workspace`.
- [x] `Car Rentals · Phase 3`, `Contract only`, and `0 of 10 gates recorded` are visible.
- [x] All eight provider-neutral contract areas are rendered: location, hours, vehicle class, capacity, transmission, powertrain, accessibility, and features.
- [x] Explicit unknown or unspecified controlled values are visible.
- [x] All ten Phase 3 normalization gates are displayed as a read-only reference.
- [x] The Phase 2 readiness and eleven-gate references remain available.
- [x] The runtime hard stop states that no supplier has been contacted or connected, no inventory is ingested, and no provider mapping exists.
- [x] The page contains zero forms, inputs, text areas, selects, or buttons.
- [x] Browser console scan returned zero warnings and zero errors.
- [x] Desktop visual acceptance confirmed the admin navigation, status card, headings, contract cards, and readable two-column layout.

## Boundary confirmation

This evidence authorizes no supplier research or contact, contract, account, credential, supplier data ingest, sandbox or Production traffic, live inventory, rate, reservation, payment, migration, alias promotion, or Production change. Those actions remain pending their own explicit approvals.

This evidence document was created locally after acceptance. Its commit and private-branch publication were separately approved on August 20, 2026; that approval does not expand any external-action boundary.

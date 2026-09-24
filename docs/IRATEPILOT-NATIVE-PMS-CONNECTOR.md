# iRatePilot OTA to PMS connector

This connector sends booking changes made on iRatePilot.com to the connected iRatePilot PMS property. It is a native integration between the two iRatePilot products; it does not enable Expedia, Booking.com, Airbnb, or other external OTA distribution.

## Delivery flow

1. A booking mutation writes a durable outbox event in the same database transaction as the booking change.
2. The request schedules a bounded post-response delivery attempt. An authenticated scheduled worker remains the retry and recovery path.
3. The worker reads the enabled sandbox property registry, claims one event using the configured property scopes, and sends a signed request to the PMS RPC gateway.
4. The PMS gateway checks the signature, event identity, property mapping, and idempotency state before staging the reservation.
5. A valid acknowledgement marks the event delivered; transport/server failures retry; invalid or unavailable credentials and mapping problems go to review without crossing property scopes. The sender accepts an acknowledgement only when the receiver returns bounded UTF-8 JSON with the exact event id, source version, HTTP result, and recognized outcome. Malformed, non-JSON, non-object, or oversized replies remain retryable and never mark the event delivered.

Booking creation, reservation-field changes, and cancellations are ordered snapshots keyed by booking and source version. A delayed retry blocks later versions for the same booking, so a cancellation cannot overtake an unacknowledged modification. A cancellation snapshot changes reservation state only; it does not authorize a refund, reverse a payment, or settle a folio. Handle any refund through the separate payment-provider review and reconciliation process.

Each OTA property has its own connection id, tenant and PMS property ids, and encrypted HMAC secret. The worker can process up to 100 enabled sandbox scopes. Signing secrets are decrypted only in the server runtime using `PMS_CREDENTIAL_ENCRYPTION_KEY`; the connection registry RPC is executable only by the Supabase service role. The global `IRP_PMS_SYNC_ENABLED` switch defaults off. The destination URL and publishable key are server-only environment settings.

An OTA administrator pairs the PMS tenant/property identifiers with the approved marketplace property in Admin → Settings → iRatePilot native connection. Saving is request-idempotent and audited; it creates the reservation outbox scope and saves ARI mappings together in disabled sandbox state. The screen shows capture, delivery, and ARI states independently. Saving configuration does not enable traffic.

The reservation scope and ARI mapping are now saved through one database transaction. If either setup operation fails, neither side is left partially configured. Both remain disabled sandbox until separately reviewed controls are completed.

The same screen provides a service-role-only, aggregate baseline preview. It reports only reservation, outbox, and version counts plus eligibility reasons; it never returns guest or booking identities. Preview is read-only. For sandbox capture, an administrator records a maintenance-window or approval reference and confirms the exact property id. The server rechecks eligibility and count, and the database records the administrator, reference, and snapshot count atomically with capture. Delivery release is a separate action that requires a sandbox round-trip evidence reference and its own exact confirmation. Capture enables sandbox event capture but leaves delivery disabled; release enables sandbox delivery only. These text references are audit attestations, not independent proof that an external approval system scheduled or verified the referenced event.

## Current release limits

- The receiver and worker are sandbox-scoped. Do not treat this as a production or externally certified channel manager.
- Delivery starts reservation staging in PMS; verify the guest, dates, room/rate mapping, taxes, payment state, and audit trail before using real reservations.
- External OTA adapters and provider authorization/certification are separate work.
- Apply and validate the connection-registry, reservation-setup, and baseline-review migrations in an isolated preview before enabling the sync switch. Prepare and review the existing-booking baseline, then validate reservation and ARI round trips. Do not activate production traffic solely because automated tests pass.

## Verification

The connector tests cover immediate wake-up scheduling, exact multi-property scope, per-property HMAC signing, unavailable credentials, durable event acknowledgement, and the service-role-only registry query. Run:

```sh
pnpm exec vitest run services/hotel-suppliers/iratepilot-pms/native-delivery.test.ts tests/native-pms-delivery-connection-registry.test.ts tests/booking-email-notifications.test.ts tests/native-pms-ari-route.test.ts tests/native-ari-migration-behavior.test.ts
```

Latest candidate validation (September 24, 2026 13:37 UTC): full `pnpm check` passed lint with no warnings, typecheck, 981 tests across 230 files, and a production build. The connector capability and ARI receiver routes are included in the production build. The existing candidate Preview is protected by Vercel SSO, so an unauthenticated fetch cannot verify its JSON response. The current public production probes still return 404 for both connector routes. Hosted migration and reservation round trip are not verified. Receipt: `release/evidence/native-ota-candidate-validation-2026-09-24-v3.json`.

## Deployment binding recheck (September 24, 2026)

Vercel confirms `www.iratepilot.com` and `iratepilot.com` currently point to production deployment `dpl_CgLUV9bxXnmnqvVF869nL3iCafR5`, branch `agent/flight-live-foundation-20260823`, commit `3d293b9e6a9c25450475e78775ee1c380e92d4aa`. The native connector candidate was committed and pushed to `codex/pms-native-ota-connector` and Vercel created READY deployment `dpl_6wbmTenve4UwjsXPMgfjdHUMJKB2` at commit `f63eeb19193980e9cb662dea69fa3e04263a4568`. The latest unauthenticated route checks returned the Vercel SSO gate (HTTP 302), so the app-level responses were not independently verified in this pass. Production remains unchanged. The hosted Preview migration and reservation round trip are still unverified. Receipt: `release/evidence/native-ota-deployment-binding-2026-09-24.json`.

At 08:32 UTC, the previous Preview deployment was `dpl_Dd461dodRK2sQJS3tAS2RnM4RSHK` at the base commit. It was superseded by the READY Preview deployment listed above. Keep Preview access protection enabled; verify its latest app response through an authenticated browser before using its endpoints.

## Current booking availability audit (September 24, 2026)

Read-only checks of the currently open OTA preview found zero matching marketplace stays. Its native connector capability reports `trafficEnabled: false`; external providers report `certification_required` with no configured provider list. A Vercel-authenticated fetch to the production `https://www.iratepilot.com/api/ota/capabilities` route returns HTTP 404. Production therefore has no deployed native connector capability endpoint, and the preview has no evidence that Red Roof Inn Ridgeland is approved, published, mapped, or accepting a booking. No account, inventory, or payment data was changed. These findings do not establish why inventory is absent; use the authenticated partner/PMS workflows after the sandbox database is verified. Receipt: `release/evidence/native-ota-live-audit-2026-09-24.json`.

The local zero-network sandbox preflight currently returns `ready: false`. `PILOT_MODE`, Stripe test credentials, Stripe/Resend webhook secrets, and the matching non-production Supabase project/key pair are not configured in this workspace. Public booking, live payments, live payouts, live Stripe webhooks, and SynXis traffic remain disabled. This preflight did not send network requests or modify any external system. Receipt: `release/evidence/native-ota-sandbox-preflight-2026-09-24.json`.

The browser was rechecked at 2026-09-24 08:13 UTC with public searches for Ridgeland, Mississippi, October 1–2, 2026, for two guests, on both the connector preview and `www.iratepilot.com`. Neither search returned an available stay. The production homepage explicitly says sample properties are used until direct partner inventory is connected. This confirms no matching inventory is publicly bookable for that query and that the production marketplace is not yet displaying connected direct partner inventory. It does not identify whether the test hotel is unpublished, unapproved, unmapped, or unavailable for those dates; determine that only through an authenticated owner/admin and PMS inventory review. Receipt: `release/evidence/native-ota-live-audit-2026-09-24.json`.

At 08:14 UTC, the signed-in production Partner Center → Properties showed no property records and stated that listings stay private until administrator approval. No draft was created. The Red Roof test property currently exists in the PMS pilot only; a matching OTA property record, approval, publication, mapping, and sandbox round trip have not been verified. Creating/publishing the branded hotel listing requires verified authority and approved property content; the Partner Center explicitly requires that verification before draft creation. Receipt: `release/evidence/native-ota-live-audit-2026-09-24.json`.

## Focused connector regression (September 24, 2026)

Re-ran the local ARI migration behavior, outbox lifecycle, connection registry, baseline review, reservation setup, and delivery worker suites. All 22 tests across six files passed using isolated test fixtures/PGlite. This verifies local connector behaviors only; it does not replace the missing hosted preview migration or an observed Red Roof reservation round trip. Receipt: `release/evidence/native-ota-focused-validation-2026-09-24.json`.

## Atomic connection setup validation (September 24, 2026)

Connection setup now invokes one service-role-only transactional RPC for the reservation and ARI configuration. A PGlite regression test forces the ARI save to fail and confirms the reservation scope and setup audit receipt are rolled back. Missing Preview migrations now produce a specific setup instruction without exposing database internals. Latest full check passed 981 tests across 230 files, TypeScript, lint, and production build at 13:37 UTC; receipt: `release/evidence/native-ota-candidate-validation-2026-09-24-v3.json`. Hosted preview migration, deployed application, property publication/mapping, and a real reservation round trip remain unverified. Receipt: `release/evidence/native-ota-atomic-setup-validation-2026-09-24.json`.

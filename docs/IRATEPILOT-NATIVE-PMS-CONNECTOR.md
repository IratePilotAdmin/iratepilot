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

Historical production-baseline port validation (September 24, 2026 14:10 UTC) passed lint, typecheck, production build, the flight launch-evidence audit, and 3,038 tests across 477 files at commit `3a050177bf4656c073a2d670252c79541ef9ecbe`. Its protected Vercel Preview reached READY, but authenticated application responses were not inspected. That receipt describes the earlier commit only.

Current local validation (September 24, 2026 18:18 UTC) passed lint, typecheck, production build, the flight launch-evidence audit, and 3,047 tests across 479 files at source commit `62e1c41`, with a test/evidence-only follow-up committed as `b4101f9`. There are 12 native PMS migrations using the canonical 12-digit filenames; the flight migration gate recognizes and excludes the complete set from its flight apply plan. Both connector routes are included in the local build. No Preview deployment for the current source commit was verified. No hosted connector migration or production deployment has been performed. Receipt: `release/evidence/native-ota-current-validation-2026-09-24.json`.

## Deployment binding recheck (September 24, 2026)

Vercel's production deployment remains `dpl_CgLUV9bxXnmnqvVF869nL3iCafR5`, branch `agent/flight-live-foundation-20260823`, commit `3d293b9e6a9c25450475e78775ee1c380e92d4aa`. Public GET requests to `www.iratepilot.com/api/ota/capabilities` and `/api/pms/ari` returned HTTP 404 at 14:13 UTC. The isolated `codex/native-ota-production-port` branch is based on that production commit and retains the live site's flight, hotel, and account pages while adding the connector. It is pushed and has a READY protected Preview; production remains unchanged. Hosted migration and the Red Roof sandbox round trip remain unverified. Receipt: `release/evidence/native-ota-production-port-validation-2026-09-24.json` and `release/evidence/native-ota-environment-discovery-2026-09-24.json`.

The production-based candidate Preview remains protected by Vercel SSO. Its deployment is distinct from the earlier feature-branch Preview. Do not infer application-level route behavior or database state from local build checks.

## Current booking availability audit (September 24, 2026)

Production still has no deployed connector capability or ARI receiver endpoint. The Red Roof test property is not yet proven approved, published, mapped, or accepting a booking on iRatePilot.com. No account, inventory, or payment data was changed. Determine its listing and mapping state through authenticated partner/PMS workflows after the non-production schema is verified. Receipt: `release/evidence/native-ota-production-port-validation-2026-09-24.json`.

The local zero-network sandbox preflight currently returns `ready: false`. `PILOT_MODE`, Stripe test credentials, Stripe/Resend webhook secrets, and the matching non-production Supabase project/key pair are not configured in this workspace. Public booking, live payments, live payouts, live Stripe webhooks, and SynXis traffic remain disabled. This preflight did not send network requests or modify any external system. Receipt: `release/evidence/native-ota-sandbox-preflight-2026-09-24.json`.

## Non-production Supabase discovery (September 24, 2026)

The signed-in Supabase organization contains a project named `iratepilot-hotel-rehearsal-20260908` (`trwuofvnqxdpmjztrnwp`). Its migration history is empty, while a read-only SQL Editor check succeeded and found the OTA base tables `properties`, `rooms`, `bookings`, and `partners` plus 38 other public tables. It contains one property record and no Red Roof name match. The dashboard briefly showed an `Unhealthy` status despite the successful read-only query; resolve that status before using it for migration acceptance. No connector migration was applied.

The existing `iratepilot-preview-20260817` project (`eiqmdldjnedqgbtoozqa`) already has PMS migration history through `202609070175` and is the managed Preview database used by flight-preview controls. The PMS restore-drill project is reserved for restore testing. Neither was changed. Do not treat either as a general connector staging target without a separate isolation review.

The current production-based connector Preview is READY, but its routes returned Vercel SSO redirects to unauthenticated probes, so their application responses and database binding remain unverified. Evidence and exact project state are recorded in `release/evidence/native-ota-environment-discovery-2026-09-24.json`.

The browser was rechecked at 2026-09-24 08:13 UTC with public searches for Ridgeland, Mississippi, October 1–2, 2026, for two guests, on both the connector preview and `www.iratepilot.com`. Neither search returned an available stay. The production homepage explicitly says sample properties are used until direct partner inventory is connected. This confirms no matching inventory is publicly bookable for that query and that the production marketplace is not yet displaying connected direct partner inventory. It does not identify whether the test hotel is unpublished, unapproved, unmapped, or unavailable for those dates; determine that only through an authenticated owner/admin and PMS inventory review. Receipt: `release/evidence/native-ota-live-audit-2026-09-24.json`.

At 08:14 UTC, the signed-in production Partner Center → Properties showed no property records and stated that listings stay private until administrator approval. No draft was created. The Red Roof test property currently exists in the PMS pilot only; a matching OTA property record, approval, publication, mapping, and sandbox round trip have not been verified. Creating/publishing the branded hotel listing requires verified authority and approved property content; the Partner Center explicitly requires that verification before draft creation. Receipt: `release/evidence/native-ota-live-audit-2026-09-24.json`.

## Focused connector regression (September 24, 2026)

Focused OTA receiver, route, migration behavior, delivery registry, worker, and setup-control tests passed within the current 3,047-test full suite. This verifies local connector behaviors only; it does not replace the missing hosted preview migration or an observed Red Roof reservation round trip. Earlier focused receipts remain historical and are not the current validation record.

## Atomic connection setup validation (September 24, 2026)

Connection setup uses a service-role-only transactional RPC for reservation and ARI configuration. The PGlite regression forces the ARI save to fail and confirms reservation scope and setup audit receipt are rolled back. Current local code validation passes all 3,047 tests across 479 files, lint, typecheck, production build, and the flight launch-evidence audit. Hosted preview migration, property publication/mapping, and a real reservation round trip remain unverified. Receipt: `release/evidence/native-ota-current-validation-2026-09-24.json`.

# Native iRatePilot PMS ARI connector runbook

This runbook covers the native PMS-to-iRatePilot.com availability and rate (ARI) receiver. It does not claim that external OTA providers are certified or that every reservation direction is live.

## Verified deployment status — September 23, 2026

- The connector code is on branch `codex/native-ari-capabilities-preview-20260923` at commit `4de2c4d766465911f41c34474b71f1736cbd2708` and has a READY Vercel preview. The preview URL is `https://iratepilotadmin-f2in13p19-irate-pilot.vercel.app`; Vercel sign-in protection is enabled, so it is not a public partner endpoint.
- The production Vercel project `iratepilotadmin` serves `www.iratepilot.com` from commit `a9dbf5f155f5ffc2dfe81da41a3522c69316783d`. The connector preview is a different commit; public GET probes to the connector paths return 404.
- `pms.iratepilot.com` is the private Sites sign-in host and returns 401 for unauthenticated connector paths. Do not point an OTA client at that host.
- The existing public `www.iratepilot.com` Vercel project can host the connector routes when the reviewed connector release is deployed. A separate API domain is optional; DNS changes are not a prerequisite established by current evidence.
- The receiver feature flag is fail-closed: unless `IRATEPILOT_PMS_ARI_ENABLED=true`, signed ARI POSTs return 503. The public capabilities endpoint reports the flag and supports CORS for GET/OPTIONS.
- The administrator console at `/admin/settings` now includes the Native ARI connection form, mapping editor, audit history, and per-connection enable/disable action. The preview API supports reading configuration/audit history and saving a connection disabled. Enabling is rejected unless the global receiver flag is on; the database function independently requires an admin actor, an active approved property, the matching enabled PMS reservation connection, and active room mappings. The interface currently exists only in the protected preview; production still lacks it.
- The migration `supabase/migrations/20260923130000_iratepilot_pms_native_ari_receiver.sql` is part of the candidate branch and has not been confirmed applied to the hosted Supabase project.

## What this connector does and does not do

The `/api/pms/ari` receiver accepts signed, bounded PMS availability/rate updates, maps PMS room-type/rate-plan pairs to active iRatePilot marketplace rooms, and atomically updates OTA inventory. Current contract support is USD only, 1–366 daily updates per batch, availability 0–500, rates USD 25–25,000, minimum stay 1, no maximum-stay value, and no restrictions. Do not send values outside that contract.

This ARI endpoint sends sellable inventory and rates **from PMS to iRatePilot.com**. Reservation delivery **from iRatePilot.com to PMS** is a separate outbox/booking workflow and needs its own persisted end-to-end acceptance. ARI success does not prove that a reservation was created in the PMS.

Expedia, Booking.com, Agoda, Airbnb, Google Hotel, CRS and GDS connections remain separate adapters requiring vendor approval, mappings, provider credentials, certification and provider sandbox acceptance.

## Production release sequence

1. Review and merge the connector change through the repository’s authorized GitHub release path. Keep `IRATEPILOT_PMS_ARI_ENABLED` unset or `false` during deployment. Confirm that the `www.iratepilot.com` production deployment contains both `/api/ota/capabilities` and `/api/pms/ari`.
2. Before changing the hosted database, obtain and verify a current owner export, complete an isolated restore rehearsal, record a rollback plan and maintenance window, and verify the target Supabase project. Apply the receiver migration only after those release gates pass; then confirm migration history and table/function presence.
3. Configure server-side Vercel Production variables without exposing values: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PMS_CREDENTIAL_ENCRYPTION_KEY` (base64 encoding of exactly 32 random bytes). Keep all credentials out of browser code, logs, docs, and support screenshots.
4. Confirm the marketplace property is active and approved and that the matching PMS reservation outbox connection is enabled for the same property and PMS property identifier. Create a unique connection identifier, generate a random signing secret of at least 32 bytes, and prepare one-to-one room and rate-plan mappings. Store the signing secret only through the encrypted admin configuration endpoint.
5. Keep the global receiver flag off until the migration is applied to the intended hosted project, the reviewed application is deployed, and property-scoped sandbox acceptance is complete. The preview admin screen verifies the approved property, matching enabled reservation connection and active room mappings, writes a configuration/activation audit receipt, and allows disablement even while the global flag is off.
6. In an isolated approved test property, validate capabilities discovery, signed ARI apply, exact duplicate replay, invalid signature, stale/conflicting versions, unmapped rooms, sold-out/held inventory, and that existing OTA bookings remain protected. Separately verify an OTA booking reaches the PMS reservation outbox and is acknowledged by the PMS.
7. After the approved production release and property-scoped acceptance, enable only the tested connection through the production admin screen; global enablement follows the release gates. Observe route errors, inventory drift, pending reservation delivery and duplicate/conflict counts. Disable globally first if authentication, mapping, capacity or data-integrity checks fail.

## Current operator action

Until the public release, hosted migration, operator-facing activation workflow, property mapping and two-way sandbox acceptance are verified, treat the integration as **preview only**. Do not enter real property credentials, enable live traffic, claim that an OTA reservation has reached the PMS, or use the private PMS login host as the partner API.

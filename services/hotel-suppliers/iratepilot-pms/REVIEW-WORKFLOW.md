# Reservation receipt and review contract

This implementation is local until the migrations and receiver are deployed. It does not activate any OTA connection.

The signed receiver uses a server-only client to call `irp_pms.receive_reservation`. The existing seven parameters remain supported; optional eighth parameter `p_review_reason` records the mapper's explanation for pending, refunded, or externally authoritative bookings. `irp_pms.apply_reservation` is no longer directly executable by `service_role` once migration 145 is installed, so writes cannot accidentally bypass newer inbound source versions.

Receipts retain `application_outcome`, `normalized_record`, and `review_reason`. The normalized record contains only the allowed reservation fields, not raw guest/contact/payment payloads. A later duplicate with another event ID inherits the first record for that source version even if mapping configuration changed. Retrying an unresolved review returns `outcome: review-required`. A successful review is recorded separately in `resolution_outcome` and `resolved_at`; the original outcome remains available for audit.

Use `coalesce(resolution_outcome, application_outcome)` as the effective result. Only the highest non-conflicting source version for each tenant/property/booking is current. Older receipts remain history, not a new instruction to alter a stay.

Authenticated owners and managers can read scoped `irp_pms.inbound_events` and `irp_pms.review_actions`. Staff cannot read these tables. An owner or manager may call:

```js
userClient.schema('irp_pms').rpc('reprocess_reservation', {
  p_tenant: tenantId,
  p_property: propertyId,
  p_event: eventId,
  p_request: requestId,
  p_reference: 'Capacity corrected and reviewed'
})
```

This uses the authenticated user's session; never substitute a service credential. Custom-schema RPC use also requires exposing `irp_pms` through PostgREST, or an authenticated public wrapper. Do not expose the schema without its grants and RLS policies.

Reprocessing is deliberately limited to `review:capacity_missing` and `review:sold_out`. Correct property capacity first using the controlled configuration function. The database reuses the stored normalized record and repeats capacity checks under the same property lock as normal admission. A newer source version produces `stale` without applying the old record. A request UUID identifies one immutable action with an 8–200 character review reference; a retry returns its original result, while changed parameters reject. Reservation, receipt resolution, and action audit commit together.

Pending/refunded state, past arrivals, excess guests, started stays, reinstatements, assigned-room changes, and version conflicts require a corrected newer source event or separate reconciliation. This RPC cannot force any of those states into a reservation.

Cancellation preserves the previous stay and financial fields. Its status releases capacity. Existing physical room assignment is retained as historical data and must not be counted when status is `Cancelled`. Past-date and guest-limit checks become active when the pilot's timezone and room-type limit columns are present.

The migration-145 shutdown script revokes both inbound receipt execution and authenticated reprocessing while retaining records. Restore privileges only through a reviewed rollout. Source-outbox transport errors use the optional migration-148 procedure in `SOURCE-RECOVERY.md`; a destination review action does not requeue OTA events.

Local verification covers receipt durability, cancellation history, null guest references, mapping-stable duplicates, retry semantics, atomic rollback, manager permissions, stale-head protection, configured guest/date limits, assigned-room updates, and shutdown. PGlite tests do not prove production multi-session concurrency or deployed Supabase authentication configuration.

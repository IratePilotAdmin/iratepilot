# Authenticated review surface

Migration `202609070150_iratepilot_pms_review_surface.sql` depends only on the PMS migrations 142–147. It leaves their installed definitions unchanged. It exposes the existing receipt/reprocessing workflow through the public PostgREST schema, with the signed-in owner's or manager's authenticated client. No service credential belongs in the browser.

```js
const { data, error } = await userClient.rpc('irp_pms_pilot_review_events', {
  p_tenant: tenantId,
  p_property: propertyId,
});
// data: { business_date: 'YYYY-MM-DD', time_zone: 'Pacific/Kiritimati', events: [...] }
```

Each event contains `event_id`, `booking_id`, `source_version`, `application_outcome`, `resolution_outcome`, `effective_outcome`, `review_reason`, `received_at`, `resolved_at`, `normalized_record`, `is_current`, and `can_reprocess`. The normalized record is the retained allowed reservation command, without raw guest/contact/payment payloads.

The response contains at most 100 receipts. Current unresolved reviews come first, then receipt time descending, with event ID breaking ties. The source head is calculated from the entire property history before applying the limit. `is_current` means that the receipt matches the latest non-conflicting version and hash for its booking; multiple duplicate receipts can share that head. Version-conflict receipts never become the authoritative head. `effective_outcome` is the recorded resolution when present, otherwise the original application outcome. This bounded window is an operator view, not a complete audit export.

`can_reprocess` is true only for current retained `review:capacity_missing` or `review:sold_out` receipts with an arrival on or after the property's business date. It identifies an allowed action, not a guarantee that capacity is now sufficient. Fix nightly capacity first, retain one request UUID for retries, and record what was reviewed:

```js
await userClient.rpc('irp_pms_pilot_reprocess', {
  p_tenant: tenantId,
  p_property: propertyId,
  p_event: eventId,
  p_request: requestId,
  p_reference: 'Capacity corrected and checked against room inventory',
});
// { eventId, requestId, applicationOutcome, business_date }
```

Reprocessing delegates to migration 145: property locking, source-head validation, admission checks, immutable request receipts, and reservation/audit atomicity remain in that function. A delayed action can return `stale`; the UI must inspect `applicationOutcome` and refresh the scoped review list. A repeated request returns its original action outcome while `business_date` reflects the current call. Changed event/reference/actor parameters cannot reuse a request UUID. Both public wrappers run with invoker privileges; revoking the private function's authenticated execution also blocks the public reprocessing route.

The migration adds a unique room-type name index on `(tenant_id, property_id, lower(trim(name)))`. Case/space variants in the same hotel are rejected; the same name in another hotel is allowed. Existing duplicates cause installation to fail atomically for operator reconciliation. No room IDs or historical bookings are merged or deleted.

The matching shutdown SQL revokes both public wrappers and retains receipts, action history, and the uniqueness guard. It does not disable the private workflow or signed inbound delivery; their separate shutdown controls remain applicable.

Run `scripts/verify-iratepilot-pms-review-surface.mjs` with `PGLITE_DIST` pointing to the installed PGlite distribution. The local 32-check suite uses PostgreSQL role/auth stubs and no remote writes. It covers tenant/member denial, normalized name uniqueness, current/stale/conflicting receipts, bounded history, business-date eligibility, request replay, effective resolutions, and both shutdown paths. It does not prove deployed Supabase configuration or multi-session production concurrency.

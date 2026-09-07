# Confirmed reservation amendments

Migration 153 adds one authenticated operating RPC for confirmed, unstarted `direct` and `migration` reservations. It requires the PMS operating foundation and folio migration 152. It does not alter any earlier migration, OTA event, financial opening, payment record, or source identity.

```text
public.irp_pms_pilot_amend_reservation(
  p_tenant uuid, p_property uuid, p_reservation uuid, p_request uuid,
  p_expected_version bigint, p_guest_name text, p_room_type uuid,
  p_arrival date, p_departure date, p_guests integer,
  p_accommodation_minor bigint, p_taxes_minor bigint
)
```

Use the selected reservation's current `source_version` as `p_expected_version`. Supply all editable values, including unchanged values. The name is trimmed; dates must be on or after the property's current calendar date, with a stay of 1–30 nights. The room type must belong to this property and support the guest count. Accommodation and taxes are nonnegative integer USD minor units. Existing fees are retained and the total is recalculated from accommodation, taxes and retained fees.

Staff may amend guest/stay data and amounts before a financial opening exists. After the folio opens, staff can change nonfinancial values but amount changes require owner/manager membership. An opening already frozen in migration 152 is preserved. A mismatch between the amended reservation amounts and that opening is explicitly flagged for financial reconciliation; no charge adjustment, payment, refund, or ledger correction is generated automatically.

The property transaction lock serializes amendments with direct/OTA admissions, imports, capacity changes and folio postings. Every affected night is checked against all other confirmed/in-house reservations, regardless of source, excluding only the reservation being amended. Inventory changes after the editing screen loaded can therefore reject an amendment even when its own version is unchanged.

OTA reservations must be amended at their source. In-house, checked-out and cancelled reservations cannot use this endpoint. A reservation with an assigned physical room cannot change dates or room type here; its retained assignment must match the type and not overlap another active assignment. Room reassignment requires a separate workflow.

The response is:

```text
reservation: complete saved reservation row
replayed: boolean
folio_opening_retained: boolean
financial_reconciliation_required: boolean
```

Every successful new request increments `source_version` once, up to the supported safe integer limit. Its source, source booking ID, migration provider/source ID, physical room assignment and operating status remain unchanged. An immutable private receipt stores the command, prior reservation, resulting row and actor; the activity log records old/new versions and financial flags.

Persist the request UUID and exact command in the client until its outcome is known. Repeating the same actor/request/command returns its original immutable response without writing again, even if another amendment or later stay operation has occurred. **Refetch the workspace after a replay** because that response is the historical receipt and may contain an earlier reservation version. Reusing the request for different values is rejected.

A new request with an outdated expected version is rejected with SQLSTATE `40001` and a message to refresh/review the reservation. Do not blindly increment the expected version or automatically overwrite newer edits. Validation and audit failures roll back the complete amendment, including its version increment and receipt.

The companion shutdown SQL revokes amendment RPC access while retaining reservations, receipt history, folios and ordinary stay operations. It performs no destructive rollback.

Local tests use PGlite with authentication stubs. They cover role boundaries, cross-tenant data, stale optimistic versions, replay after later edits, capacity consumed by multiple sources, newly unavailable extension nights, frozen-folio protections, physical assignment safety, migration identity preservation, audit failure rollback and shutdown. They do not claim live deployment or multi-session contention testing.

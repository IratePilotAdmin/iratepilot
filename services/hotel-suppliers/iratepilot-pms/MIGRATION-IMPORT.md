# Future reservation import

Migration 151 adds a staged import for owner/manager users. It requires the destination PMS foundations through 146; the staff features in 147 and OTA source stack are independent. Do not change previously applied migrations. Apply 151 once through the normal migration process.

The scope is **confirmed reservations arriving on or after the property's current calendar date**, for 1–30 nights, in USD. Prepare room types, physical rooms, and nightly capacity first. Imported reservations consume the same capacity as direct and OTA reservations. Staff can subsequently check them in, check them out, or cancel them through existing operating gates.

Amounts describe reservation charges. No payment is captured, no deposit is posted, and no balance is marked settled. Payment/deposit fields are rejected. Existing-PMS payment balances, refunds, guest history, taxes configuration, users, locks, POS, and financial reconciliation require separate onboarding procedures.

## Input

Call public RPCs with the signed-in Supabase user's bearer token. The database derives authorization from membership; never send a service key from the browser.

`irp_pms_pilot_stage_import(p_tenant uuid,p_property uuid,p_request uuid,p_provider text,p_rows jsonb)`

The provider is a stable code such as `cloudbeds`, `mews`, or `opera-export`. It is trimmed and lowercased and must match `[a-z0-9][a-z0-9_-]{0,79}`. Each original source ID must be stable. Its uniqueness applies to the property and provider, including cancelled reservations. Changing a provider code to bypass a duplicate check would create a separate source identity and should not be used as a retry.

Send an array of 1–500 rows, no larger than 1 MiB:

```json
[
  {
    "source_id": "original-reservation-84721",
    "guest_name": "Example Guest",
    "room_type_id": "configured-pms-room-type-uuid",
    "arrival": "2027-03-10",
    "departure": "2027-03-12",
    "guests": 2,
    "currency": "USD",
    "accommodation_minor": 20000,
    "taxes_minor": 2400
  }
]
```

Replace the example dates and room type with valid future dates and the selected property's room type. Currency must be the string `USD`; amounts must be integer minor units, not decimal dollars or quoted numbers. The total is accommodation plus taxes. Source IDs and guest names are trimmed. Extra keys, including deposit, payment and identity-document fields, and nested objects/arrays are rejected for the entire batch before any source rows, preview, activity or action receipt is saved. Malformed scalar values retain normal row-specific preview errors.

## Review and commit

Staging writes only the immutable source batch, preview, and audit entry. It does not create reservations, change capacity, assign physical rooms, or record money movements. A shared property lock stabilizes capacity while the bounded preview is calculated.

The stage response has `batch_id`, `provider`, `status`, `row_count`, `valid_count`, `error_count`, `currency`, `payment_state: "not_recorded"`, and `rows`. Each row has its 1-based `row_number`, `source_id`, `valid`, `errors` array of strings, and `normalized` object or null. `error_count` counts invalid rows. Capacity checks include demand from every valid row in the batch together. Reuse the same stage request UUID only for an identical source batch from the same user.

`irp_pms_pilot_list_imports(p_tenant,p_property)` returns the latest 100 summaries. `irp_pms_pilot_import_detail(p_tenant,p_property,p_batch)` returns the original preview plus current status, immutable commit receipt, and latest action result. Staged source rows and previews cannot be edited through client table writes. Correct an invalid batch by discarding it and staging a new batch.

`irp_pms_pilot_commit_import(p_tenant,p_property,p_batch,p_request)` locks the property, rechecks every source identity, date, guest limit, amount and nightly capacity, and creates the complete batch in one transaction. A successful response contains `status: "committed"`, `reservation_ids`, and `payment_state: "not_recorded"`. Imported reservations have source `migration`, the provider/source identity, and their original charge amounts. A source ID is never shared implicitly with the OTA namespace.

If inventory or source identity changed since preview, the response has `status: "validation_failed"` and fresh row errors. No operational reservation is written. The original preview remains unchanged and a separate failure receipt records the attempt. An originally invalid batch remains ineligible even if conditions later change. A previously valid batch may be retried after correcting inventory using a **new commit request UUID**. Reusing the old failed request returns its original result. Retrying a successful request or committing an already committed batch returns the original reservation IDs without duplication.

`irp_pms_pilot_discard_import(p_tenant,p_property,p_batch,p_request)` closes a staged batch while retaining its preview and audit receipt. It does not delete reservations, and committed batches cannot be discarded. Use normal reservation operations to cancel an individual imported reservation when appropriate.

## Shutdown

The companion `202609070151_iratepilot_pms_migration_import.shutdown.sql` revokes authenticated import write RPC access. It preserves source previews, action receipts, reservations and all operating history; read RPCs and normal staff stay operations continue. It is a pause, not a destructive schema rollback. Resume only after reviewing the cause by granting EXECUTE on the three revoked public functions to `authenticated` again.

The tests use local PGlite with authentication stubs, exercise aggregate demand and stale previews, and inject a second-row insert failure to verify full transactional rollback. They do not establish live Supabase connectivity, production migration readiness, or multi-session contention performance.

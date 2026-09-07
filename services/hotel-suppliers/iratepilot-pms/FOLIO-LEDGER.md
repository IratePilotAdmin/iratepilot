# Reservation folios

Migration 152 adds an immutable ledger of additional charges, charge reversals, **externally recorded** payments/refunds, and payment-record corrections. It does not contact a payment provider, capture money, issue a refund, verify settlement, or produce a provider confirmation. The operator must reconcile entries against the external cash/bank/processor records identified in each reference. A payment correction reverses a mistaken bookkeeping entry without asserting that money was refunded externally.

Apply 152 after the destination PMS operating foundation in 146. Existing migrations remain unchanged. The ledger uses private tables with row-level security and no authenticated or service-role mutation grants. All authenticated writes pass through the scoped owner/manager RPC and the same property transaction lock used by reservation operations. Staff members may read folios.

## Reading

`public.irp_pms_pilot_folio(p_tenant uuid,p_property uuid,p_reservation uuid)`

This read acquires a shared property lock for a consistent snapshot and does not insert an opening or audit record. Until the first successful posting, it returns `opening_mode: "reservation_preview"` with the reservation's current accommodation, tax, and OTA fee amounts. The first successful posting freezes these opening amounts exactly once. Subsequent reads return `opening_mode: "frozen"`.

If reservation totals change after the opening is frozen, `reservation_amounts_changed` becomes true. The ledger is preserved. An owner/manager should review the source amendment and record an explicit charge or reversal as appropriate. A cancellation or checkout does not automatically void charges, record payment, or refund money.

The response includes:

```text
reservation_id, available, currency: USD, payment_recording: external_only
opening_mode: reservation_preview | frozen
reservation_amounts_changed
opening: accommodation_minor, taxes_minor, fees_minor, total_minor, opened_at
totals: additional_minor, reversed_minor, charges_minor,
        external_payments_minor, external_refunds_minor, corrected_payments_minor,
        paid_minor, balance_minor
entries: id, request_id, kind, amount_minor, currency, reference, reason,
         target_entry_id, actor_id, created_at
```

`additional_minor` is the gross added-charge amount. `reversed_minor` is the gross amount reversed from opening or added charges. `charges_minor = opening.total_minor + additional_minor - reversed_minor`. `paid_minor` means **net externally recorded payments** and equals gross external payments minus recorded external refunds minus payment-record corrections. It is not a provider-verification flag. `balance_minor = charges_minor - paid_minor`; a negative value is an externally recorded credit/overpayment. `corrected_payments_minor` remains separate from `external_refunds_minor` so bookkeeping corrections do not appear as actual external refunds.

An OTA cancellation tombstone without original monetary data returns `available: false`, `reason: "reservation_charges_unavailable"`, and no fabricated zero balance. Posting requires known original charge data.

## Posting

`public.irp_pms_pilot_post_folio(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reference text,p_reason text,p_target uuid DEFAULT NULL)`

The authenticated owner/manager supplies a fresh request UUID, a positive integer USD minor-unit amount, an external/operator reference of 4–200 trimmed characters, and a reason of 4–500 trimmed characters. There is no arbitrary JSON metadata field and no currency override. Individual amounts, each gross ledger category, and net total charges are bounded to 999999999999 minor units.

Supported kinds:

- `charge`: adds a charge; `p_target` must be null.
- `charge_reversal`: reverses charges. A null target refers to opening charges; otherwise the target must identify an added `charge` in this exact reservation. Total reversals cannot exceed the target's remaining unreversed amount.
- `external_payment`: records money the operator says was received externally; `p_target` must be null. Overpayment is retained as a credit balance.
- `external_refund`: records an external refund; the target must be an `external_payment` entry in this exact reservation.
- `payment_correction`: reverses a mistaken external-payment record without claiming money was refunded. Its target must also be an `external_payment` entry in this exact reservation. Use a reason that explains the bookkeeping error.

Refunds and payment corrections share the same remaining allowance on their target payment. Their combined amount cannot exceed the original payment, and neither can make net recorded payments negative. For example, a 10000-minor-unit payment with a 2000 refund and a 3000 correction has 5000 remaining that can be refunded or corrected.

For `external_payment` and `external_refund`, the reference must identify the actual external transaction. The trimmed reference is unique within the reservation and entry kind, backed by a database unique index. Recording it again with a new request ID is rejected, even if the browser lost its previous command. Canonical request replay is checked first, so retrying the original unchanged request still returns its original entry. References remain case-sensitive; do not change a reference or append a suffix to bypass duplicate detection.

The response has `entry_id`, `request_id`, `kind`, `amount_minor`, `reference`, `reason`, `target_entry_id`, `created_at`, `payment_recording: "external_only"`, and `replayed`. Refetch the folio after posting to obtain updated totals.

Reusing the same request UUID, actor, reservation, kind, amount, reference, reason and target returns the original entry without changing balances or audit history. Reusing the request for a changed command is rejected. Receipts are the immutable entries themselves. A reversal or refund is another entry; existing entries cannot be edited or deleted through client APIs. Opening snapshot, entry, and audit write commit together. If validation or audit insertion fails, all writes roll back.

## Shutdown and validation

The companion `202609070152_iratepilot_pms_folio_ledger.shutdown.sql` revokes posting RPC execution while preserving readable opening snapshots, entries, balances and audit history. It does not delete, reverse, or refund existing amounts. Resume only after reviewing the cause by granting EXECUTE on the posting signature back to `authenticated`.

`scripts/verify-iratepilot-pms-folio.mjs` tests local PostgreSQL with authentication stubs: roles and tenant boundaries, pure reads, frozen opening charges, idempotency, transaction-reference uniqueness, target constraints, mixed partial refunds/corrections, reversal ceilings, credit balances, cancellation history, source amendments, audit failure rollback, and shutdown. Property locking and relational constraints provide serialization; this suite does not claim multi-session contention testing or live payment integration.

# Recorded folio activity and current balances (164)

These read-only USD pilot reports show recorded folio activity and current known charge balances. They do not establish processor capture, bank settlement, collected cash, earned revenue, overdue receivables, a complete accounts-receivable ledger or a legally approved refund. No provider, jurisdiction or new payment account is configured.

All scoped owner, manager and staff members can read, matching the existing individual folio permissions. Each RPC holds tenant SHARE and property SHARE locks and rechecks membership after waiting. Existing operating/financial writers serialize on the property lock. Reads do not create folio openings, reservations, receipts, messages or activity records. No guest name, contact, billing party or auth account data is returned. Actor UUID, source booking identifiers, user-entered reference and reason remain available for the activity audit; operators should keep unnecessary personal data out of these free-text fields.

## Activity API

`irp_pms_pilot_folio_activity_report(p_tenant uuid, p_property uuid, p_start date, p_end date)`

The period covers 1–366 local calendar days and excludes the end date. Each boundary is converted independently through the current property time zone; daylight-saving days may contain23 or25hours. The filter uses immutable entry `created_at` recording time. It does not use a transaction's external date, stay date or settlement date. Changing the property's time zone changes which local report date contains an entry, without rewriting that entry.

Return:

- `property`: current property row, including `time_zone`.
- `period`: `{start,end,end_exclusive:true,start_at,end_at}`; timestamp bounds are timezone-aware.
- `generated_at`, `currency:'USD'`, `payment_recording:'external_only'`, `rows_truncated:false`, `definitions`.
- `rows`: ordered by `created_at,id`; each `{id,request_id,reservation_id,source,source_booking_id,status,kind,amount_minor,currency,reference,reason,target_entry_id,actor_id,created_at,local_date,charges_effect_minor,recorded_paid_effect_minor,balance_effect_minor}`. Reservation source and status are **current labels**, not a historical status snapshot.
- `totals`: `{entry_count,additional_minor,reversed_minor,external_payments_minor,external_refunds_minor,corrected_payments_minor,charges_effect_minor,recorded_paid_effect_minor,balance_effect_minor,complete:true}`.

| Kind | Charge effect | Recorded-payment effect | Balance effect |
|---|---:|---:|---:|
| `charge` | +amount | 0 | +amount |
| `charge_reversal` | −amount | 0 | −amount |
| `external_payment` | 0 | +amount | −amount |
| `external_refund` | 0 | −amount | +amount |
| `payment_correction` | 0 | −amount | +amount |

`payment_correction` reduces an incorrectly entered payment record. It does not assert that external money was refunded. Gross per-kind totals retain their positive recorded magnitudes; net effects use the table above. Opening accommodation, taxes and fees are not entry activity and are never synthesized as charges in this period report. Consequently period activity is not a current balance.

## Current balance API

`irp_pms_pilot_current_balances(p_tenant uuid, p_property uuid)`

This is a current, property-wide snapshot with no arrival filter or historical as-of date. Every reservation is included, regardless of lifecycle status, whether its arrival is in the future, and whether its balance is positive, zero, negative or unavailable. This avoids silently omitting future or undated cancelled records.

Return:

- `property`, `as_of`, property-local `business_date`, `currency:'USD'`, `payment_recording:'external_only'`, `rows_truncated:false`, `definitions`.
- `rows`: ordered by arrival then ID, unknown arrival last. Each `{reservation_id,source,source_booking_id,status,arrival,departure,available,reason,opening_mode,reservation_amounts_changed,pricing_reconciliation_required,current_reservation_total_minor,opening,totals}`.
- Available `opening`: `{accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,total_minor,opened_at}`. The existing individual folio calls its OTA-only amount `fees_minor`; this report names it `ota_fees_minor` explicitly. Hotel fees remain separate.
- Available row `totals`: `{additional_minor,reversed_minor,charges_minor,external_payments_minor,external_refunds_minor,corrected_payments_minor,recorded_paid_minor,balance_minor}`. Recorded paid = payments − refunds − payment-record reductions; balance = opening + additions − reversals − recorded paid.
- `opening_mode` is `frozen`, `reservation_preview` or `unavailable`. A frozen folio opening remains the basis even when reservation amounts or the pricing snapshot later differ. `reservation_amounts_changed` exposes that discrepancy; `pricing_reconciliation_required` exposes the current adjusted-pricing flag. Neither flag changes money automatically.
- An unavailable row has `available:false`, reason `reservation_charges_unavailable`, `opening:null` and `totals:null`. Its stored `current_reservation_total_minor` may also be null. Never display these unknowns as zero.
- Grand `totals`: `{reservation_count,available_count,unavailable_count,positive_balance_count,credit_balance_count,zero_balance_count,changed_reservation_count,pricing_review_count,charges_minor,recorded_paid_minor,balance_minor,positive_balances_minor,credit_balances_minor,complete}`. Monetary aggregates include only available rows. If any row is unavailable, `complete:false` and all monetary aggregates must be labeled **known subtotals**. Unknown rows are excluded from zero-balance counts. `credit_balances_minor` is signed negative; positive and credit balances are shown separately rather than concealing them by netting.

A positive balance on a cancelled or future reservation is a recorded charge balance, not automatically money overdue or currently collectible. A credit balance is not authorization to refund. Historical cancellation charges remain unless an explicit existing folio reversal changes them.

## Bounds, installation and verification

Activity rejects more than10,000 selected entries with a request to narrow the period. Current balances reject more than10,000 property reservations with a request for an operator export; it never silently filters or truncates. Every returned monetary subtotal must fit the exact JSON integer range ±9,007,199,254,740,991. Both gross activity totals and separately summed positive/credit balances are checked, so offsetting amounts cannot hide unsafe precision.

Apply only forward164 to the destination PMS after the existing destination stack. It creates the two read functions, a private number-bound helper and a scoped entry timestamp index. It does not depend on the separate source-only157 migration. Do not install a folder by glob. Shutdown revokes only these report endpoints and leaves the individual folio and all stored money unchanged.

Local verification: `PGLITE_DIST=<pglite/dist> node scripts/verify-iratepilot-pms-folio-reports.mjs`.24 focused checks cover all five event signs, agreement with existing folios, immutable read behavior, unknown amounts, future/cancelled/credit/zero stays, current frozen-basis discrepancies, scopes and revoked roles, local boundaries including23/25-hour days, explicit row-limit failures and exact-integer failures. Large invalid fixture data is administrator-created only in disposable rollback transactions; normal posting limits remain in force. No real multi-session contention or provider settlement is claimed.

Parent workspace artifacts: `work/iratepilot-folio-reports-install.sql`, `work/postgres-test-runtime/folio-reports-preflight.sql`, `folio-reports-rollback-test.sql`, `verify-folio-reports-rollback.mjs`, and `folio-reports-rollback-local-result.json`. The proof creates only transaction-local synthetic data and uses an existing confirmed owner identity solely inside that transaction. It sends no payment request and changes no auth account. All fixture memberships, operating rows and financial records roll back.

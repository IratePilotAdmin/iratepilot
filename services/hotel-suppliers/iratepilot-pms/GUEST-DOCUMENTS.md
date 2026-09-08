# Stay registration summary and guest account statement —173

Migration173 adds one read-only reservation document endpoint for hotels and whole-home rentals. It combines current property/stay labels, saved contact and bill-to copies, a preserved or preview folio, and a separate refundable security-funds summary in one authorized database statement snapshot. It does not create or issue a document record, invoice number, signature, consent, folio opening, deposit book, payment, email or audit entry.

This is an operational prepared snapshot. Its generation time identifies when the read was prepared; it is not a historical as-of query, commit watermark or promise that later reprints will be identical. Existing contact, financial and operating records may subsequently change through their own reviewed APIs.

## Endpoint and authorization

public.irp_pms_pilot_guest_documents(p_tenant uuid,p_property uuid,p_reservation uuid) returns one schema_version1 JSON object. Current owner, manager and staff members may read within their existing property scope. Anon and service_role cannot execute this public endpoint. The four private projection helpers have no application-role EXECUTE grants. No existing table, policy, function definition, owner or ACL is changed.

The reader checks membership, takes tenant SHARE then property SHARE locks and rechecks membership after waits. It captures property, reservation, scoped room/type, saved party, linked-profile version, opening, complete bounded folio rows and deposit book/events in one relational SELECT. Source data is not fetched again while projecting the result. The projection's only other function calls validate captured JSON/scalars; they do not open source records or call separate guest/folio/deposit RPCs.

The shared property fence coordinates the supported guest, financial and operating writers. One final statement snapshot additionally prevents mixing components if a trusted administrator performs an atomic source update outside those writer locks. This does not grant or endorse arbitrary administrative mutations. The reader is not a mechanism to bypass current membership after removal.

## Response sections

The top level contains schema_version, tenant_id, property_id, reservation_id, actor_id, role, generated_at, property_business_date, property, reservation, stay_guest, account, security_deposit, completeness and semantics. Caller/scope IDs are validation metadata and do not belong on guest print.

Property returns only id, name, USD currency, time_zone and hotel/whole_home operating_model. There is no invented legal issuer address, tax ID, jurisdiction registration field or document-number configuration.

Reservation includes source/reference/version, current status/no-show kind, booked name, planned arrival/departure/nights/guest count, current room-type label, accurately labeled recorded physical room and actual stored check-in/out timestamps. A checked-out/cancelled reservation can retain its old physical_room_id. Its current_occupancy is false; a recorded room is not proof of actual present occupancy. Missing quantities and dates stay null. Legacy control characters in booked display labels are replaced by spaces and text_normalized flags that display-only normalization.

Current reservation charges retain accommodation, taxes, hotel fees, OTA fees and total separately. known is true only when every component is present and reconciles. Independently unknown scalar categories remain null and are never filled from a price breakdown.

stay_guest separates the saved stay contact and independent billing_party from the mutable reusable profile. An absent saved record has recorded:false, version0, contact:null and billing_party:null; the booked name does not become an invented saved contact. A saved copy exposes its version, copied profile version, linked current version and change flag, but not current profile contact data. Refreshing/editing saved contact remains the existing explicit guest workflow. A bill-to record does not establish accepted liability.

## Account meaning and arithmetic

Account has available, unavailable_reason, opening_mode, opening, totals, complete entries, reservation_amounts_changed, separate current/opening pricing warnings, their combined pricing_reconciliation_required, itemization_available, adjustments_itemized:false and payment_recording:external_only.

- With no frozen opening and unknown original charges, available is false, opening/totals are null and no zero balance is invented. A valid unknown snapshot may be printed only with its unavailable-amount warning intact.
- With known original charges and no opening, opening_mode is reservation_preview. Reading/printing does not insert an opening.
- With a frozen opening, opening_mode is frozen and the original opening/source version/time/itemization is retained. Later current reservation changes do not reprice it.

opening.ota_fees_minor maps from the old folio opening's fees_minor; hotel_fees_minor remains separate. The frozen/current discrepancy comparison includes all monetary categories and the original raw breakdown, including same-money date/itemization changes.

Totals retain these equations:

- charges_minor = opening total + additional_minor - reversed_minor
- paid_minor = external_payments_minor - external_refunds_minor - corrected_payments_minor
- balance_minor = charges_minor - paid_minor

A negative balance is a recorded credit; a positive one is a current recorded balance, not an assessed due date or overdue receivable. External payment/refund records do not prove money moved through a processor. Payment record corrections remain separate from external refunds.

Each entry contains only id, kind, fixed label, amount/currency, target ID, original recorded timestamp and charge/payment/balance effects. Internal reference, reason, actor ID and request ID are omitted from the endpoint, not merely hidden by print CSS. Generic labels are Additional charge, Charge reversal, External payment recorded, External refund recorded and Payment record correction.

Entries are ordered by timestamp then UUID for deterministic display. That order is not a financial version and does not justify inferred running balances. Same-account target rules and aggregate caps are validated. A null-target charge reversal is a valid original-opening waiver with its own cumulative opening cap; it is not required to target another entry.

Recorded timestamps display in the property zone captured by this prepared snapshot, not the browser zone. Old folio entries have no frozen recording-zone field. A later document after a property-zone change can show a different civil date for the same instant and must not call it the event's frozen business day.

The three warning flags are distinct: opening_pricing_reconciliation_required follows the selected opening/preview itemization; current_pricing_reconciliation_required follows current itemization; pricing_reconciliation_required is their OR with reservation_amounts_changed. Unavailable accounts retain the same rule. Printing never resolves a warning.

## Tax and fee itemization

The reader validates and projects known pricing fields rather than returning arbitrary stored JSON. It preserves configured/legacy/adjusted mode, original stay dates, aggregate amounts, named taxes and fees, retained fee dates/quantities and reconciliation flags. Optional166 property-fee/operating-model version metadata is validated but not projected as a guest financial line.

City, State, Lodging and Existing combined tax remain distinct when supported by stored evidence. Adjusted tax total keeps its null rate/base; it is never apportioned among jurisdictions. Resort, Technology and Cleaning fee lines retain original unit amount, per-night/per-stay basis, quantity and tax selections. Adjusted retained fees use their original fee-basis dates, not current nights or current property settings. Original Cleaning evidence can remain after subsequent property configuration changes.

Tax and fee lines reconcile to their original category totals. Per-night tax rounding is preserved: a summed taxable base multiplied once by its rate need not equal the sum of rounded nightly tax amounts. The document does not recalculate tax using a different rounding basis.

Non-null itemization must contain complete known monetary categories and finite stay dates. Malformed non-null evidence rejects the document instead of being silently hidden. Independently nullable current scalar amounts may coexist with complete itemization, but known scalars must agree and missing scalars remain unknown.

Additional folio charges and reversals have no tax classification. Show them separately and retain adjustments_itemized:false. Do not distribute reversals across tax/fee lines or describe the original opening tax lines as a final legal tax assessment after adjustments.

## Separate security funds

security_deposit is the current explicit172 book summary, with original book ID/version/frozen recording zone/model/time, event count and recorded received/refunded/reduced/held totals. The captured aggregate is checked against the book counters and version. No deposit events, methods, references, notes or retired requests are returned.

No book means recorded:false, version0 and totals:null. An exhausted recorded book remains recorded:true with held0. Neither case is inferred from legacy folio payments. financial_review_required means positive held funds on a Checked out or Cancelled reservation, counting no-show once. These funds are never subtracted from the account balance or treated as revenue/damage settlement. applied_to_account is always false for this feature.

Known security records may coexist with an unavailable account. completeness.account_amounts_available equals account.available and does not erase that independent deposit evidence.

## Limits, privacy and client preparation

The endpoint supports one reservation, at most1000 complete folio entries and at most1000 deposit events. It rejects excess instead of truncating. Pricing has up to four configured/legacy tax categories or one adjusted tax total and up to three named fees, with supported unique codes. Contact and scalar bounds retain the existing source contracts. Financial arithmetic uses exact numeric checks before integer JSON, with existing999999999999 component/gross caps and safe JSON integer protection. The final response is capped at2 MiB as defense in depth.

Invalid, inconsistent, oversized or truncated data blocks document export. This differs from a valid complete snapshot of unknown account amounts, which can show explicit null placeholders and a prominent warning. Ordinary HTML/formula-looking names are legitimate plain text: escape them rather than execute markup or invent new contact input restrictions.

Guest print defaults to property/stay identity. Saved contact and intended bill-to are separate temporary opt-ins, default off. Contact can include selected saved contact fields. Bill-to print is limited to saved legal name, company and postal address; bill-to email/phone are not included in this increment. No fallback to a newer reusable profile or guessed legal name/address is permitted.

Preview and print must derive from the same validated in-memory snapshot and narrowed privacy view. Preparing a print must not silently refetch unrelated newer components. Disable export after a failed refresh, scope/actor change or close. Do not persist contact data/print HTML in localStorage/sessionStorage, query strings, logs, analytics, filenames or document titles. Use generic document-type/date filenames. Hidden excluded fields must be absent from the print DOM. A local browser Print/Save as PDF action does not prove delivery or server issuance.

No signature field, consent checkbox, passport/ID, occupant registry, tax identifier, issuer number, due date, payment action or email/share action belongs in this release.

## Verification and deployment artifacts

Portable local scripts require PGLITE_DIST pointing to an installed @electric-sql/pglite/dist:

- scripts/verify-iratepilot-pms-guest-documents.mjs:14 core groups; actual SQL fixtures can be saved with GUEST_DOCUMENT_FIXTURE_PATH and results with GUEST_DOCUMENT_RESULT_PATH.
- scripts/verify-iratepilot-pms-guest-documents-independent.mjs:16 independent groups covering old catalog/data purity, role/scope, captured-data shape/privacy, unavailable/frozen values, target caps, itemization and single-capture source structure.
- scripts/verify-iratepilot-pms-guest-documents-rollback.mjs: exact saved preflight/install/transactional proof/shutdown, old identity/ACL/body/row preservation, all53 source fingerprints around document reads, full rollback snapshot and a proof mutation that performs a real read then returns empty JSON.
- scripts/build-iratepilot-pms-guest-documents-release.mjs: deterministic65-function/53-table-shape/29-prior-receipt preflight and atomic install generation. The selected profile retains ten observed service grants, including the existing folio grant; nine require mirroring in scratch because receive_reservation already grants service access in the local baseline. The broader read-only hosted inventory contains153 functions and30 service grants. The install does not alter any old ACL or broaden access. The profile records the observation timestamp and capture hash.

The rollback-only SQL creates fictional hotel/home setup in one new synthetic tenant using an existing confirmed test owner. It checks saved parties, frozen financial drift, separate deposits, pure repeated previews, privacy exclusions and denied role/scope access, forces deferred constraints and ends ROLLBACK. No existing user identity is changed and no real money moves.

The proof's rejection helper self-tests successful SQL, expected versus wrong SQLSTATE and SQL-NULL positive evidence. The local verifier also requires a deliberately empty document response to fail. A separate scratch-only committed copy of fixtures verifies shutdown.

The targeted shutdown revokes only the new guest_documents reader. Every existing guest, folio, deposit and operational API and source row remains installed; the verifier exercises the older readers afterward. No destructive data rollback is appropriate.

Native multi-session results and browser print/acceptance results are separate evidence with their own source hashes. PGlite tests do not prove contention, and a read-only compatibility preflight does not prove a hosted document operation. The parent release owner must review exact hashes and evidence before installation/publication.

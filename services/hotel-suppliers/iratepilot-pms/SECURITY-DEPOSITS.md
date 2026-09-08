# Refundable security-deposit register — migration172

This additive destination module records an operator's account of refundable security funds received and returned outside the PMS. Hotels and whole-home rentals use the same reservation-scoped register. It does not move money, authorize card holds, store card data, settle guest folios, recognize revenue, calculate tax or automatically resolve funds on cancellation or checkout.

The three event kinds are external receipt, linked external refund, and receipt-record reduction. A reduction corrects an overstated receipt record and explicitly asserts no refund or money movement. Each adjustment targets an earlier original receipt within the same scoped book. A refund method can differ from its receipt method. References can be shared batch or document references; they are not verified unique provider transactions.

For example, a 10000-cent external receipt followed by a 3000-cent external refund and a 1000-cent record reduction leaves 6000 cents recorded held. A further 6001-cent adjustment is rejected. An exhausted receipt remains visible with zero remainder, and an explicit zero-held book remains distinguishable from no book.

## Storage and arithmetic

The new private tables are:

- irp_pms.security_deposit_books: one explicit book per tenant/property/reservation; immutable currency, creation operating model and recording-zone context; monotonic version and cached gross counters.
- irp_pms.security_deposit_events: immutable receipt/refund/reduction events and original target, actor, request, timestamp, civil date and contiguous before/after versions.
- irp_pms.security_deposit_requests: immutable canonical command plus discriminated recorded receipt or nonfinancial retirement fence. Retired rows have no event/book linkage and cannot masquerade as recorded events.

No installation or read creates a book. An absent book returns book:null, version:0, totals:null, and empty history/receipt arrays. The first accepted external receipt creates version1. Every accepted financial event increments exactly once; replay and retirement do not increment it.

held_minor = received_minor - refunded_minor - reduced_minor. Each original receipt has its own corresponding nonnegative remainder. Deferred constraints require contiguous event versions, earlier same-book receipt targets, nonnegative historical prefixes, exact final counters, and an exact accepted request/event pair. The saved result must describe that event's historical prefix, not a later book state. Immutable guards prohibit event/request replacement and book identity rewriting. All deferred constraints must be forced before accepting a verification transaction.

Amounts are positive integer USD cents. Each event and each book's gross received/refunded/reduced totals are at most 999999999999 cents. Holding zero does not reset gross counters. A book supports up to 1000 events; exact old receipt recovery remains available at the limit. Private storage is RLS protected; application roles have no direct writes. Existing function definitions, owners and ACLs are retained.

## Public API

All names below have the prefix public.irp_pms_pilot_. Tenant, property, reservation and request values are UUIDs. Reads require current membership. Only current owner/manager may post or replay financial commands. A removed member cannot read or recover an old result; a downgraded member can still inspect their own receipt or retire their own command.

| Function | Arguments after tenant/property | Purpose |
|---|---|---|
| security_deposit | reservation | Complete current detail; no inferred book or financial writes |
| record_security_deposit | reservation, request, expected_version bigint, expected_recording_time_zone text, expected_recording_date date, kind text, amount_minor bigint, method text, reference text, reason text, target_event_id uuid, confirmed boolean | Record one financial event or recover the exact original recorded/retired outcome |
| security_deposit_request_status | request | Serialized actor-only found:false or exact saved outcome |
| retire_security_deposit_request | reservation, request, command jsonb, reason text | Recover an already accepted receipt or permanently fence the original unaccepted command |
| security_deposit_register | none | Current explicit books in all reservation statuses |
| security_deposit_activity | start date, end date | Complete events by stored recording civil date, end exclusive |

The exact canonical command has 11 keys: reservation_id, expected_version, expected_recording_time_zone, expected_recording_date, kind, amount_minor, method, reference, reason, target_event_id, confirmed.

Kind is external_receipt, external_refund or receipt_reduction. Method is cash, card, bank_transfer or other for receipt/refund and null for reduction. The target is null only for a receipt. Confirmation must be true. Reference is trimmed 4–200 characters; reason 4–500 characters; control characters are rejected. Unsupported/missing keys, malformed types, negative/noninteger values and incomplete context are rejected.

Accepted results use schema_version1 and outcome recorded, with scope, actor-bound request, immutable book/event snapshot, expected version, reviewed recording date/zone, explicit external-only/refundable-security purpose, and folio_changed:false, revenue_changed:false, replayed:false. Recovery returns the same saved receipt with replayed true. A retirement result instead has outcome retired, original canonical command, retirement reason/actor/time, and exact false financial/book-version/folio/revenue effect flags; it contains no event/book/totals.

Status returns only found:false for an absent or other-actor request. A found response includes action record_security_deposit or retire_security_deposit_request and the original saved result. Current list/detail state never substitutes for an immutable receipt.

## Locking, date review and uncertain requests

Financial commands take a tenant SHARE lock, property UPDATE lock, reservation UPDATE lock and existing book UPDATE lock, in that order. Membership is checked again after waits. Scope fences and the property lock serialize first-book creation, receipt/refund competition, exact duplicate requests and posting versus retirement. Status takes the same tenant/property fence in SHARE mode. Authorization is rechecked before returning historical data.

Structural command normalization precedes receipt lookup. Under locks, an exact prior recorded or retired request returns before later version, current date, zone or balance checks. A changed actor, reservation or payload cannot take over a request identity. A new stale book version returns PT409; a mismatched reviewed recording zone also returns PT409; a stale reviewed date returns PT412.

One server timestamp is captured after the locks and used both for reviewed-date comparison and stored event timestamp/date. The first receipt freezes the property's recording time zone. Subsequent events use that zone even if the property configuration changes. The stored civil date equals the recorded timestamp in that frozen zone, including DST repeated hours. No operator-provided backdated transaction or settlement date is accepted.

An uncertain pending command must retain its original actor, scope, request UUID and exact payload. A definite date/zone failure alone is not proof it can be discarded: another request may still be running. The deliberate “Stop retrying this request” operation persists a nonfinancial retirement fence. If posting already won, retirement returns the original receipt; if retirement wins, delayed posting returns the immutable retired outcome and records no event. Only the original actor may retire, with current membership. Repeating retirement requires the exact command and retirement reason. This works even when there is no book or its version has not advanced.

Without a server retirement fence, a client may discard its local marker only after first reading a current detail version greater than the pending expected version and then performing a serialized receipt lookup returning found:false. Those reads must be ordered, not parallel or reversed. Otherwise keep the command and use deliberate retirement. Do not invent a deposit event to escape a pending request.

Each new financial event adds exactly one activity row with action security_deposit_recorded, target reservation, and book/event/request/kind/amount/version plus external-only/refundable-security details. Each new retirement adds one security_deposit_request_retired activity row with request/purpose and false financial/book-version flags. Reads, replays and rejected commands add no audit row. Injected event/request/audit failures roll the entire operation back.

## Reports

The register includes only explicit books, including zero-held books and any current reservation status. It does not infer security deposits from old folio payments. financial_review_required is true exactly when held funds are positive and the current reservation status is Checked out or Cancelled. A no-show is represented as Cancelled with cancellation_kind no_show and counted once. Physical checkout and cancellation neither settle nor clear held funds.

Activity uses each event's stored recording civil date. A property can therefore have books with different frozen zones; current property-zone changes do not move old events between report dates. Current reservation labels may change; event evidence remains immutable. Net period activity is not the current held balance, and an empty period does not prove that no funds remain held. Retirement is an audit action, not a financial activity event.

The register supports 10000 complete books. Activity supports 10000 complete selected events in a 1–366-day range with exclusive end. Excess is rejected, never silently truncated. Gross totals and signed period effects must fit exact JSON integer range 9007199254740991 before monetary JSON is returned. These are bounded operational reports, not certified liability accounting, settlement, accounts receivable or tax reports.

## Installation, shutdown and verification

The release builder is scripts/build-iratepilot-pms-security-deposits-release.mjs. It requires the frozen 28 installed destination add-ons 142–147,149–156,158–171. Its read-only preflight pins 44 effective prior function definitions/grant profiles, 50 table column shapes and 28 prior migration receipts. It retains the eight previously observed legacy service-role EXECUTE grants; it does not grant new deposit access to service_role or anon.

The saved atomic install combines that preflight and exact new migration in a single transaction with one 172 receipt. Prior migration files are unchanged. The rollback-only proof uses one existing confirmed test owner solely within a new synthetic organization, public hotel/home zero-price stays, fictional receipt/refund/reduction values, both request-retirement orderings and exact count/reconciliation checks. It forces deferred constraints, checks that no folio/opening/charge snapshot was created and ends ROLLBACK. It is never a real transfer or a processor test.

The targeted shutdown revokes EXECUTE only from record_security_deposit. All four reads and nonfinancial own-request retirement remain available, including existing receipt recovery through status. Existing data, deposit guards/history, old folio APIs and hotel/home lifecycle remain installed. Shutdown is not data deletion or reverse migration. Do not run an unrestricted DROP, restore old readiness APIs or remove financial history as a rollback.

Portable local entry points require PGLITE_DIST pointing to an installed @electric-sql/pglite/dist:

- scripts/verify-iratepilot-pms-security-deposits.mjs: 27 passing core groups, including public home checkout interaction, DST, the complete 1000-event book, 10000-row report boundaries and safe-integer rejection fixtures; optional DEPOSIT_RESULT_PATH and DEPOSIT_SQL_FIXTURE_PATH.
- scripts/verify-iratepilot-pms-security-deposits-independent.mjs: 19 independent groups covering old catalog/data preservation, roles, retirement, immutable/deferred storage invariants and injected rollback failures; optional DEPOSIT_INDEPENDENT_RESULT.
- scripts/verify-iratepilot-pms-security-deposits-rollback.mjs: exact preflight/install/proof/shutdown, old OID/owner/ACL/body preservation, full PMS/auth/receipt rollback snapshot and proof self-tests; optional DEPOSIT_ROLLBACK_RESULT_PATH.

The local proof verifier also mutates the proof helper to perform a real post then return an empty JSON object: the proof must reject missing positive evidence. Its rejection helper separately proves that successful SQL cannot satisfy an expected P0001 and that wrong SQLSTATE values propagate. The local fixture SQL is solely for scratch test generation and is never part of installation.

The separate parent-owned native PostgreSQL 17.11 runner recorded 11 passing multi-session scenarios with 10 observed database lock waits against this migration's exact bytes. Those results are distinct from PGlite functional checks and from any hosted browser test. Passing local tests or a read-only hosted preflight does not establish a hosted financial write, production readiness or third-party payment integration.

## Deliberate remaining boundaries

This release has no card processor, payment authorization/capture, provider settlement reconciliation, refund execution, card data storage, deposit application to charges, damages workflow, cross-reservation transfer, booking prepayment classification, mistaken-refund correction or undo of record reduction. It has no issued invoice, legal receipt numbering or accounting export. Do not use a new receipt as a workaround for an erroneous refund. Those operations need separately designed evidence, authority, accounting and provider contracts.

# Payment record reviews and recorded activity —174

This additive increment lets hotel and whole-home operators classify an existing externally recorded folio payment or refund without changing the financial entry. Its report shows recording-period activity from guest folios and refundable-security registers as separate purposes. It does not verify a processor transaction, settlement, cash count, cashier session, invoice, tax treatment, due date, revenue or GL posting.

Existing142–173 migration files, financial tables, function bodies and access grants remain unchanged. Installation adds three empty private tables,18 private helpers/guards and five public functions; it performs no backfill. New foreign keys add the corresponding internal referential-integrity triggers on their referenced tables. The existing53 PMS tables become56.

## Operator contract

Only `external_payment` and `external_refund` folio entries accept a review. An owner or manager explicitly chooses `cash`, `card`, `bank_transfer`, `other` or `unknown` and one evidence basis:

- `external_record_reviewed`: known method and an evidence reference.
- `operator_report_only`: known method; an evidence reference is optional.
- `insufficient_evidence`: unknown method.

`other` requires a method description. Every accepted new request appends a revision, including an intentional repeated classification. No migration or read invents a review for an old entry. An unreviewed entry and an explicitly reviewed unknown entry are distinguishable. Refund methods are reviewed independently of their target payment. Corrections and security receipt reductions are not classified as tenders or external outflows.

References and reasons are plain text. New text rejects prohibited controls and enforces character/byte limits; this is not a sensitive-identifier detector. Operators must not enter payment-card numbers, credentials or bank-account numbers. No URL is fetched or interpreted as attachment/evidence. Response canonicalization follows PostgreSQL ASCII-space trimming, preserving otherwise valid non-control Unicode whitespace. Existing source text is retained exactly.

## APIs and authority

All five public functions start with `public.irp_pms_pilot_`:

| Function | Arguments after scope | Authority and outcome |
|---|---|---|
| `payment_record_review` | tenant, property, reservation, entry | Current member; complete current Detail, original source, ordered immutable history and current head. |
| `save_payment_record_review` | tenant, property, reservation, entry, request, expected_version, method, method_detail, evidence_basis, evidence_reference, reason, confirmed | Current owner/manager; immutable reviewed or previously retired result. |
| `payment_record_review_request_status` | tenant, property, request | Current member; original actor's stored reviewed/retired receipt or `found:false`. |
| `retire_payment_record_review_request` | tenant, property, reservation, entry, request, canonical command JSON, retirement reason | Current member, own request only; existing accepted receipt or durable retired outcome. |
| `cashier_activity_report` | tenant, property, start date, exclusive end date | Current member; one complete prepared recording-period report. |

UUIDs use full tenant/property/reservation/entry fences. Reads acquire tenant SHARE then property SHARE and recheck current membership. Writes acquire tenant SHARE, property UPDATE, then reservation, original folio entry and current review head in that order, and recheck current authority. Anonymous and service roles have no execution grant on these five new public functions. The three tables enable RLS, grant no application direct access, and grant service-role SELECT only. Private helpers have no application/service execution grants. Existing retained service grants are preserved exactly, rather than assumed absent.

The version is a metadata review revision, not a financial book version. No head means version0. Fresh stale saves reject with `PT409`; each new save must match the current version. There is no reviewed date/zone requirement because this increment never records money. A single timestamp captured after locks becomes the accepted event, request and audit time.

## Exact recovery and retirement

The canonical command contains reservation/entry IDs, expected version, method/detail, evidence basis/reference, reason and `confirmed:true`. Exact prior request lookup precedes current version/history capacity checks. A successful historical retry returns its original immutable result with `replayed:true`; it never returns a newer review as the old receipt. Status returns the stored `replayed:false` result. Different actors, scope or canonical commands cannot take over an existing request identity.

Save still requires current management authority even for a replay. A downgraded original actor can inspect their receipt through status or retirement; a removed member cannot. Retirement uses the same serialization fences: if save committed first it returns that immutable receipt; otherwise it stores a permanent actor/request/command fence. A delayed exact save returns the retired outcome, with no event/head/version/financial change. New retirement writes one audit row; exact duplicate retirement writes none and requires the same retained reason.

An uncertain browser command must not be discarded from ordinary current-state or error responses. A deliberate retirement action can resolve an equal-version or otherwise uncertain request without inventing another review. A tab that never attempted retirement may accept the exact validated retired outcome from another same-actor tab and show its server reason. Once a local retirement reason is retained, exact reason equality is required.

## Integrity and readable bounds

Heads store immutable creation context and point to their latest version. Review events and reviewed/retired request outcomes are immutable. Immediate guards enforce exact scoped source snapshots and append order. Deferred guards require contiguous history, exact current head, unchanged original source, canonical commands, and complete discriminated event/request/historical-result pairing. Public actions atomically add their one explicit metadata audit row; replay, read and rejection add none. Trusted raw pairing tests do not claim that the public audit relation is itself a deferred foreign-key constraint.

Fresh saves must preserve complete Detail readability before any write:

- Maximum1000 reviews per original entry.
- Canonical command4KiB; original source8KiB; immutable receipt16KiB.
- Entire projected history3MiB; complete Detail4MiB; reserved nonhistory envelope64KiB.
- Bounded property display name200 characters, source booking label128 and supported time-zone name100.

The source and historical result are validated rather than truncated. Replay/status/retirement remain available at history/version limits. Permitted later current-label growth fits within the reserved Detail envelope. Capacity errors are `P0001`; these ordinary errors do not constitute proof that an uncertain request can be discarded.

## Recording-period report

Detail and report each use one marked final relational capture after authorization fences; pure projection validates and constructs output only from those captured values. The report captures current reservation labels, source entries and targets, latest reviews with their paired receipts, deposit source/book context and current property configuration coherently.

The report carries each complete typed ledger row in its bounded materialized candidate set, so it does not read the same source row a second time. Related context uses scoped LEFT lateral lookups; a missing target, head, receipt or book remains visible to the validator. This changes query execution only: selection order, limits, source fields, output shape, duplicate checks and prefix arithmetic remain unchanged.

The selected period is1–366 civil days with an exclusive end. Both ledgers use the same absolute timestamp interval computed from the current property's zone, with each boundary converted independently across DST. Folio `created_at` and deposit `recorded_at` determine inclusion. The deposit's frozen recording zone/date are separately displayed evidence and are never reinterpreted as the period filter. Existing172 activity by stored civil date remains unchanged. A report prepared later can regroup old activity according to a later metadata review; the original financial timestamp never changes.

Every source row is identified by ledger, reservation and entry ID. Readable booking reference/source/status are current; guest names, contact/billing profiles, room details and guest notes are excluded. Original source references/reasons and review evidence are internal staff report data. They do not enter the existing173 guest document output. No report is automatically delivered to a guest or third party.

Per purpose, received minus refunded is the external-record effect; subtracting corrections/reductions gives the recorded-paid/held effect. Gross amounts, counts and method subtotals are separately validated within safe JSON integer bounds, so opposing flows cannot conceal a gross overflow. Method buckets are exactly cash/card/bank_transfer/other/unknown; reductions stay outside tender buckets. There is no combined monetary grand total, current-balance inference or external-transaction deduplication. Identical references in the two ledgers remain separate records.

The report allows at most10000 combined source rows and32MiB of complete output. More rows, oversized output, unsafe arithmetic, missing targets or inconsistent source/review context reject the report; no partial result is labeled complete. Narrowing the period may reduce report size. These are correctness limits, not a hosted performance guarantee.

## Reproducible verification

Set `PGLITE_DIST` to an installed local `@electric-sql/pglite/dist` directory. The scripts resolve all migration/release inputs from this checkout; no credentials or network are required.

```text
node scripts/verify-iratepilot-pms-payment-record-reviews.mjs
node scripts/verify-iratepilot-pms-payment-record-reviews-bounds.mjs
node scripts/verify-iratepilot-pms-payment-record-reviews-independent.mjs
node scripts/build-iratepilot-pms-payment-record-reviews-release.mjs
node scripts/verify-iratepilot-pms-payment-record-reviews-rollback.mjs
```

The core runner covers12 public API/role/purity/recording-period groups. The bounds runner includes those same12 plus five large history/row/byte/precision groups; do not count its repeated core checks twice. Independent checks cover catalog/old-row preservation, deferred malformed storage, privacy, captured-value mutation, source/target arithmetic, retirement, injected audit rollback and Unicode response parity. Separate result files pin exact migration hashes and counts.

For the final report capture correction, `PAYMENT_REVIEW_BOUNDS_SECTION=report` reruns12 core groups plus the three report row/byte/precision boundaries:15 actually executed checks. The two earlier history-cap checks are retained as evidence for byte-identical non-report functions, rather than counted as newly executed tests. The unchanged independent runner separately reruns25 groups. The fixture output can be written to a distinct path with `PAYMENT_REVIEW_FIXTURE_PATH`.

The large fixtures are local, fictional and always rolled back with constraints forced. Paired history fixtures keep integrity triggers enabled. The gross-overflow fixture deliberately exceeds the ordinary public folio aggregate cap using trusted scratch setup to test reader rejection. The bounds result reports construction/constraint and actual public report call times separately; these are one local PGlite run, not production load evidence. Native separate-session contention and captured-snapshot experiments are independently owned release evidence; these PGlite scripts make no concurrency claim.

The report correction also has separate native timing gates for complete10000-row and valid9007-row reports above28million SQL JSONB bytes. After fixture setup, each actual public report runs with an8-second server statement timeout matching the observed hosted authenticated-role limit; a timeout fails the test. Full response transport, exact purpose totals and all56 PMS/auth row fingerprints are checked. A separate representative population includes500 additional reviewed heads and a1000-version history with all integrity checks enabled. Setup time is reported separately. These local observations do not establish hosted load, sustained throughput or performance for every possible record distribution; some related lookup plans still use filtered scans.

The final51988 source passed21 separate native groups (19 exact-source scenarios and two distinctly instrumented snapshot experiments), with20 observed lock waits. Against that freshly installed local source, the complete10000-row report took2947ms after461ms setup; the9007-row report contained28,262,730 SQL JSONB bytes and took3169ms after555ms setup. Both timed calls used the8-second limit, performed no function replacement, and rolled back every fictional row. These results remain separate from hosted transactional proofs and retained browser acceptance.

The release validator mirrors only the observed retained old service grants in scratch, then checks exact read-only preflight, atomic install, all old row/catalog preservation, and the transaction-only proof. It requires rejection-helper self-tests, NULL-safe positive assertions and negative mutations for empty Detail and omitted hotel/home report rows. The proof creates a synthetic organization using an existing confirmed owner without editing that identity, performs fictional hotel/home source setup, then rolls back all fixtures. A separate disposable scratch commit is used only to verify shutdown semantics.

## Release and pause policy

`preflights/202609070174_iratepilot_pms_payment_record_reviews.sql` pins72 effective173 function definitions/grants,53 table column shapes and30 prerequisite receipts. The profile retains eleven selected service grants; ten differ from plain local migration defaults. It derives the previous65-function observed subset, five newly installed173 function ACLs and the two directly checked dependencies (`post_folio`, `report_exact_numbers`) from the recorded hosted grant inventory. No install changes any old grant.

The atomic `.install.sql` embeds that preflight, the exact migration body and one migration receipt, then reloads the API schema. Root owns installation and hosted transaction-only verification. Local passing evidence is not a hosted result or publication claim.

The targeted `.shutdown.sql` revokes execution only from `save_payment_record_review`. It preserves current Detail/report, original-actor request lookup, request retirement and all existing financial/173 functions. It deletes no history, restores no older financial behavior and does not undo accepted classifications. During a pause, exact recovery uses status/retirement because the save function itself is unavailable. Re-enabling saves requires the same reviewed174 function and its intended authenticated execution grant; dropping the new tables or rewriting stored reviews is not the shutdown procedure.

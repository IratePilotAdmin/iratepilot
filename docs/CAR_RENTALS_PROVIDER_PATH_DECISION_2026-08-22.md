# Car Rentals Provider-Path Sequencing Decision

Prepared: August 22, 2026

Mode: **local documentation only**

Decision ID: `cars-provider-path-decision-2026-08-22-01`

Status: **the phased-diligence source and accepted Preview remain published at their recorded identities, and the subsequent aggregator-only commercial-diligence decision package is committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`; the current repository-verified local source/UI reconciliation records Carnect for Aggregator Stage 1 only, with Sabre at 0 of 10, Travelport at 0 of 10, and Aggregator at 1 of 10, but remains uncommitted, undeployed, and unaccepted; the accepted Preview remains historically 0 of 10 for every track, runtime binding remains unbound, formal recommendation remains `not_issued`, all 29 conditions and all sole-owner conflicts remain unresolved, Stage 2 contact remains unauthorized, 0 of 3 connectors are live, and both traffic kill switches remain engaged**

## Decision authority and provenance

This record answers the neutral question in `docs/CAR_RENTALS_PROVIDER_DECISION_REVIEW_PACKET_2026-08-22.md` under the separately authorized Executive + Product decision boundary. The decision is based only on the completed seven-gate local review packet and the published 3-of-3 public research artifact at commit `afed6471ed199cef60f317168dda2104f4fa20a3`.

The owner made this direct phased-diligence decision without a formal score or recommendation. No independent approval is claimed. The previously recorded sole-owner role concentration, lack of independent approvers, and lack of separation of duties remain unresolved. This record does not represent legal advice, independent legal review, provider confirmation, or acceptance of any risk, term, eligibility condition, or capability claim.

## Recorded phased diligence decision

| Path | Local diligence disposition | Exact boundary |
| --- | --- | --- |
| Carnect | **Named primary aggregator diligence path** | Carnect is the first aggregator path designated for future internal diligence. This is not a supplier contract, account, entitlement, credential, sandbox connection, runtime connector binding, or authority to contact Carnect. |
| Sabre | **Secondary enterprise diligence path** | Sabre is retained as the secondary enterprise path for future internal diligence. This does not establish entitlement, contracted capability, economics, certification access, support, or authority to contact Sabre. |
| Travelport | **Conditional hold** | No active diligence or contact may proceed unless written Core Category eligibility is obtained or an approved exception is documented under later, separately authorized gates. The eligibility condition is not satisfied, waived, or overridden here. |
| CarTrawler | **Unselected decision alternative** | Retained in its frozen Gate 3 classification as a public-research diligence-priority candidate; not selected, recommended, bound, or authorized for contact. |
| Booking.com Demand API | **Unselected decision alternative** | Retained in its frozen Gate 3 classification as a public-research diligence-priority candidate; not selected, recommended, bound, or authorized for contact. |
| EconomyBookings | **Unselected decision alternative** | Retained in its frozen Gate 3 classification as a public-research alternate; not selected, recommended, bound, or authorized for contact. |
| DiscoverCars | **Unselected decision alternative** | Retained in its frozen Gate 3 classification as a public-research alternate; not selected, recommended, bound, or authorized for contact. |

“Primary” and “secondary” describe only the intended sequence of future diligence. They are not formal scores, provider rankings, commercial awards, contracted supplier selections, traffic priorities, or Production routing decisions.

## Answer to the neutral decision question

The selected Gate 2 option is a **phased multi-path approach**:

1. Preserve Carnect as the named primary aggregator diligence path.
2. Preserve Sabre as the secondary enterprise diligence path.
3. Keep Travelport on conditional hold until written Core Category eligibility or an approved exception exists.
4. Retain CarTrawler, Booking.com Demand API, EconomyBookings, and DiscoverCars as unselected alternatives under this decision without changing their frozen Gate 3 research classifications.

The neutral question is answered only at the local business-documentation layer. No formal recommendation was issued because the owner made the decision directly. The decision does not resolve any of the 29 classified conditions and does not cure any sole-owner governance conflict.

## Local source-model and Preview boundary

When first recorded, this decision was documentation-only and did not alter `lib/cars/connector-activation-readiness.ts`, application code, tests, fixtures, migrations, environment or deployment configuration, or the accepted isolated Preview. Under the later, separately approved local source-model reconciliation, `lib/cars/connector-activation-readiness.ts` now contains a distinct `provider_path_sequencing_local_only` record for this exact decision. That local record is not a commercial provider selection, activation provider-decision record, runtime connector binding, completed activation stage, deployment, or Preview acceptance.

At the accepted provider-path sequencing milestone, the separate sequencing record preserved this historical activation and Preview state:

- activation-readiness `providerDecisionState`: `separate_decision_required`
- activation-readiness `providerDecisionRecorded`: false
- commercial provider selection state: `not_recorded`
- selected provider: false; `selectedProviderId`: null
- runtime provider binding: `unbound`; binding value: null
- generic aggregator connector: `provider-unselected`
- earlier accepted Preview internal review display at `99da51796f10a2c55ba77b18cd3f709d67a3fbf7`: historical 0 of 7
- current accepted Preview internal review display at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`: 7 of 7, with the phased diligence sequence visible
- activation stage 1: incomplete; completed activation stages: 0
- Sabre activation: 0 of 10
- Travelport activation: 0 of 10
- Aggregator activation: 0 of 10
- Live connectors: 0 of 3
- Application traffic kill switch: engaged
- Database traffic kill switch: engaged

The source record represents only the approved diligence sequence. It cannot be treated as a formal recommendation, commercial provider selection, runtime selection, connector binding, resolved condition or conflict, or completed activation stage. Its separately authorized isolated Preview deployment and acceptance make the read-only state visible without granting provider, transaction, Production-promotion, or other external authority.

After that source and Preview milestone, the owner made a distinct aggregator-only Stage 1 decision in `docs/CAR_RENTALS_ACTIVATION_STAGE_1_AGGREGATOR_PROVIDER_DECISION_2026-08-22.md`: Carnect is selected for commercial diligence only. That decision package is committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`.

A later local source/UI reconciliation now records commercial-diligence selection as `recorded`, identifies Carnect for the aggregator-only scope, sets aggregator `providerDecisionRecorded` and Stage 1 complete to true, and records only Aggregator `provider_decision` as complete. Its local source counters are Sabre 0 of 10, Travelport 0 of 10, and Aggregator 1 of 10. It remains uncommitted, undeployed, and unaccepted and does not rewrite the accepted Preview snapshot above, which remains 0 of 10 for every track. Sabre remains an unselected secondary enterprise candidate, Travelport remains on conditional hold, and the generic runtime connector remains unbound.

## Unresolved conditions preserved

- All 29 conditions in the review packet remain unresolved: 12 are `unresolved_blocking` and 17 are `later_provider_verification_required`.
- All sole-owner governance conflicts remain unresolved; no independent reviewer, recusal, delegation, separation of duties, mitigation, waiver, or conflict resolution is created.
- Carnect commercial access, SOAP adapter work, credentials, IP allowlisting, and backend/frontend certification remain required.
- Sabre entitlement, economics, contracted geography and brands, current operation access, certification scope, and support remain unverified.
- Travelport written Core Category eligibility or an approved exception remains an unsatisfied hard stop; its SOAP/XML technical review, contract, provisioning, credentials, and certification also remain pending.
- Every unselected decision alternative remains public-research-only. CarTrawler and Booking.com Demand API retain their frozen diligence-priority research classification; EconomyBookings and DiscoverCars retain their frozen research-alternate classification.

## Authority snapshot

- Local phased diligence decision: recorded
- Subsequent aggregator Stage 1 decision package: Carnect selected for commercial diligence only; committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`
- Separate source representation and validator hardening: implemented, verified, committed, and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`; accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`
- Preview evidence record: `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md`, committed and privately published with the five current-state documentation reconciliations at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43`
- Formal recommendation: `not_issued`
- Local source commercial-diligence selection: `recorded`; Carnect for the aggregator-only scope
- Contracted provider: none
- Runtime provider binding: unbound
- Local source activation provider decision: true for Aggregator only
- Local source activation Stage 1: complete for Aggregator only; Sabre 0 of 10, Travelport 0 of 10, Aggregator 1 of 10
- Accepted Preview activation: provider decision false, selected provider null, Stage 1 incomplete, and all three tracks 0 of 10
- Classified conditions: 29 unresolved; 12 `unresolved_blocking` and 17 `later_provider_verification_required`
- Sole-owner conflicts: unresolved; independent approval and separation of duties remain absent
- Stage 2 provider-contact authorization: false
- Provider contact made: 0
- Supplier messages, forms, calls, or applications: 0
- Contracts or accepted provider terms: 0
- Provider accounts: 0
- Credentials or endpoints: 0
- Sandbox connections or certifications: 0
- External provider requests: 0
- Reservations, changes, cancellations, or refunds: 0
- Payments or money movement: 0
- Migrations: 0
- Provider/runtime deployments or Production promotions: 0
- Provider-path sequencing isolated Preview release: 1 accepted deployment
- Current source/UI reconciliation release state: repository-verified locally; uncommitted, unpushed, undeployed, and unaccepted
- Live connectors: 0 of 3
- Application traffic kill switch: engaged
- Database traffic kill switch: engaged
- Production changes or authority: 0

## Next approval boundary

The hardened source is verified with 33 focused safety tests, ESLint, TypeScript, the full 1,275-test suite across 262 files, and the optimized 115-page Next.js build. Commit `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` is privately published and accepted at `/admin/cars` in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`. The evidence record and five current-state documentation reconciliations were then committed and privately published at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43` without redeployment or repeat browser acceptance. Within that historical accepted source and Preview, all 29 conditions, all sole-owner conflicts, every external provider-authority flag, the zero activation counters, and both engaged traffic kill switches remained unchanged.

The subsequent aggregator-only Stage 1 decision artifact and its six-document package were committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`. That documentation publication created no source, Preview, provider, transaction, deployment, or Production authority.

The exact Carnect commercial-diligence decision is now represented and repository-verified in the current local source/UI with Aggregator at 1 of 10: 42 focused tests pass in the primary provider-decision/activation suite, 55 pass across the three directly affected Car Rentals suites, full ESLint passes, TypeScript passes, the full suite passes 1,284 tests across 262 files, and the optimized build generates 115 pages. The reconciliation remains uncommitted, unpushed, undeployed, and unaccepted. Commit and private publication, isolated Preview deployment, and authenticated Preview acceptance require separate later approvals and evidence. The accepted Preview remains 0 of 10 for all three tracks, runtime binding remains unbound, and Stage 2 provider-contact authorization remains a separate later decision. No contact, account, credential, sandbox or external traffic, transaction, deployment, or Production action is authorized.

# Car Rentals Provider-Path Sequencing Decision

Prepared: August 22, 2026

Mode: **local documentation only**

Decision ID: `cars-provider-path-decision-2026-08-22-01`

Status: **owner decision recorded for phased provider diligence and now represented in a separate fail-closed source record committed and privately published at `e03b1a1438a8d5ee2cf7a1769c43227e73068af4`; post-publication validator hardening is implemented and verified locally but remains uncommitted and unpublished; Carnect is the named primary aggregator diligence path, Sabre is the secondary enterprise diligence path, and Travelport is on conditional hold pending written Core Category eligibility or an approved exception; formal recommendation remains `not_issued`, all 29 conditions and all sole-owner conflicts remain unresolved, no provider contact or external authority is created, the activation record remains provider-unselected with stage 1 incomplete, and neither source state has been deployed or accepted in Preview**

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

The separate local sequencing record preserves the existing activation and accepted-Preview state:

- activation-readiness `providerDecisionState`: `separate_decision_required`
- activation-readiness `providerDecisionRecorded`: false
- commercial provider selection state: `not_recorded`
- selected provider: false; `selectedProviderId`: null
- runtime provider binding: `unbound`; binding value: null
- generic aggregator connector: `provider-unselected`
- accepted Preview internal review display: historical 0 of 7
- activation stage 1: incomplete; completed activation stages: 0
- Sabre activation: 0 of 10
- Travelport activation: 0 of 10
- Aggregator activation: 0 of 10
- Live connectors: 0 of 3
- Application traffic kill switch: engaged
- Database traffic kill switch: engaged

The source record represents only the approved diligence sequence. It cannot be treated as a formal recommendation, commercial provider selection, runtime selection, connector binding, resolved condition or conflict, or completed activation stage. Its implementation and private publication do not change the accepted Preview and grant no deployment or external authority.

## Unresolved conditions preserved

- All 29 conditions in the review packet remain unresolved: 12 are `unresolved_blocking` and 17 are `later_provider_verification_required`.
- All sole-owner governance conflicts remain unresolved; no independent reviewer, recusal, delegation, separation of duties, mitigation, waiver, or conflict resolution is created.
- Carnect commercial access, SOAP adapter work, credentials, IP allowlisting, and backend/frontend certification remain required.
- Sabre entitlement, economics, contracted geography and brands, current operation access, certification scope, and support remain unverified.
- Travelport written Core Category eligibility or an approved exception remains an unsatisfied hard stop; its SOAP/XML technical review, contract, provisioning, credentials, and certification also remain pending.
- Every unselected decision alternative remains public-research-only. CarTrawler and Booking.com Demand API retain their frozen diligence-priority research classification; EconomyBookings and DiscoverCars retain their frozen research-alternate classification.

## Authority snapshot

- Local phased diligence decision: recorded
- Separate source representation: implemented, committed, and privately published at `e03b1a1438a8d5ee2cf7a1769c43227e73068af4`; not deployed or accepted in Preview
- Post-publication validator hardening: implemented and verified locally; not committed, published, deployed, or accepted in Preview
- Formal recommendation: `not_issued`
- Commercial provider selection: `not_recorded`
- Selected provider: none
- Runtime provider binding: unbound
- Activation provider decision recorded: false
- Activation stage 1 complete: false
- Classified conditions: 29 unresolved; 12 `unresolved_blocking` and 17 `later_provider_verification_required`
- Sole-owner conflicts: unresolved; independent approval and separation of duties remain absent
- Provider contact authorization: false
- Supplier messages, forms, calls, or applications: 0
- Contracts or accepted provider terms: 0
- Provider accounts: 0
- Credentials or endpoints: 0
- Sandbox connections or certifications: 0
- External provider requests: 0
- Reservations, changes, cancellations, or refunds: 0
- Payments or money movement: 0
- Migrations: 0
- Deployments or promotions: 0
- Production changes or authority: 0

## Next approval boundary

The current source model and post-publication hardening are verified with 33 focused safety tests, ESLint, TypeScript, the full 1,275-test suite across 262 files, and the optimized 115-page Next.js build. All 29 conditions, all sole-owner conflicts, every false authority flag, the zero activation counters, and both engaged traffic kill switches remain unchanged. Commit `e03b1a1438a8d5ee2cf7a1769c43227e73068af4` is privately published; the hardening remains local and uncommitted. The next safe gate is a separately approved commit and normal private-branch push of the two hardening files and five reconciled documents; isolated Preview deployment and authenticated `/admin/cars` acceptance remain later release gates, and provider contact remains a later, separately scoped authorization.

The baseline source-model implementation and five earlier reconciled documents are committed and privately published at `e03b1a1438a8d5ee2cf7a1769c43227e73068af4`. The current validator hardening and release-state reconciliation remain local and uncommitted. No deployment or Preview acceptance is claimed.

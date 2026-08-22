# Car Rentals Provider-Path Sequencing Decision

Prepared: August 22, 2026

Mode: **local documentation only**

Decision ID: `cars-provider-path-decision-2026-08-22-01`

Status: **owner decision recorded locally for phased provider diligence; Carnect is the named primary aggregator diligence path, Sabre is the secondary enterprise diligence path, and Travelport is on conditional hold pending written Core Category eligibility or an approved exception; no provider contact or external authority is created, and the committed activation model and accepted Preview remain unchanged**

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

## Source-model and Preview reconciliation boundary

This documentation-only decision does not alter `lib/cars/connector-activation-readiness.ts`, application code, tests, fixtures, migrations, environment or deployment configuration, or the accepted isolated Preview.

Therefore the existing technical records remain unchanged until a separately approved source-model reconciliation:

- committed `providerDecisionState`: `separate_decision_required`
- committed `providerDecisionRecorded`: false
- committed `selectedProviderId`: null
- committed generic aggregator connector: `provider-unselected`
- accepted Preview internal review display: historical 0 of 7
- committed and Preview activation stage 1: incomplete
- Sabre activation: 0 of 10
- Travelport activation: 0 of 10
- Aggregator activation: 0 of 10
- Live connectors: 0 of 3
- Application traffic kill switch: engaged
- Database traffic kill switch: engaged

The local decision may not be represented as a runtime selection or completed activation stage until that source-model reconciliation is separately authorized, implemented, verified, and released through its own gates.

## Unresolved conditions preserved

- All 29 conditions in the review packet remain unresolved: 12 are `unresolved_blocking` and 17 are `later_provider_verification_required`.
- All sole-owner governance conflicts remain unresolved; no independent reviewer, recusal, delegation, separation of duties, mitigation, waiver, or conflict resolution is created.
- Carnect commercial access, SOAP adapter work, credentials, IP allowlisting, and backend/frontend certification remain required.
- Sabre entitlement, economics, contracted geography and brands, current operation access, certification scope, and support remain unverified.
- Travelport written Core Category eligibility or an approved exception remains an unsatisfied hard stop; its SOAP/XML technical review, contract, provisioning, credentials, and certification also remain pending.
- Every unselected decision alternative remains public-research-only. CarTrawler and Booking.com Demand API retain their frozen diligence-priority research classification; EconomyBookings and DiscoverCars retain their frozen research-alternate classification.

## Authority snapshot

- Local phased diligence decision: recorded
- Formal recommendation: `not_issued`
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

The next safe gate is a local source-model reconciliation that can represent this phased diligence decision without creating contact or transaction authority. That gate would require separate approval and must keep both traffic kill switches engaged. Provider contact remains a later, separately scoped authorization after the decision is truthfully represented and verified.

This decision record remains local and uncommitted until a separate commit-and-publication authorization is given.

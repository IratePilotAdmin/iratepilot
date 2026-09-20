# Car Rentals Activation Stage 1 — Aggregator Commercial-Diligence Provider Decision

Recorded: August 22, 2026

Mode: **published documentation decision with a later local source/UI reconciliation**

Decision ID: `cars-aggregator-stage-1-provider-decision-2026-08-22-01`

Status: **the aggregator-only commercial-diligence decision package is committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`; the source/UI reconciliation records Carnect for aggregator Stage 1 only, with Sabre at 0 of 10, Travelport at 0 of 10, and Aggregator at 1 of 10, and is repository-verified, committed, and privately published at `87f53acc7314eba0d97163b0e37464548c7e8a25` but remains undeployed and unaccepted; the accepted Preview remains the historical 0 of 10 for every connector, runtime binding remains unbound, 0 of 3 connectors are live, all 29 conditions and all sole-owner conflicts remain unresolved, Stage 2 contact remains unauthorized, and both traffic kill switches remain engaged**

## Approved decision

- Connector track: aggregator.
- Documentation-layer commercial-diligence provider: Carnect.
- Decision owner boundary: Executive + Product under the owner's explicit instruction.
- Sabre remains an unselected secondary enterprise candidate.
- Travelport remains on conditional hold pending written Core Category eligibility or an approved exception.
- CarTrawler, Booking.com Demand API, EconomyBookings, and DiscoverCars remain unselected alternatives with their recorded research classifications unchanged.
- This direct owner decision is not a formal recommendation, contracted selection, runtime provider binding, supplier approval, or authorization to contact Carnect.

## Local source and accepted Preview boundary

The decision artifact and its six documentation reconciliations are committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`. A later, separately approved source/UI reconciliation represents this exact aggregator-only decision in `lib/cars/connector-activation-readiness.ts` and the read-only `/admin/cars` workspace. That reconciliation is repository-verified, committed, and privately published at `87f53acc7314eba0d97163b0e37464548c7e8a25` but remains undeployed and unaccepted; it does not change the accepted isolated Preview.

Current local source state:

- commercial-diligence selection state is `recorded`, with Carnect identified only for `aggregator_commercial_diligence_only`;
- aggregator activation `providerDecisionRecorded` is true and aggregator activation Stage 1 is complete;
- the only completed activation stage is Aggregator `provider_decision`;
- Sabre remains at 0 of 10, Travelport remains at 0 of 10, and Aggregator is at 1 of 10;
- the generic aggregator connector remains `provider-unselected`;
- runtime provider binding remains `unbound` with a null binding value;
- 0 of 3 connectors are live; and
- both application and database traffic kill switches remain engaged.

Accepted Preview state at source commit `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` remains unchanged: provider decision false, provider selected false, selected provider null, activation Stage 1 incomplete, Sabre 0 of 10, Travelport 0 of 10, Aggregator 0 of 10, and 0 of 3 connectors live. The local Aggregator 1-of-10 source state must not be represented as deployed or accepted before a separate release and authenticated Preview acceptance.

## Unresolved conditions and governance

- All 29 classified conditions remain unresolved: 12 `unresolved_blocking` and 17 `later_provider_verification_required`.
- `ALL-01` remains open because contact authorization, commercial/legal approval, an organization account, credentials, sandbox access, certification, operational acceptance, and all later activation prerequisites remain absent; the accepted Preview also has not accepted the local Stage 1 reconciliation.
- `AGG-01` remains open because the generic connector remains `provider-unselected` and unbound at runtime; a commercial-diligence selection does not create runtime binding.
- `AGG-02` remains open because this direct owner decision must not be inferred from the earlier diligence ordering or treated as independent review.
- `TRAVELPORT-01` remains open and Travelport remains on conditional hold.
- `OWNERS-01` and `CONFLICT-01` through `CONFLICT-03` remain unresolved.
- No independent approver, separation of duties, recusal, delegation, mitigation, waiver, risk acceptance, or conflict resolution is claimed.

## External-authority boundary

Provider contact authorization remains Stage 2, is false in the current local source, and is not granted by this decision or reconciliation. No message, form, call, application, contract, account, credential, endpoint, sandbox connection, external provider request, live inventory, reservation, change, cancellation, refund, payment, migration, deployment, Production promotion, or Production change is authorized or performed.

## Next approval boundary

The source/UI reconciliation is repository-verified: 42 focused provider-decision and activation-safety tests pass in the primary suite, 55 tests pass across the three directly affected Car Rentals suites, full ESLint passes, TypeScript passes with no emitted files, the full repository suite passes 1,284 tests across 262 files, and the optimized Next.js build generates 115 pages including static `/admin/cars`. It is committed and privately published at `87f53acc7314eba0d97163b0e37464548c7e8a25` but remains undeployed and unaccepted. Isolated Preview deployment and authenticated Preview acceptance each require their own later approval and evidence. Stage 2 provider-contact authorization remains a later, separate decision and cannot be inferred from Aggregator Stage 1 completion.

# Car Rentals Activation Stage 1 — Aggregator Commercial-Diligence Provider Decision

Recorded: August 22, 2026

Mode: **local documentation only**

Decision ID: `cars-aggregator-stage-1-provider-decision-2026-08-22-01`

Status: **Carnect is selected only as the aggregator track's commercial-diligence provider at the documentation layer; canonical source and accepted Preview state remain unreconciled and fail-closed at 0 of 10 stages for every connector and 0 of 3 live**

## Approved decision

- Connector track: aggregator.
- Documentation-layer commercial-diligence provider: Carnect.
- Decision owner boundary: Executive + Product under the owner's explicit instruction.
- Sabre remains an unselected secondary enterprise candidate.
- Travelport remains on conditional hold pending written Core Category eligibility or an approved exception.
- CarTrawler, Booking.com Demand API, EconomyBookings, and DiscoverCars remain unselected alternatives with their recorded research classifications unchanged.
- This direct owner decision is not a formal recommendation, contracted selection, runtime provider binding, supplier approval, or authorization to contact Carnect.

## Canonical source and Preview boundary

This decision is documentation-only. It does not change `lib/cars/connector-activation-readiness.ts`, application code, tests, fixtures, migrations, environment or deployment configuration, the published source, or the accepted isolated Preview.

Until a later, separately approved source-model reconciliation:

- commercial provider selection state remains `not_recorded` in the canonical source;
- `providerSelected` remains false and `selectedProviderId` remains null;
- activation-readiness `providerDecisionRecorded` remains false;
- the generic aggregator connector remains `provider-unselected`;
- runtime provider binding remains `unbound` with a null binding value;
- activation Stage 1 remains incomplete in source and Preview;
- Sabre, Travelport, and Aggregator each remain at 0 of 10 activation stages;
- 0 of 3 connectors are live; and
- both application and database traffic kill switches remain engaged.

The documentation decision must not be represented as canonical activation completion before that separate reconciliation is implemented, verified, released, and accepted under its own approvals.

## Unresolved conditions and governance

- All 29 classified conditions remain unresolved: 12 `unresolved_blocking` and 17 `later_provider_verification_required`.
- `ALL-01` remains open because canonical connector-specific provider-decision evidence is not yet reconciled.
- `AGG-01` remains open because the generic connector is not yet bound in canonical source or runtime.
- `AGG-02` remains open because this direct owner decision must not be inferred from the earlier diligence ordering or treated as independent review.
- `TRAVELPORT-01` remains open and Travelport remains on conditional hold.
- `OWNERS-01` and `CONFLICT-01` through `CONFLICT-03` remain unresolved.
- No independent approver, separation of duties, recusal, delegation, mitigation, waiver, risk acceptance, or conflict resolution is claimed.

## External-authority boundary

Provider contact authorization remains Stage 2 and is not granted by this decision. No message, form, call, application, contract, account, credential, endpoint, sandbox connection, external provider request, live inventory, reservation, change, cancellation, refund, payment, migration, deployment, Production promotion, or Production change is authorized or performed.

## Next approval boundary

The next safe gate is a separately approved local source-model reconciliation for this aggregator-scoped documentation decision. That later gate may represent the decision in a distinct fail-closed source record while keeping runtime binding unbound, every external-authority flag false, both kill switches engaged, and the accepted Preview unchanged until a separate release approval. Stage 2 provider-contact authorization remains later and separate.

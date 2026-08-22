# iRatePilot Car Rentals — Live Connector Activation Readiness

Prepared: August 21, 2026

Reconciled: August 22, 2026

Status: **the earlier readiness and hardened provider-path sequencing sources are published and accepted in isolated Preview; public research is recorded for 3 of 3 paths and the local review packet is 7 of 7; the aggregator-only commercial-diligence decision package is privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`; the current repository-verified local source/UI reconciliation records Carnect for aggregator Stage 1 only, with Sabre at 0 of 10, Travelport at 0 of 10, and Aggregator at 1 of 10, but remains uncommitted, undeployed, and unaccepted; the accepted Preview remains historically 0 of 10 for every connector, runtime binding remains unbound, formal recommendation remains unissued, all 29 conditions and all sole-owner conflicts remain unresolved, Stage 2 contact is unauthorized, 0 of 3 connectors are live, and both traffic kill switches remain engaged**

## Objective

Start the live-connector activation program for Sabre, Travelport, and one future aggregator by making every real activation dependency visible and assigning its canonical functional owner label. Those labels do not prove separately staffed roles, independent review, or separation of duties. This milestone adds a read-only control layer. The software cannot contact a provider, create an account, accept credentials, connect to a sandbox, enable traffic, create or service a reservation, move money, migrate data, deploy itself, or change Production. Its separately authorized isolated Preview deployments are recorded below and do not grant any external or Production authority.

## Current connector position

| Connector | Public research | Provider decision | Contracted capability | Account | Sandbox | Connection | Live |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sabre | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Travelport | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Aggregator (runtime provider unselected) | Shortlist recorded | Carnect recorded locally for commercial diligence only; accepted Preview unchanged | Not verified | Not created | Not connected | Disabled | No |

Public research is complete for the three controlled paths. Sabre has a technical-secondary disposition based on official public evidence. Travelport remains a conditional enterprise candidate because written Core Category eligibility or an exception is still required. The aggregator research inventory records Carnect, CarTrawler, and Booking.com Demand as priority candidates, with EconomyBookings and DiscoverCars retained as alternates. These are research dispositions only—not formal scores, recommendations, selections, contracted capabilities, or provider authority.

The table above reports activation readiness, not a contracted or runtime provider selection. The phased-diligence decision names Carnect as the primary aggregator diligence path, Sabre as the secondary enterprise diligence path, and Travelport as conditional hold; it retains CarTrawler, Booking.com Demand API, EconomyBookings, and DiscoverCars as unselected alternatives while preserving their frozen Gate 3 research classifications. A separately approved source-model reconciliation represents this exact sequence in a distinct `provider_path_sequencing_local_only` record. It does not record a commercial provider selection, change `providerDecisionRecorded`, select or bind the aggregator, complete activation stage 1, or change the table. The hardened representation is committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` and accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`.

A later, separately authorized aggregator Stage 1 decision selects Carnect as the aggregator track's commercial-diligence provider only. Its decision package is committed and privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`. The current local source/UI reconciliation records that decision as Aggregator Stage 1 complete and Aggregator 1 of 10 while keeping Sabre and Travelport at 0 of 10. It is repository-verified but remains uncommitted, unpushed, undeployed, and unaccepted; it does not change the accepted Preview, runtime binding, unresolved conditions or conflicts, or external authority.

## Internal provider-decision readiness

- Public research recorded: 3 of 3 paths.
- Local internal readiness checks completed: 7 of 7; local state is `ready_for_internal_decision` and `decision_packet_ready` is true.
- Earlier accepted Preview display: historical 0 of 7 at `99da51796f10a2c55ba77b18cd3f709d67a3fbf7`; the local Gates 1 through 7 reviews themselves did not change that release.
- Current accepted Preview display: 7 of 7 at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`, with the phased diligence sequence visible.
- Formal recommendation issued: no.
- Local phased-diligence decision recorded: yes, in `docs/CAR_RENTALS_PROVIDER_PATH_DECISION_2026-08-22.md`.
- Separate provider-path sequencing source record and validator hardening: implemented and verified in `lib/cars/connector-activation-readiness.ts`, committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`, and accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`.
- Preview evidence record: `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md`, committed and privately published with the five current-state documentation reconciliations at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43`.
- Local source commercial-diligence selection: `recorded`; Carnect selected for `aggregator_commercial_diligence_only`; formal recommendation remains `not_issued` and no contracted provider exists.
- Local source activation: aggregator `providerDecisionRecorded` true and Stage 1 complete; Sabre 0 of 10, Travelport 0 of 10, Aggregator 1 of 10.
- Accepted Preview activation at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`: provider decision false, provider selected false, `selectedProviderId` null, Stage 1 incomplete, and all three tracks 0 of 10.
- Runtime provider binding state: `unbound`; binding value: null; generic aggregator remains `provider-unselected`.
- Live connectors: 0 of 3.
- Stage 2 provider-contact authorization: false.
- Current source/UI reconciliation release state: repository-verified locally; uncommitted, unpushed, undeployed, and unaccepted.

The seven internal checks reconcile the research artifact, define the decision question, freeze one candidate scope, acknowledge public-evidence limitations, review material unknowns and hard stops, review functional owners and conflicts, and acknowledge the separate provider-decision boundary. Completing all seven makes only an internal review packet ready. It cannot issue a recommendation, select a provider, complete activation stage 1, or authorize an external action.

The validator includes one explicitly marked `offline_fixture` with all seven gates represented for synthetic safety testing only. It is not actual review evidence and does not satisfy any gate. The separately authorized local Gate 1 reconciliation, Gate 2 neutral-question definition, Gate 3 one-cycle candidate-scope freeze, Gate 4 internal owner acknowledgement, Gate 5 fail-closed condition review, Gate 6 sole-owner conflict review, and Gate 7 separate-decision boundary acknowledgement recorded below are the sole basis for the current 7-of-7 documentation count.

## Local verification

- Current local Stage 1 reconciliation: 42 focused provider-decision and activation-safety tests pass in the primary suite; 55 tests pass across the three directly affected Car Rentals suites.
- Full ESLint passes.
- TypeScript passes with no emitted files.
- The full repository suite passes: 1,284 tests across 262 files.
- The optimized Next.js build passes with 115 generated pages, including static `/admin/cars`.
- Adversarial coverage rejects serialization masking, sparse arrays, symbols, hidden fields and counters, accessor-backed state, mutable canonical evidence, disguised built-ins with hidden internal slots, alternate case identifiers, provider or runtime binding, out-of-scope track advancement, accepted-Preview mutation, released kill switches, and every external-authority mutation.

The historical 33-test, 1,275-test, 115-page verification for accepted source `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` remains recorded in its Preview evidence. The current results above verify only the local Aggregator Stage 1 reconciliation; they do not publish or deploy it. The earlier source's private publication, isolated Preview deployment, authenticated `/admin/cars` acceptance, and evidence publication at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43` remain complete.

## Isolated Preview release evidence

### Historical readiness acceptance

- Accepted source commit: `99da51796f10a2c55ba77b18cd3f709d67a3fbf7`.
- Private publication completed with a standard fast-forward push and no force-push.
- Isolated Preview project: `iratepilotadmin-private-preview`.
- Accepted deployment: `dpl_AQ65e5tCcPTtBZVnuhwhJKSMRQPy`, target `Preview`, status `READY`.
- Authenticated acceptance route: `https://iratepilotadmin-private-preview-alflp91on-irate-pilot.vercel.app/admin/cars`.
- Accepted page title: `Car Rentals provider-decision readiness | iRatePilot Admin | iRatePilot`.
- Browser acceptance confirmed the provider-decision section at 3 of 3 public research paths and 0 of 7 internal review gates, plus the inherited activation control center at 0 of 3 live connectors and 0 of 10 stages for each track.
- The accepted workspace contained no forms or input controls and produced no error-level browser-console entries.
- Full evidence is recorded in `docs/CAR_RENTALS_PROVIDER_DECISION_READINESS_PREVIEW_EVIDENCE_2026-08-22.md`.

This historical evidence records the earlier isolated Preview release and authenticated 0-of-7 acceptance completed under separate approval.

### Provider-path sequencing and validator-hardening acceptance

- Accepted source commit: `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`.
- Accepted source tree: `5843f841df74dc89ab049b6d16048a9b0d9c048b`.
- Accepted deployment: `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`, target `Preview`, status `READY`.
- Authenticated acceptance route: `https://iratepilotadmin-private-preview-5jp4ethgg-irate-pilot.vercel.app/admin/cars`.
- Accepted page title: `Car Rentals provider-decision readiness | iRatePilot Admin | iRatePilot`.
- Browser acceptance confirmed 3 of 3 research paths, 7 of 7 review gates, the exact phased diligence sequence and four unselected alternatives, all 29 conditions unresolved, activation stage 1 incomplete, every track at 0 of 10, 0 of 3 live connectors, zero provider contact/account/credential/sandbox/live activity, and both traffic kill switches engaged.
- The accepted `main` region contained no forms, inputs, selects, textareas, or buttons; the browser console contained no error-level entries.
- Full evidence is recorded in `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md` and was committed and privately published at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43`.

This documentation reconciliation performs no deployment. It records the newer isolated Preview release and authenticated acceptance already completed under separate approval.

## Local internal review evidence

- Gate 1 `research_artifact_reconciled`: complete under the authorized Product + Research reconciliation.
- Gate 2 `decision_question_defined`: complete under the authorized Executive + Product review. The neutral question asks which controlled path or phased combination, if any, should be considered in a later separate provider decision; its options are defer, Sabre, Travelport, a provider-unselected aggregator path, or a phased multi-path approach.
- Gate 3 `candidate_scope_frozen`: complete under the authorized Product + Architecture review for `cars-provider-decision-review-2026-08-22-cycle-01`. The exact scope is Sabre, Travelport, and the generic provider-unselected aggregator path, with Carnect, CarTrawler, and Booking.com Demand API as diligence priorities and EconomyBookings and DiscoverCars as alternates in their recorded order.
- Gate 4 `public_evidence_limits_acknowledged`: complete as an internal owner acknowledgement of the Research + Legal risk boundary. All public-evidence limits remain unresolved; no independent legal review or legal advice is claimed, and no risk acceptance, waiver, or external authority is created.
- Gate 5 `unknowns_and_hard_stops_reviewed`: complete under the authorized Commercial + Engineering + Security boundary. The review packet classifies 29 deduplicated cross-path, Sabre, Travelport, aggregator, and candidate-specific conditions as `unresolved_blocking` or `later_provider_verification_required`; it resolves, accepts, waives, or overrides none of them.
- Gate 6 `owners_and_conflicts_reviewed`: complete under the authorized Executive + Governance boundary. The review packet records 17 canonical owner combinations and four minimized sole-owner constraints; no people, staffed roles, independence, recusal, delegation, separation of duties, mitigation, waiver, acceptance, or conflict resolution is invented or claimed.
- Gate 7 `separate_decision_boundary_acknowledged`: complete under the authorized Executive + Release boundary. At Gate 7 completion, the local packet was ready for a later internal decision only; the neutral question, recommendation, provider decision, selection, aggregator binding, classified conditions, sole-owner conflicts, activation stages, and every external-authority boundary were unchanged.
- Reviewed artifact: `docs/CAR_RENTALS_PUBLIC_CONNECTOR_RESEARCH_2026-08-21.md` at `afed6471ed199cef60f317168dda2104f4fa20a3`.
- Artifact blob and SHA-256: `b5af55870ec4a4df52594046b474acfefb89b19b` and `43ab1ce9fe530a49025359fe9572f1ed4ad6623bcb1f3c1a1c1adae79b68b851`.
- Reconciliation result: Sabre, Travelport, and the provider-unselected aggregator path are present with their public-evidence limits; no discrepancy or private/provider-supplied claim was added.
- All seven local documentation gates: complete; their completion alone did not complete the separate provider-decision gate.
- Gate 2 answer at Gate 7 completion: none; the option set was unranked and unscored. The Gate 3 scope freeze did not answer the question, select a provider, define a primary or secondary path, or bind the aggregator connector.
- Current local source state: `ready_for_internal_decision` with `decision_packet_ready` true; formal recommendation is not issued; the aggregator-only commercial-diligence decision is recorded for Carnect; aggregator `providerDecisionRecorded` and Stage 1 are true; Sabre is 0 of 10, Travelport is 0 of 10, and Aggregator is 1 of 10; runtime binding remains unbound.
- Accepted Preview state: provider decision false, provider selected false, selected provider null, Stage 1 incomplete, and every track 0 of 10 at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`.
- Review packet: `docs/CAR_RENTALS_PROVIDER_DECISION_REVIEW_PACKET_2026-08-22.md`.
- Separate local decision record: `docs/CAR_RENTALS_PROVIDER_PATH_DECISION_2026-08-22.md`; Carnect primary aggregator diligence, Sabre secondary enterprise diligence, Travelport conditional hold, and four unselected decision alternatives with their frozen research classifications preserved.
- Subsequent aggregator Stage 1 record: `docs/CAR_RENTALS_ACTIVATION_STAGE_1_AGGREGATOR_PROVIDER_DECISION_2026-08-22.md`; its decision package is privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`, and its local source/UI reconciliation is implemented but remains uncommitted, undeployed, and unaccepted.

The Gates 1–7 evidence remains documentation-only and did not itself change the earlier accepted Preview. The provider-path source representation and validator hardening are committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` and reflected in the separately authorized accepted Preview deployment. The newer evidence record and five current-state documentation reconciliations are committed and privately published at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43`.

## Ten activation stages

1. Record a connector-specific provider decision.
2. Authorize the exact provider-contact purpose, sender, recipient role, channel, message, and contact limit.
3. Approve current commercial and legal terms.
4. Provision an organization-owned provider account with access and recovery controls.
5. Verify the contracted car-rental capability against iRatePilot's required operation scope.
6. Approve security, privacy, retention, sub-processor, logging, and incident controls.
7. Configure scoped non-Production credentials in the approved secret manager.
8. Complete isolated sandbox testing and provider certification.
9. Complete operational, support, finance, reconciliation, observability, rollback, and limited-pilot acceptance.
10. Make a separate connector-specific Production activation decision.

Completing a local review of these stages cannot satisfy them. Provider-dependent evidence and a separate Production decision are required.

## Immediate blockers

### Sabre

- No provider-contact authorization.
- Official public capability and onboarding research is recorded, but iRatePilot entitlement, economics, contracted geography and brands, certification scope, and support terms remain unverified.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Current boundary: the separate local source record represents Sabre only as the secondary enterprise diligence path. Its verification, private publication, and isolated Preview acceptance are complete, but it does not complete activation stage 1 or authorize contact. Any contact still requires its own separately scoped authorization after the applicable provider decision.

### Travelport

- No provider-contact authorization.
- Official public capability and onboarding research is recorded, but iRatePilot eligibility, contracted capability, economics, certification scope, and written Core Category eligibility or exception remain unverified.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Current boundary: the separate local source record preserves Travelport's conditional hold. Written Core Category eligibility or an approved exception remains unsatisfied, and any later contact requires separate approval.

### Aggregator

- Public shortlist research is recorded, and the current local source records Carnect only as the aggregator track's commercial-diligence provider. No runtime provider is selected or bound to the generic connector.
- The local activation record completes only aggregator Stage 1; no Stage 2 contact authorization, commercial/legal approval, account, credential, sandbox, certification, operational acceptance, or runtime binding exists.

Current boundary: the local source/UI reconciliation represents the direct aggregator-only Stage 1 commercial-diligence decision for Carnect. Sabre remains at 0 of 10, Travelport remains at 0 of 10, and Aggregator is at 1 of 10 locally; the accepted Preview remains at 0 of 10 for all three tracks. Runtime remains `provider-unselected` and unbound, 0 of 3 connectors are live, all 29 conditions and all sole-owner conflicts remain unresolved, both kill switches remain engaged, and contact remains unauthorized.

## Safety boundary

No provider contact is authorized by this document. No supplier message, form, call, application, contract, account, credential, endpoint, external request, sandbox connection, certification traffic, webhook receiver, live inventory, quote, policy, eligibility decision, reservation, change, cancellation, refund, payment, pilot, migration, deployment, or Production action is authorized.

Both application and database traffic kill switches remain engaged for all three connectors. Every activation record is sanitized and digest-only; contact identities, messages, commercial rates, account identifiers, endpoints, credentials, payloads, traveler or driver information, payment data, live references, and Production approvals remain prohibited.

## Next approval boundary

The separate Executive + Product phased-diligence decision is represented, verified, committed, privately published, and accepted in isolated Preview in a distinct fail-closed source record. Its evidence record and five current-state documentation reconciliations were committed and privately published at `c9ba7c964878af5a7120b8fc41d70f9ad6348b43` without redeployment or repeat browser acceptance.

The aggregator-only decision package is privately published at `931c342dd5fc6d2d753073c3d6e2e6a69111680c`, and the exact Stage 1 decision is represented and repository-verified in the current local source/UI with Aggregator at 1 of 10. That reconciliation remains uncommitted, unpushed, undeployed, and unaccepted. Commit and private publication, isolated Preview deployment, and authenticated Preview acceptance require later approvals and evidence. Stage 2 contact authorization remains a separate later decision. No gate here authorizes supplier contact, messages, forms, calls, contracts, accounts, credentials, sandbox or external provider traffic, reservations, refunds, payments, migrations, deployment, Production promotion, or Production changes.

No provider contact is authorized until a later, separately scoped contact-authorization decision.

# iRatePilot Car Rentals — Live Connector Activation Readiness

Prepared: August 21, 2026

Reconciled: August 22, 2026

Status: **the earlier readiness source and the current hardened provider-path sequencing source are published and accepted in isolated Preview; public research is recorded for 3 of 3 paths; the local 7-of-7 review packet is complete; the owner recorded a separate phased-diligence decision naming Carnect as the primary aggregator path, Sabre as the secondary enterprise path, and Travelport as conditional hold; the hardened fail-closed source is committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` and accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`; formal recommendation remains unissued, all 29 conditions and all sole-owner conflicts remain unresolved, the activation record remains provider-unselected with activation stage 1 incomplete, 0 of 3 connectors are live, and the new evidence record remains local and unpublished**

## Objective

Start the live-connector activation program for Sabre, Travelport, and one future aggregator by making every real activation dependency visible and assigning its canonical functional owner label. Those labels do not prove separately staffed roles, independent review, or separation of duties. This milestone adds a read-only control layer. The software cannot contact a provider, create an account, accept credentials, connect to a sandbox, enable traffic, create or service a reservation, move money, migrate data, deploy itself, or change Production. Its separately authorized isolated Preview deployments are recorded below and do not grant any external or Production authority.

## Current connector position

| Connector | Public research | Provider decision | Contracted capability | Account | Sandbox | Connection | Live |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sabre | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Travelport | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Aggregator (provider unselected) | Shortlist recorded | Provider selection required | Not verified | Not created | Not connected | Disabled | No |

Public research is complete for the three controlled paths. Sabre has a technical-secondary disposition based on official public evidence. Travelport remains a conditional enterprise candidate because written Core Category eligibility or an exception is still required. The aggregator research inventory records Carnect, CarTrawler, and Booking.com Demand as priority candidates, with EconomyBookings and DiscoverCars retained as alternates. These are research dispositions only—not formal scores, recommendations, selections, contracted capabilities, or provider authority.

The table above reports the activation-readiness record, not a commercial provider selection. The phased-diligence decision names Carnect as the primary aggregator diligence path, Sabre as the secondary enterprise diligence path, and Travelport as conditional hold; it retains CarTrawler, Booking.com Demand API, EconomyBookings, and DiscoverCars as unselected alternatives while preserving their frozen Gate 3 research classifications. A separately approved source-model reconciliation represents this exact sequence in a distinct `provider_path_sequencing_local_only` record. It does not record a commercial provider selection, change `providerDecisionRecorded`, select or bind the aggregator, complete activation stage 1, or change the table. The hardened representation is committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` and accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`.

## Internal provider-decision readiness

- Public research recorded: 3 of 3 paths.
- Local internal readiness checks completed: 7 of 7; local state is `ready_for_internal_decision` and `decision_packet_ready` is true.
- Earlier accepted Preview display: historical 0 of 7 at `99da51796f10a2c55ba77b18cd3f709d67a3fbf7`; the local Gates 1 through 7 reviews themselves did not change that release.
- Current accepted Preview display: 7 of 7 at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`, with the phased diligence sequence visible.
- Formal recommendation issued: no.
- Local phased-diligence decision recorded: yes, in `docs/CAR_RENTALS_PROVIDER_PATH_DECISION_2026-08-22.md`.
- Separate provider-path sequencing source record and validator hardening: implemented and verified in `lib/cars/connector-activation-readiness.ts`, committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`, and accepted in isolated Preview deployment `dpl_AeXKzroVXPYC7p6dPCofz2vmjRhJ`.
- Preview evidence record: prepared locally in `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md`; not committed or published.
- Commercial provider selection state: `not_recorded`; provider selected: false; `selectedProviderId`: null.
- Runtime provider binding state: `unbound`; binding value: null; generic aggregator remains `provider-unselected`.
- Activation-readiness `providerDecisionRecorded`: false.
- Activation stage 1 complete: no.
- Live connectors: 0 of 3.

The seven internal checks reconcile the research artifact, define the decision question, freeze one candidate scope, acknowledge public-evidence limitations, review material unknowns and hard stops, review functional owners and conflicts, and acknowledge the separate provider-decision boundary. Completing all seven makes only an internal review packet ready. It cannot issue a recommendation, select a provider, complete activation stage 1, or authorize an external action.

The validator includes one explicitly marked `offline_fixture` with all seven gates represented for synthetic safety testing only. It is not actual review evidence and does not satisfy any gate. The separately authorized local Gate 1 reconciliation, Gate 2 neutral-question definition, Gate 3 one-cycle candidate-scope freeze, Gate 4 internal owner acknowledgement, Gate 5 fail-closed condition review, Gate 6 sole-owner conflict review, and Gate 7 separate-decision boundary acknowledgement recorded below are the sole basis for the current 7-of-7 documentation count.

## Local verification

- 33 focused provider-decision, provider-path sequencing, and connector-activation safety tests pass.
- ESLint passes.
- TypeScript passes with no emitted files.
- The full repository suite passes: 1,275 tests across 262 files.
- The optimized Next.js build passes with 115 generated pages, including static `/admin/cars`.
- Adversarial coverage rejects serialization masking, sparse arrays, symbols, hidden fields and counters, accessor-backed state, mutable canonical evidence, provider selection or binding, activation-stage advancement, released kill switches, and every external-authority mutation.

These results verify the accepted source at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e`. Its private publication, isolated Preview deployment, and authenticated `/admin/cars` acceptance are complete. Only the new evidence record and these current-state documentation reconciliations remain local and unpublished.

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
- Full evidence is prepared locally in `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md` and is not yet committed or published.

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
- Current local documentation state: `ready_for_internal_decision` with `decision_packet_ready` true; the later provider-path sequencing decision is recorded separately and is now represented in a distinct local fail-closed source record; formal recommendation is not issued, commercial provider selection is `not_recorded`, selected provider is none, runtime binding is unbound, and activation stage 1 remains incomplete.
- Review packet: `docs/CAR_RENTALS_PROVIDER_DECISION_REVIEW_PACKET_2026-08-22.md`.
- Separate local decision record: `docs/CAR_RENTALS_PROVIDER_PATH_DECISION_2026-08-22.md`; Carnect primary aggregator diligence, Sabre secondary enterprise diligence, Travelport conditional hold, and four unselected decision alternatives with their frozen research classifications preserved.

The Gates 1–7 evidence remains documentation-only and did not itself change the earlier accepted Preview. The provider-path source representation and validator hardening are committed and privately published at `1fb968085f50aa7b30abf6a5ec55d9062f3d1a8e` and reflected in the separately authorized accepted Preview deployment. The new evidence record and current-state documentation reconciliation remain local and unpublished.

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

Current boundary: the separate local source record represents Sabre only as the secondary enterprise diligence path. It does not complete activation stage 1 or authorize contact. Verification and any later release of that local representation require their own approval before any separately scoped contact decision.

### Travelport

- No provider-contact authorization.
- Official public capability and onboarding research is recorded, but iRatePilot eligibility, contracted capability, economics, certification scope, and written Core Category eligibility or exception remain unverified.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Current boundary: the separate local source record preserves Travelport's conditional hold. Written Core Category eligibility or an approved exception remains unsatisfied, and any later contact requires separate approval.

### Aggregator

- Public shortlist research is recorded, but no aggregator provider has been selected or bound to the generic connector.
- The activation record still has no provider decision or aggregator binding; the separate local sequencing record is not a commercial selection or runtime binding, and no contact authorization, commercial review, account, credential, sandbox, certification, or operational acceptance exists.

Current boundary: the separate local source record represents Carnect only as the named primary aggregator diligence path. The runtime connector remains provider-unselected, activation stage 1 remains incomplete, and contact remains unauthorized.

## Safety boundary

No provider contact is authorized by this document. No supplier message, form, call, application, contract, account, credential, endpoint, external request, sandbox connection, certification traffic, webhook receiver, live inventory, quote, policy, eligibility decision, reservation, change, cancellation, refund, payment, pilot, migration, deployment, or Production action is authorized.

Both application and database traffic kill switches remain engaged for all three connectors. Every activation record is sanitized and digest-only; contact identities, messages, commercial rates, account identifiers, endpoints, credentials, payloads, traveler or driver information, payment data, live references, and Production approvals remain prohibited.

## Next approval boundary

The separate Executive + Product phased-diligence decision is represented, verified, committed, privately published, and accepted in isolated Preview in a distinct fail-closed source record. The next safe gate is a separately approved documentation-only commit and normal private-branch push of `docs/CAR_RENTALS_PROVIDER_PATH_SEQUENCING_PREVIEW_EVIDENCE_2026-08-22.md` and the five current-state reconciliations. No redeployment or repeat browser acceptance is required. No gate here authorizes supplier contact, messages, forms, calls, contracts, accounts, credentials, sandbox or external provider traffic, reservations, refunds, payments, migrations, Production promotion, or Production changes.

No provider contact is authorized until a later, separately scoped contact-authorization decision.

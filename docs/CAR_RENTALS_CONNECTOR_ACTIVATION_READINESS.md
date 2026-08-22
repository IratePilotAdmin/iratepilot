# iRatePilot Car Rentals — Live Connector Activation Readiness

Prepared: August 21, 2026

Reconciled: August 22, 2026

Status: **public research recorded for 3 of 3 paths; internal provider-decision review remains 0 of 7; no provider selected; 0 of 3 connectors live**

## Objective

Start the live-connector activation program for Sabre, Travelport, and one future aggregator by making every real activation dependency visible and independently owned. This milestone adds a read-only control layer. It does not contact a provider, create an account, accept credentials, connect to a sandbox, enable traffic, create or service a reservation, move money, migrate data, deploy, or change Production.

## Current connector position

| Connector | Public research | Provider decision | Contracted capability | Account | Sandbox | Connection | Live |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sabre | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Travelport | Recorded | Not recorded | Not verified | Not created | Not connected | Disabled | No |
| Aggregator (provider unselected) | Shortlist recorded | Provider selection required | Not verified | Not created | Not connected | Disabled | No |

Public research is complete for the three controlled paths. Sabre has a technical-secondary disposition based on official public evidence. Travelport remains a conditional enterprise candidate because written Core Category eligibility or an exception is still required. The aggregator research inventory records Carnect, CarTrawler, and Booking.com Demand as priority candidates, with EconomyBookings and DiscoverCars retained as alternates. These are research dispositions only—not formal scores, recommendations, selections, contracted capabilities, or provider authority.

## Internal provider-decision readiness

- Public research recorded: 3 of 3 paths.
- Internal readiness checks completed: 0 of 7.
- Formal recommendation issued: no.
- Provider decision recorded: no.
- Selected provider: none.
- Activation stage 1 complete: no.
- Live connectors: 0 of 3.

The seven internal checks reconcile the research artifact, define the decision question, freeze one candidate scope, acknowledge public-evidence limitations, review material unknowns and hard stops, review functional owners and conflicts, and acknowledge the separate provider-decision boundary. Completing all seven makes only an internal review packet ready. It cannot issue a recommendation, select a provider, complete activation stage 1, or authorize an external action.

The validator includes one explicitly marked `offline_fixture` with all seven gates represented for synthetic safety testing only. It is not actual review evidence and does not change the current 0-of-7 operational count.

## Local verification

- 18 focused provider-decision and connector-activation safety tests pass.
- ESLint passes.
- TypeScript passes with no emitted files.
- The full repository suite passes: 1,260 tests across 262 files.
- The optimized Next.js build passes with 115 generated pages, including static `/admin/cars`.

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

Next decision: complete the internal provider-decision readiness review, then make a separate provider decision before any contact.

### Travelport

- No provider-contact authorization.
- Official public capability and onboarding research is recorded, but iRatePilot eligibility, contracted capability, economics, certification scope, and written Core Category eligibility or exception remain unverified.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Next decision: complete the internal provider-decision readiness review, then make a separate provider decision before any contact.

### Aggregator

- Public shortlist research is recorded, but no aggregator provider has been selected or bound to the generic connector.
- No provider decision, contact authorization, commercial review, account, credential, sandbox, certification, or operational acceptance exists.

Next decision: complete internal shortlist decision readiness, then make a separate aggregator-provider decision before any contact.

## Safety boundary

No provider contact is authorized by this document. No supplier message, form, call, application, contract, account, credential, endpoint, external request, sandbox connection, certification traffic, webhook receiver, live inventory, quote, policy, eligibility decision, reservation, change, cancellation, refund, payment, pilot, migration, deployment, or Production action is authorized.

Both application and database traffic kill switches remain engaged for all three connectors. Every activation record is sanitized and digest-only; contact identities, messages, commercial rates, account identifiers, endpoints, credentials, payloads, traveler or driver information, payment data, live references, and Production approvals remain prohibited.

## Next approval boundary

The next gate is an internal provider-decision readiness review only. It may review the already-recorded public research, candidate scope, unknowns, hard stops, owners, conflicts, and decision boundary. It must not issue a recommendation, select a provider, contact a supplier, send a message, submit a form or application, make a call, execute a contract, create an account, receive credentials, connect to a sandbox, send external provider traffic, create or service a reservation, issue a refund, move money, migrate data, deploy, or change Production.

After that packet is ready, an additional explicit provider-decision gate is still required. No provider contact is authorized until a later, separately scoped contact-authorization decision.

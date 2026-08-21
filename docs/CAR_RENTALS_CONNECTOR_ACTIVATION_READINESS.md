# iRatePilot Car Rentals — Live Connector Activation Readiness

Prepared: August 21, 2026

Status: **local implementation and repository verification only; 0 of 3 connectors live**

## Objective

Start the live-connector activation program for Sabre, Travelport, and one future aggregator by making every real activation dependency visible and independently owned. This milestone adds a read-only control layer. It does not contact a provider, create an account, accept credentials, connect to a sandbox, enable traffic, create or service a reservation, move money, migrate data, deploy, or change Production.

## Current connector position

| Connector | Provider decision | Account | Capability | Sandbox | Connection | Live |
| --- | --- | --- | --- | --- | --- | --- |
| Sabre | Candidate only | Not created | Not verified | Not connected | Disabled | No |
| Travelport | Candidate only | Not created | Not verified | Not connected | Disabled | No |
| Aggregator (provider unselected) | Aggregator selection required | Not created | Not verified | Not connected | Disabled | No |

Sabre and Travelport are named technical candidates only. Their current car-rental product fit, commercial availability, onboarding route, entitlement, certification requirements, and suitability for iRatePilot have not been verified. The aggregator track cannot advance until a provider is selected through a separately approved research and decision process.

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
- No current car-rental capability or onboarding verification.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Next decision: approve current public capability and onboarding research for Sabre before any contact.

### Travelport

- No provider-contact authorization.
- No current car-rental capability or onboarding verification for the intended product path.
- No commercial selection, executed terms, account, entitlement, credential, sandbox access, certification, or operational acceptance.

Next decision: approve current public capability and onboarding research for Travelport before any contact.

### Aggregator

- No aggregator provider has been selected.
- No provider-specific research, decision, contact authorization, commercial review, account, credential, sandbox, certification, or operational acceptance exists.

Next decision: approve public aggregator research and shortlist preparation, followed by a separate provider-selection decision.

## Safety boundary

No provider contact is authorized by this document. No supplier message, form, call, application, contract, account, credential, endpoint, external request, sandbox connection, certification traffic, webhook receiver, live inventory, quote, policy, eligibility decision, reservation, change, cancellation, refund, payment, pilot, migration, deployment, or Production action is authorized.

Both application and database traffic kill switches remain engaged for all three connectors. Every activation record is sanitized and digest-only; contact identities, messages, commercial rates, account identifiers, endpoints, credentials, payloads, traveler or driver information, payment data, live references, and Production approvals remain prohibited.

## Next approval boundary

The first external-readiness gate should authorize public research only for:

- Sabre's current car-rental capability and official onboarding route;
- Travelport's current car-rental capability and official onboarding route; and
- a provider-neutral aggregator market shortlist.

That research gate must exclude supplier contact, messages, forms, calls, applications, contracts, accounts, credentials, external provider traffic, reservations, refunds, payments, migrations, deployment, and Production changes.

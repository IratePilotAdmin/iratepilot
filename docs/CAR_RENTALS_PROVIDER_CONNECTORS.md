# iRatePilot Car Rentals — Named Connector Preparation

Prepared: August 21, 2026

Status: **local implementation and repository verification only**

## Objective

Add fail-closed connector shells for Sabre, Travelport, and one generic aggregator path without creating any supplier relationship, account, endpoint, credential, transport, external request, reservation action, payment action, deployment, migration, or Production authority.

## Connector registry

| Connector | Category | Local state | Provisioning | Capability verification | Connection |
| --- | --- | --- | --- | --- | --- |
| Sabre | GDS | Offline contract only | Not started | Not verified | Disabled |
| Travelport | GDS | Offline contract only | Not started | Not verified | Disabled |
| Aggregator (provider unselected) | Aggregator | Offline contract only | Not started | Not verified | Disabled |

The three entries map only to the existing Phase 10 provider-neutral operation vocabulary. The operation inventory is an internal design target, not evidence that a provider offers, has approved, or has enabled any capability for iRatePilot.

## Implementation boundary

- The registry contains no endpoint or protocol configuration.
- It contains no HTTP client, socket, webhook receiver, background job, or queue.
- It accepts no API keys, client secrets, access tokens, refresh tokens, account identifiers, executed contracts, raw requests, raw responses, customer identities, payment data, or live reservation references.
- Both application and database traffic kill switches must remain engaged.
- The operation runner always returns `connector_disabled` and records that no external request, reservation change, or payment movement occurred.
- Completing every local review gate cannot authorize provider contact, account creation, credential receipt, sandbox connectivity, certification, external traffic, reservations, refunds, payments, migrations, deployment, or Production.

## Public-reference boundary

- Sabre's official workflow repository documents that its APIs require provisioning and credentials, distinguishes test and Production environments, and warns that Production actions may affect live inventory and incur charges. This connector therefore contains no endpoints or credentials and makes no Sabre car-rental capability claim: <https://github.com/SabreDevStudio/SabreAPIsWorkflows>
- Travelport's official Universal API material publicly documents vehicle search, location, details, rules, and related vehicle workflows. Those public pages do not establish iRatePilot entitlement, current product fit, certification, or connection authority: <https://support.travelport.com/webhelp/uapi/Content/Getting_Started/High_Level_Overviews/Vehicle_Details_Overview.htm> and <https://support.travelport.com/webhelp/uapi/Content/SampleWeb/XMLFiles/1V_Air_Vehicle_Hotel/Vehicle_Search-1V.htm>
- No aggregator company is selected. The generic entry remains a placeholder until separately authorized research, commercial review, security review, and provider onboarding occur.

## Separate future gates

Any live provider work requires a new authorization covering the exact provider and scope. At minimum, that later gate must separately address provider research, supplier contact, commercial terms, account ownership, current API capability verification, security and privacy review, credential handling, isolated sandbox connectivity, certification evidence, operational acceptance, payment and refund controls, rollback, and a separate Production decision.

This document does not authorize any of those actions.

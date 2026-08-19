# iRatePilot Flights — Phase 4

Status: Local supplier due-diligence and contracting-readiness software and repository verification complete; Git and isolated Preview release pending separate approval; all external activation gates remain closed

## Purpose

Phase 4 extends the protected `/admin/flights` workspace with a vendor-neutral candidate-evidence packet, a contract review matrix, and a separately owned diligence sequence. It defines what iRatePilot would need to review before a supplier could be selected without naming, contacting, scoring, shortlisting, approving, or contracting a supplier.

This phase does not store a supplier identity, response, document, quote, representation, score, shortlist, contract, credential, endpoint, passenger record, schedule, fare, availability result, order, ticket, or payment.

## Candidate evidence packet

Seven workstreams define future evidence requirements:

- corporate identity and authority;
- content and market coverage;
- commercial economics;
- ticketing and settlement;
- servicing and disruption support;
- security and passenger-data privacy; and
- technical sandbox readiness.

Each workstream names an accountable review owner, three required evidence categories, and an explicit safety boundary. These are requirements only. Phase 4 has no evidence upload, form, database, candidate record, scoring model, or approval action.

## Contract review matrix

Six review lanes define the scope of a future agreement:

- content rights and permitted use;
- issuing authority and accreditation;
- economics and settlement;
- servicing, exchanges, and refunds;
- passenger data and security; and
- service levels, continuity, and exit.

The matrix does not receive, negotiate, approve, sign, or activate a contract. It authorizes no content rights, ticketing authority, payment path, settlement account, passenger-data processing, adapter build, or traffic.

## Fail-closed boundary

Nine separately owned diligence gates sequence evaluation-packet approval, identity verification, coverage review, commercial review, authority and settlement approval, servicing and support approval, security and privacy approval, contract-package approval, and a separate supplier-selection decision.

Even when every diligence gate is marked complete in the pure model, all of these remain unchanged:

- candidate state: `not_recorded`;
- candidate count: zero;
- shortlist state: `not_created`;
- contract state: `not_received`;
- supplier selection state: `not_selected`;
- credentials accepted: false;
- sandbox adapter implemented: false;
- sandbox supplier traffic authorized: false;
- Production supplier traffic authorized: false;
- ticketing authorized: false; and
- flight payments authorized: false.

Phase 4 adds no client component, form, API route, server action, database migration, environment variable, secret, provider SDK, network request, webhook, external message, or Production configuration.

## Software acceptance gates

- [x] Define seven unique candidate-evidence workstreams with accountable owners and explicit safety boundaries.
- [x] Define six unique contract-review lanes that cannot activate content, ticketing, payments, data processing, implementation, or traffic.
- [x] Define nine separately owned diligence gates.
- [x] Prove that completed diligence cannot create a candidate, shortlist, contract, selection, credential, adapter, traffic, ticket, or payment authorization.
- [x] Extend the protected administrator workspace while preserving the Phase 3 planning and Phase 2 activation references.
- [x] Keep the workspace server-rendered, read-only, and free of candidate storage, sensitive data, mutations, and network access.
- [x] Pass ESLint, TypeScript, 1,000 tests across 231 files, and the optimized 113-page Next.js build.

## Release gates

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/flights` and record evidence after separate approval.

## External activation gates

- [ ] Approve the evaluation packet before reviewing a named candidate.
- [ ] Receive attributable supplier evidence through an approved business process without credentials or passenger data.
- [ ] Verify the candidate's legal identity, authority, content rights, accreditation, and ticketing model.
- [ ] Review coverage, economics, settlement, servicing, support, security, privacy, continuity, and exit evidence.
- [ ] Negotiate and approve the complete contract package through authorized legal and executive signatories.
- [ ] Make a separate supplier-selection decision naming one contracted path.
- [ ] Approve a secure sandbox-only credential channel after contract signature.
- [ ] Make a separate implementation decision before adding persistence, endpoints, secrets, SDKs, or traffic.
- [ ] Make a separate Production decision before enabling airline content, ticketing, flight payments, or supplier traffic.

Phase 4 software completion is not supplier selection, contract acceptance, or authorization for a live flight search or sale.

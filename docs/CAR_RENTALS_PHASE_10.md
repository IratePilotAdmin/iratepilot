# iRatePilot Car Rentals — Phase 10 Provider Adapter and Sandbox Certification

Prepared: August 21, 2026

Status: **Software, repository verification, private publication, isolated Preview deployment, authenticated browser acceptance, and evidence recording complete; supplier research or contact, accounts, credentials, external traffic, actual sandbox certification, reservations, refunds, payments, migrations, and Production remain pending**

## Purpose

Phase 10 defines provider-neutral and offline-only contracts for adapter identity and versioning, operation allowlisting, non-secret credential-scope labels, idempotency, retries, timeouts, webhook-fixture integrity, audit evidence, and dual fail-closed kill switches. It validates sanitized or synthetic records only. It cannot research, select, contact, or connect a supplier; name a provider; create an account; request, receive, store, or use credentials; create an endpoint; open a socket; enqueue a job; receive a webhook; send external traffic; certify a sandbox; inspect inventory; quote or reprice; create, change, cancel, or retrieve a live reservation; issue a refund; move money; deploy software; migrate data; or change Production.

## Offline adapter contracts

The contract covers all nine Phase 10 control areas:

1. Adapter identity and version — opaque contract identity, semantic versioning, and an offline-fixture environment without provider identity.
2. Operation allowlist — ten controlled read, mutation-shaped fixture, reconciliation, and webhook-verification operation kinds without arbitrary actions.
3. Credential-scope manifest — exactly one operation-specific, non-secret scope label without keys, tokens, secrets, credential values, endpoints, or accounts.
4. Idempotency — lowercase SHA-256 digest evidence for mutation-shaped fixtures without storing a raw key or replaying a request.
5. Retry policy — one through three attempts with outcome-consistent synthetic retry evidence and no job, queue, or provider call.
6. Timeout policy — integer timeouts from 250 through 10,000 milliseconds with explicit stopped, retry-recorded, or manual-review behavior.
7. Webhook integrity — verified, rejected, or manual-review fixture evidence only for the webhook-verification operation, without endpoints or secrets.
8. Audit evidence — request, response, and audit digests without raw payloads, external identifiers, or claims of supplier execution.
9. Dual kill switches — independent application and database traffic switches must both remain engaged.

## Fail-closed behavior

- Blank or malformed certification-case identity, adapter-contract identity, semantic version, operation, scope, digest, attempt, timeout, result, response, retry, webhook, kill-switch, or field-inventory evidence is rejected.
- The environment must remain `offline_fixture`.
- Each operation requires exactly one documented non-secret scope label.
- Reservation create, modify, cancel, and refund-reconciliation fixtures require digest-only idempotency evidence; read and webhook fixtures prohibit it.
- Attempt count and maximum attempts must be integers from one through three, attempt count cannot exceed the maximum, and multiple attempts require retry-recorded evidence.
- Timeouts must be integers from 250 through 10,000 milliseconds.
- Server-error and timeout evidence requires an explicit retry, stop, or manual-review outcome; client errors require stop or manual review.
- Webhook evidence is applicable only to the webhook-verification fixture.
- Both application and database traffic kill switches must remain engaged.
- Contract-ready evidence requires a successful synthetic response, a settled retry outcome, and verified fixture evidence for webhook-shaped cases.
- The recorded-field inventory must exactly match the minimized allowlist and reject duplicates or unsupported fields.
- Provider names, supplier names, endpoints, keys, secrets, tokens, credential values, raw requests, raw responses, raw webhook payloads, traveler identity, driver-license data, payment data, precise location, and live reservation references block readiness.
- Rejected and manual-review outcomes remain structurally valid when internally consistent, but they cannot satisfy contract readiness.
- Completing every Phase 10 review gate completes only an offline contract review.

The model always reports the following as false:

- supplier research or contact authorized;
- provider selected or mapped;
- account creation authorized;
- credential request or acceptance authorized;
- credential material present;
- sandbox connection authorized;
- sandbox certified;
- external or Production traffic authorized;
- webhook receiver authorized;
- reservation mutation authorized;
- refund execution authorized; and
- payment authorized.

## Software gates

- [x] Reconcile the Phase 9 commit, private publication, isolated Preview deployment, authenticated acceptance, and evidence publication at `088637df4ebb6ffd697048749e55a86a48d1db63`.
- [x] Define all nine provider-neutral offline adapter and certification contracts required by the package roadmap.
- [x] Define ten allowlisted operation kinds, seven non-secret scope labels, controlled response, retry, webhook, result, and kill-switch states.
- [x] Define twelve independently owned review gates that start incomplete.
- [x] Add a pure local validator for stable identity, semantic versioning, exact scope binding, digest-only evidence, idempotency, attempt and timeout bounds, retry consistency, webhook applicability, dual kill switches, and field minimization.
- [x] Add three sanitized fixtures for availability-read, retry-recorded reservation-create shape, and webhook-verification shape.
- [x] Reject malformed, unsupported, inconsistent, excessive, prohibited, duplicate, credential-bearing, provider-identifying, or externally actionable evidence.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 9 through Phase 2 references.
- [x] Pass 14 focused tests, ESLint, TypeScript, 1,204 tests across 258 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 10 software and documentation only after separate approval.
- [x] Reconcile and push the approved private branch without force-push only after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval.
- [x] Complete authenticated browser acceptance at `/admin/cars` and record evidence only after separate approval.

## External activation gates

- [ ] Approve provider research, selection, contact, contracts, accounts, and credential handling separately.
- [ ] Approve a named provider mapping, least-privilege scopes, secrets handling, endpoint allowlist, egress policy, monitoring, incident response, and both kill-switch release decisions separately.
- [ ] Connect to and certify an actual isolated supplier sandbox for locations, availability, quotes, repricing, reservation lifecycle, refunds, webhooks, retries, timeouts, idempotency, security, privacy, audit, support, and failure behavior separately.
- [ ] Approve migrations, controlled pilot, deployment, and Production through their own later gates.

The approved isolated Preview acceptance is recorded in `docs/CAR_RENTALS_PHASE_10_PREVIEW_EVIDENCE_2026-08-21.md`.

No provider, credential, sandbox, webhook, traffic, reservation, refund, payment, migration, deployment, or Production authority is created by this document.

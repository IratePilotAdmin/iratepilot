# Phase 4 supplier-certification software evidence — 2026-08-17

This record documents local software evidence for PMS and SynXis certification readiness. It contains no vendor credentials, hotel identifiers, supplier payloads, personal data, production authorization, or claim that a vendor has certified iRatePilot.

## Framework coverage

- The normalized PMS registry contains 22 unique providers.
- All 22 providers have a corresponding strict production launch manifest.
- Provider configuration audits return only configured, missing, or invalid environment-variable names; credential values are not returned.
- The operator summary independently reports framework coverage, vendor approvals, mappings, sandbox results, webhook results, production-smoke results, controlled-activation candidates, and providers with recorded live authorization.
- Missing durable evidence tracking, a missing launch manifest, or duplicate provider registration downgrades the framework status to `framework_attention`.

## Certification and traffic separation

The software now uses four explicit Phase 4 summary states:

1. `framework_attention` — software coverage or durable evidence tracking is incomplete.
2. `vendor_certification_pending` — the framework is complete but no provider has passed every external activation gate.
3. `controlled_activation_ready` — at least one provider has verified configuration, approval details, mapping, sandbox, webhook, and production-smoke evidence, but is not live.
4. `live_provider_present` — at least one provider's strict audit has recorded live authorization.

The summary is read-only. It cannot mark evidence complete, approve a certification packet, send a supplier request, or enable a provider.

## Existing fail-closed controls verified

- PMS launch evidence must be recorded in order: vendor approval, property mapping, sandbox validation, webhook validation, production test-property smoke test, then live activation.
- A live PMS decision also requires non-placeholder approval reference, approved environment, real property code, and support contact details.
- Invalid or insecure endpoint configuration blocks activation.
- SynXis independently requires persisted certification evidence before certification traffic, production-smoke traffic, or live traffic is allowed.
- SynXis live traffic additionally requires vendor approval, approved certification environment, property mapping, sandbox validation, production-smoke validation, and an explicit live-enabled record.

## Automated evidence

- 488 targeted supplier, PMS, provider-adapter, and SynXis tests passed across 98 files.
- The Phase 4 summary tests cover 22-of-22 manifest coverage, duplicate and missing manifest detection, unavailable evidence tracking, certification counts, activation-candidate separation, live-state truthfulness, and read-only operator copy.
- TypeScript passed after the Phase 4 implementation.
- The complete repository gate passed after these changes: ESLint, TypeScript, 941 tests across 221 files, and the optimized 110-route Next.js build.

## Actions deliberately not performed

- No vendor, PMS, CRS, SynXis, hotel, or supplier endpoint was contacted.
- No credentials, endpoints, property mappings, approval references, or evidence flags were added or changed.
- No certification packet was submitted and no vendor approval was claimed.
- No sandbox, production-smoke, or real-property traffic was sent.
- No live supplier flag was enabled.
- No production database, environment, deployment, domain, or traffic configuration changed.

## Remaining external work

- An authorized pilot hotel must identify its actual PMS/CRS and approve the integration scope.
- The selected vendor must issue credentials, endpoint documentation, property mappings, certification requirements, and escalation contacts.
- iRatePilot and the vendor must complete sandbox certification and webhook validation with sanitized evidence.
- A controlled production test-property smoke test requires separate approval, a maintenance window, monitoring, and a rollback path.
- Any real-property supplier traffic requires a final independent production decision after all evidence is reviewed.

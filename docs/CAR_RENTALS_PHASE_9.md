# iRatePilot Car Rentals — Phase 9 Operations and Customer Support

Prepared: August 21, 2026

Status: **Software, private publication, isolated Preview deployment, and authenticated browser acceptance complete; evidence publication, supplier activity, support action, roadside or emergency action, claims, migrations, and Production remain pending**

## Purpose

Phase 9 defines provider-neutral and non-operational contracts for pickup failures, counter disputes, unavailable vehicle classes, upgrades, breakdowns, accidents, roadside assistance, damage claims, and emergency escalation. It validates sanitized or synthetic records only. It cannot contact a traveler, supplier, counter, roadside provider, insurer, processor, police, emergency service, or medical service; inspect inventory; source or replace a vehicle; fulfill an upgrade; change a reservation; dispatch assistance; submit or settle a claim; issue a refund; move money; make an external request; deploy software; migrate data; or change Production.

## Operations and support contracts

The contract covers all nine Phase 9 roadmap areas:

1. Pickup failures — ordered opened, acknowledged, and resolved evidence without supplier contact or promised remedies.
2. Counter disputes — explicit reported, pending, resolved-recorded, and manual-review states without identities or raw narratives.
3. Unavailable classes — unavailable, substitute-recorded, upgrade-recorded, unknown, and manual-review states without inventory access.
4. Upgrades — offered-recorded, accepted-recorded, declined-recorded, unknown, and manual-review evidence without price or fulfillment claims.
5. Breakdowns — sanitized roadside or remote timelines without diagnostics, dispatch, repairs, or liability decisions.
6. Accidents — explicit urgency, roadside, damage, and escalation states without precise location, sensitive narrative, medical, or fault evidence.
7. Roadside assistance — pending, dispatch-recorded, completed-recorded, unavailable, and manual-review states without service requests.
8. Damage claims — reported, pending, disputed, resolved-recorded, and manual-review states without policies, reports, documents, filing, or settlement.
9. Emergency escalation — emergency-only pending, contact-recorded, completed-recorded, and manual-review evidence without calls or response claims.

## Fail-closed behavior

- Blank or malformed case, lifecycle, state, urgency, location-context, timestamp, outcome, digest, or field-inventory evidence is rejected.
- Acknowledgement cannot precede case opening, and resolution cannot precede opening or acknowledgement.
- Opened cases cannot contain acknowledgement or resolution evidence and must remain pending.
- Triaged, pending-external, and manual-review cases require acknowledgement and cannot claim resolution.
- Resolved and closed cases require ordered timestamps, a terminal support outcome, and a lowercase 64-character sanitized resolution-evidence digest.
- Counter-dispute, vehicle-class, upgrade, roadside, damage-claim, and emergency-escalation states must be applicable only to supported case kinds.
- Pickup failures, counter disputes, breakdowns, accidents, and roadside-assistance cases require controlled location contexts; precise locations are prohibited.
- Emergency urgency is restricted to accident and emergency-escalation evidence, and emergency-escalation cases require it.
- Unknown, reported, pending, unavailable, disputed, and manual-review states preserve uncertainty and fail contract readiness closed.
- The recorded-field inventory must exactly match the minimized allowlist and reject duplicates or unsupported fields.
- Identity, license, vehicle identifier, precise location, payment, medical, raw narrative, police report, insurance policy, raw supplier reference, and credential data blocks readiness.
- A structurally valid fixture remains non-operational and cannot prove contact, dispatch, assistance, vehicle replacement, upgrade fulfillment, claim action, reservation change, refund, payment, supplier response, or emergency response.
- Completing every Phase 9 review gate completes only a contract review.

The model always reports the following as false:

- supplier contact authorized;
- provider mapping created;
- credential acceptance authorized;
- external, sandbox, or Production traffic authorized;
- reservation mutation authorized;
- support contact authorized;
- roadside dispatch authorized;
- emergency-service contact authorized;
- replacement vehicle authorized;
- upgrade fulfillment authorized;
- damage-claim submission authorized;
- refund execution authorized; and
- payment authorized.

## Software gates

- [x] Reconcile the Phase 8 commit, private publication, isolated Preview deployment, authenticated acceptance, and evidence state.
- [x] Define all nine provider-neutral operations and support contracts required by the package roadmap.
- [x] Define controlled case, urgency, location, outcome, dispute, class, upgrade, roadside, damage-claim, and emergency-escalation states.
- [x] Define twelve independently owned review gates that start incomplete.
- [x] Add a pure local validator for case identity, exact UTC ordering, terminal evidence, case-specific states, context rules, and field minimization.
- [x] Add three sanitized fixtures for pickup failure, breakdown with roadside evidence, and accident with damage and emergency evidence.
- [x] Reject malformed, unsupported, out-of-order, inapplicable, inconsistent, prohibited, duplicate, or sensitive evidence.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 8 through Phase 2 references.
- [x] Pass 13 focused tests, ESLint, TypeScript, 1,190 tests across 257 files, and the optimized 115-page Next.js build.

## Release gates

- [x] Commit the Phase 9 software and documentation after separate approval at `698bf3eaec38fbcec416d86c22342d8640e33c99`.
- [x] Reconcile and publish the approved private branch with `force=false` after separate approval.
- [x] Deploy only to the isolated Preview project after separate approval as `dpl_3VS3ogNxcmeFNUaTaskt5Uyu5JTP`.
- [x] Complete authenticated browser acceptance at `/admin/cars` and prepare evidence in `docs/CAR_RENTALS_PHASE_9_PREVIEW_EVIDENCE_2026-08-21.md`.

Preview evidence publication remains a separate commit-and-private-push gate.

## External activation gates

- [ ] Approve supplier, roadside, insurance, claims, emergency, or support-provider research and contact separately.
- [ ] Approve contracts, accounts, credentials, provider mapping, staffed workflows, escalation directories, and isolated sandbox verification separately.
- [ ] Certify pickup-failure, counter-dispute, class-substitution, upgrade, breakdown, accident, roadside, damage-claim, emergency, privacy, security, audit, support, and incident behavior separately.
- [ ] Approve migrations, deployment, and Production through their own later gates.

The completed isolated Preview release creates no supplier, support, roadside, insurer, claims, police, emergency, reservation, refund, payment, migration, or Production authority.

# iRatePilot Car Rentals — Phase 6 Driver Eligibility and Privacy

Prepared: August 20, 2026

Status: **Software implementation and full repository verification complete locally; every release or external-action gate remains pending**

## Purpose

Phase 6 defines a provider-neutral contract for minimum age, driver-license rules, residency, additional drivers, geographic restrictions, data minimization, retention, and deletion. It validates sanitized or synthetic records only. It does not collect or verify real personal data, identity, a license number or image, date of birth, address, contact information, or biometrics. It cannot issue a supplier eligibility decision, contact a supplier, accept credentials, make an external request, reserve a vehicle, authorize payment, deploy software, migrate data, or change Production.

## Eligibility and privacy contracts

The contract covers all eight Phase 6 roadmap areas:

1. Minimum age — a synthetic whole-year age, matching age band, explicit minimum, and derived eligible or ineligible outcome.
2. License rules — country, controlled class, expiry date, rule outcome, and sanitized reference without a license number or image.
3. Residency — explicit not-required, satisfied, not-satisfied, or manual-review state without an address or proof document.
4. Additional drivers — a bounded count and rule outcome without names, licenses, contact details, or payment data.
5. Geographic restrictions — same-country or cross-border outcome without representing supplier, insurer, border, or road authorization.
6. Data minimization — an exact allowlisted collected-field inventory that rejects missing, extra, duplicate, unsupported, or prohibited fields.
7. Retention — exact UTC collection and deletion-deadline instants bound to a bounded whole-day retention period.
8. Deletion — derived scheduled, completed, or overdue state with exact evidence and fail-closed handling for late or invented deletion.

## Fail-closed behavior

- Blank or malformed evaluation IDs, policy fingerprints, dates, ages, country codes, classes, outcomes, rule references, or timestamps are rejected.
- Whole-year age must match the declared planning age band and is compared exactly with the minimum-age rule.
- A satisfied license rule cannot expire before rental start.
- Not-required residency, additional-driver, and geographic states cannot retain invented evidence.
- Additional-driver counts are bounded and never contain individual driver records.
- Same-country travel uses a not-required geographic outcome; cross-border travel requires an explicit allowed, restricted, or manual-review outcome.
- Eligible, ineligible, and manual-review states are derived from controlled rule outcomes and must match the declared result.
- The collected-field inventory must exactly match the minimum fields used by the synthetic record.
- Full names, birth dates, license numbers or images, addresses, email, phone, and biometric data are prohibited.
- Retention deadlines must exactly equal the declared whole-day period, and overdue deletion blocks privacy readiness.
- A complete local record remains non-transactional and cannot verify a person, identity, license, residency, geography, or supplier eligibility.
- Completing every Phase 6 review gate completes only a contract review.

The model always reports the following as false:

- personal data collected;
- raw license data stored;
- automated eligibility decision authorized;
- live eligibility verification authorized;
- provider mapping created;
- credential acceptance authorized;
- sandbox traffic authorized;
- Production traffic authorized;
- reservation authorized; and
- payment authorized.

## Software gates

- [x] Define the eight provider-neutral driver-eligibility and privacy contracts required by the package roadmap.
- [x] Define controlled license, residency, additional-driver, geographic, eligibility, and deletion states.
- [x] Define twelve independently owned review gates that start incomplete.
- [x] Add a pure local validator for age, license metadata, residency, additional drivers, geography, minimization, retention, and deletion.
- [x] Validate sanitized records without network access, credentials, real identity data, supplier data, or external effects.
- [x] Reject malformed, inconsistent, prohibited, duplicate, over-retained, late, missing, and internally mismatched evidence.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 5, Phase 4, Phase 3, and Phase 2 references.
- [x] Pass focused tests, ESLint, TypeScript, 1,151 tests across 254 files, and the optimized 115-page Next.js build.

## Release gates

- [ ] Commit the Phase 6 software and documentation after separate approval.
- [ ] Reconcile and push the approved private branch without force-push after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier research and contact separately.
- [ ] Approve legal basis, privacy notice, data inventory, retention, deletion, processor terms, security, incident response, and real-driver handling separately.
- [ ] Approve contracts, account creation, credential receipt, named-provider mapping, and isolated sandbox verification separately.
- [ ] Certify live eligibility, reservations, payments, support, disputes, accessibility, monitoring, and audit evidence in later package phases.
- [ ] Approve migrations, deployment, and Production through their own later gates.

No release, identity-verification, eligibility, supplier, reservation, payment, or Production authority is created by this document.

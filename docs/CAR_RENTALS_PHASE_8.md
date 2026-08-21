# iRatePilot Car Rentals — Phase 8 Payment and Risk Controls

Prepared: August 21, 2026

Status: **Software and repository verification complete locally; commit, push, deployment, supplier activity, payment activity, migrations, and Production remain pending**

## Purpose

Phase 8 defines provider-neutral and non-transactional contracts for pay-now versus pay-at-counter, deposits, authorization holds, fraud review, chargebacks, refunds, currency, taxes, and receipt accuracy. It validates sanitized or synthetic records only. It cannot collect payment-card data, contact a supplier or processor, create or change a reservation, place or release a hold, collect a deposit, authorize or capture payment, execute a refund, take chargeback action, make an external request, deploy software, migrate data, or change Production.

## Payment and risk-control contracts

The contract covers all nine Phase 8 roadmap areas:

1. Payment timing — one explicit pay-now or pay-at-counter model with an exact integer-minor-unit split.
2. Deposits — not-required, disclosed, or unknown states with consistent synthetic amounts.
3. Authorization holds — not-required, disclosed, or unknown states without payment instruments or funds checks.
4. Fraud review — clear, blocked, or manual-review outcomes without identity evidence, profiling, or operational decisions.
5. Chargebacks — not-applicable, open, resolved, or manual-review states without processor action.
6. Refunds — positive recorded synthetic evidence bounded by the refundable total, with unresolved states preserved.
7. Currency — one three-letter uppercase currency and safe integer arithmetic throughout each record.
8. Taxes — itemized, included-unitemized, or unknown disclosure states without tax-advice or filing claims.
9. Receipt accuracy — exact synthetic quote and tax reconciliation or explicit unavailable, pending, mismatched, or manual-review states.

## Fail-closed behavior

- Blank or malformed payment-risk, lifecycle, quote, policy, currency, monetary, disclosure, fraud, chargeback, refund, tax, receipt, or field-inventory evidence is rejected.
- Payable-now and payable-at-counter amounts must exactly reconcile to the quoted total and the declared collection model.
- Deposits and authorization holds require state-consistent non-negative integer minor units or explicit null unknowns.
- Refund evidence must be positive only when recorded and cannot exceed the refundable total.
- Pay-at-counter fixtures cannot claim a platform chargeback state.
- Itemized taxes cannot exceed the quoted total; non-itemized states cannot contain an itemized amount.
- A matched receipt requires exact quoted-total and itemized-tax equality; a mismatched receipt must contain a real mismatch.
- The recorded-field inventory must exactly match the minimized allowlist and reject duplicates, unsupported fields, payment-card data, bank data, tokens, billing identity, raw references, or credentials.
- Unknown, blocked, pending, open, mismatched, and manual-review states preserve uncertainty and fail contract readiness closed.
- A structurally valid fixture remains non-transactional and cannot prove collection, capture, hold, deposit, refund, dispute, receipt, supplier, processor, reservation, or payment activity.
- Completing every Phase 8 review gate completes only a contract review.

The model always reports the following as false:

- supplier contact authorized;
- provider mapping created;
- credential acceptance authorized;
- external, sandbox, or Production traffic authorized;
- reservation authorized;
- payment collection or capture authorized;
- authorization hold authorized;
- deposit collection authorized;
- refund execution authorized; and
- chargeback action authorized.

## Software gates

- [x] Reconcile the Phase 7 roadmap and isolated Preview acceptance state.
- [x] Define all nine provider-neutral payment and risk-control contracts required by the package roadmap.
- [x] Define controlled payment-model, deposit, authorization-hold, fraud, chargeback, refund, tax, and receipt states.
- [x] Define twelve independently owned review gates that start incomplete.
- [x] Add a pure local validator for exact payment splits, safe minor-unit arithmetic, disclosure consistency, refundable bounds, tax bounds, receipt accuracy, and field minimization.
- [x] Add three sanitized fixtures for pay-now, pay-at-counter, and bounded refund reconciliation.
- [x] Reject malformed, unsupported, inconsistent, excessive, contradictory, prohibited, or internally mismatched evidence.
- [x] Extend `/admin/cars` as a read-only Server Component while preserving the Phase 7 through Phase 2 references.
- [x] Pass 13 focused tests, ESLint, TypeScript, 1,177 tests across 256 files, and the optimized 115-page Next.js build.

## Release gates

- [ ] Commit the Phase 8 software and documentation only after separate approval.
- [ ] Reconcile and push the approved private branch without force-push only after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve supplier or payment-provider research and contact separately.
- [ ] Approve contracts, accounts, credentials, provider mapping, payment instruments, and isolated sandbox verification separately.
- [ ] Certify collection, capture, deposit, hold, refund, chargeback, currency, tax, receipt, webhook, audit, privacy, security, support, and incident behavior separately.
- [ ] Approve migrations, deployment, and Production through their own later gates.

No release, supplier, processor, reservation, payment, hold, deposit, refund, chargeback, migration, deployment, or Production authority is created by this document.

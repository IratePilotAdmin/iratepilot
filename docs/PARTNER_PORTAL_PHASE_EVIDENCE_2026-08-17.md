# Phase 3 partner-portal software evidence — 2026-08-17

This record documents local software evidence for the partner portal and first-hotel operator workflow. It contains no hotel personal data, credentials, payment details, production authorization, or claim that a real partner completed acceptance.

## Verified portal surfaces

- Partner overview and portfolio summary.
- Guided partner and property onboarding.
- Property content, rooms, rates, and bounded future inventory.
- Reservation review and history.
- Guest/reservation messaging.
- Promotions, analytics, finance, subscription, and revenue tools.
- PMS and SynXis preparation without live supplier traffic.
- Team invitation, delegated hotel access, role restrictions, and access removal.

## Private-pilot progress separation

The onboarding model now reports two independent progress groups:

1. **Private-pilot preparation** — partner approval when applicable, one property, complete content, an active room type, and future inventory.
2. **Commercial activation** — publication and, for owners, payout readiness.

An inactive property with complete content, room, and future inventory can reach 100% private-pilot preparation without being labelled published, payout-ready, or commercially live. Delegated managers are not assigned owner-only approval or payout tasks.

## Authorization and safety evidence

- Partner APIs require partner or administrator roles.
- Property, room, inventory, reservation, finance, integration, invitation, and message access remains partner-scoped.
- Delegated managers can work only within their authorized inactive hotel organization.
- Delegated managers cannot publish, transfer properties, delete rooms or inventory, manage invitations, access billing/payouts, or activate suppliers.
- Past or oversized inventory ranges are rejected.
- Reservation decisions require safe explicit actions and preserve operational history.
- Publication and payout progress remain separate external gates.

## Automated evidence

- 138 targeted partner, property, inventory, reservation, messaging, and payout-safety tests passed across 33 files.
- The complete repository gate passed: ESLint, TypeScript, 936 tests across 220 files, and the optimized 110-route Next.js build.
- The onboarding model reaches 100% private-pilot preparation for a complete inactive hotel.
- The same hotel remains commercially incomplete until publication and applicable payout gates pass.
- Delegated-manager progress excludes owner-only commercial steps.

## Actions deliberately not performed

- No real hotel, partner, property, room, rate, inventory, reservation, invitation, or message was created.
- No Stripe Connect onboarding, subscription, payout, or transfer was started.
- No hotel was published.
- No supplier, PMS, CRS, or SynXis request was sent.
- No production database, environment, deployment, domain, or traffic flag changed.

## Remaining external acceptance

- A verified hotel representative must complete the real intake and authority review.
- The approved pilot partner must exercise the scoped portal in Preview and approve the operator experience using the [verified partner portal acceptance checklist](./hotel-manager-pilot/PARTNER_PORTAL_ACCEPTANCE_CHECKLIST.md).
- Any invitation email, Stripe Connect test onboarding, publication, live booking, payout, or supplier validation requires its separate approval gate.

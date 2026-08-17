# Roadmap and completion status

Last reviewed: 2026-08-17

iRatePilot is application-ready for a controlled private-pilot preview. It is not yet commercially complete: real inventory, public booking, live payments, partner payouts, and supplier traffic remain behind explicit release gates.

## Phase 1 — Curated inventory and lead capture

Status: **application work complete; pilot activation pending**

Completed in the repository:

- Public hotel and vacation-home discovery with clearly separated approved and demonstration inventory.
- Functional destination/date search, price and star filters, and result sorting.
- Source-aware property, room, rate, availability, rating, and booking disclosures.
- Contact and partner-application flows backed by Supabase when an authorized environment is configured.
- A shareable hotel-manager intake at `/hotel-intake` that collects verification-ready details without requesting credentials, guest data, government IDs, or payment information.
- Admin verification that requires an explicit authority/content review, matches the manager's registered business email, and creates one inactive property draft without publishing it.
- Draft property, room, rate, future-inventory, partner-review, and scoped manager workflows.

Remaining activation gates:

- Configure and verify the authorized Supabase preview environment.
- Run the commercial sandbox preflight and preview acceptance checks.
- Apply migration `202608170062` to an authorized preview database, then complete the first pilot-hotel intake and keep its draft inactive until separately approved.
- Verify contact and partner-application submissions, support routing, and transactional email in preview.

## Phase 2 — Live booking and payments

Status: **implemented behind safety gates; commercial activation incomplete**

The repository includes booking requests, approved-reservation checkout, Stripe test and live-mode guards, refunds, webhook reconciliation, and payout controls. Public booking and live money movement must remain disabled until supplier, Stripe, legal, support, and end-to-end sandbox evidence is approved.

Required external gates are maintained in `docs/DEPLOYMENT.md`, `docs/PAYMENTS.md`, and `docs/COMMERCIAL_SANDBOX_TEST_PLAN.md`.

## Phase 3 — Partner portal and revenue tools

Status: **application work substantially complete; first-partner validation pending**

The partner portal includes onboarding, properties, rooms, rates, inventory, reservations, promotions, analytics, finance, messaging, team access, subscription controls, PMS preparation, and revenue recommendations. Completion requires a verified pilot partner to exercise these workflows in preview and approve the operator experience.

## Phase 4 — Broader supplier connectivity

Status: **integration framework complete; vendor certification pending**

The repository includes guarded supplier adapters, PMS credential storage, readiness checks, SynXis certification evidence, and production-traffic authorization. No live supplier traffic is authorized. Completion depends on vendor-issued credentials, approved endpoint mappings, sandbox certification, operational support contacts, and a separate production activation decision.

## Overall completion rule

Repository completion means `npm run check` passes and every public surface accurately describes its current mode. Commercial completion additionally requires all provider, data, legal, operational, and production release gates to be satisfied with recorded evidence. Software readiness must never be treated as authorization to enable live transactions.

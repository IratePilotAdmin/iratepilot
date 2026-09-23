# Flight route decision required before commercial activation

Status: **owner decision required**

The current implementation and the historical decision record disagree about the staged provider order. No route is enabled, and no Production, booking, payment, ticketing, or provider traffic is authorized.

## Choose one current direction

### Option A — Duffel primary, Sabre secondary

Matches the recorded staged provider-path decision in `docs/FLIGHTS_PROVIDER_PATH_DECISION_2026-08-19.md` and the current Duffel credential work. This still requires Duffel contract, ticketing, settlement, security, support, Sandbox certification, and release evidence before activation.

### Option B — Sabre primary, Duffel secondary

Matches the current route-planning code at `lib/flights/rollout-route-decision.ts`. This still requires Sabre contract, ticketing, settlement, security, support, Sandbox certification, and release evidence before activation.

### Option C — Keep both deferred

Leave both paths unassigned and continue with no live provider route.

## Decision boundary

Selecting A or B only reconciles planning state. It does **not** accept a contract, authorize provider contact, store credentials, enable traffic, deploy, book, ticket, charge, or launch consumers. Those remain separate gates requiring attributable evidence and explicit approvals.

Until one option is recorded, the route remains `owner_reconciliation_required` and Production promotion is prohibited.

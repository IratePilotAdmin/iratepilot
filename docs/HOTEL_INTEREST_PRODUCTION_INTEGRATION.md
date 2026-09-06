# Hotel interest integration

This package adds the short hotel interest lane to production source commit
`8ef5a8caa46050a72ce63aa071c50d05ecfe5eec`. It is a local integration for review.

## Behavior

- `HOTEL_MANAGER_INTEREST_INTAKE_ENABLED` must equal `true` on the server to
  display the short form and accept its requests. Missing or other values keep
  `/hotel-intake` paused and its interest endpoint at HTTP 503.
- `/partner` directs visitors to `/hotel-intake` instead of displaying the old
  full application. `/api/partners/apply` returns HTTP 503 with `no-store`,
  without reading the body or writing to the database. The old
  `HOTEL_MANAGER_APPLICATION_INTAKE_ENABLED` flag cannot reopen it in this package.
- Interest submissions use the existing `contact_messages` table. They create
  private leads only. Support can filter these leads and record case status;
  contact, status-change, and intake forms confirm only recognized receipts.
- The contact endpoint rejects the reserved hotel-interest message prefix, so
  general contact submissions cannot label themselves as hotel intake.

No migration, full application RPC, commercial onboarding, capture evidence,
flight code, flight configuration, dependency manifest, or lockfile is changed.
The retained full-application component/schema are unused by public pages and
are not an approved path for reopening full applications.

## Local verification

With the production lockfile dependencies installed and no service credentials:

```text
npx vitest run --config vitest.hotel-interest-integration.config.mts
npx tsc --noEmit --incremental false
```

The scoped suite covers interest validation and route behavior, receipt handling,
contact boundaries, Support authorization/filtering/pagination/status updates,
rendered intake modes, the closed legacy route, and selected unchanged flight
runtime and support checks. Its setup prevents fetch traffic; SDK interactions
use synthetic responses. Tests do not establish deployed database or access
readiness.

## Before any deployment or sharing

1. Review the exact patch against the then-current production commit. If flight
   production has advanced, refresh the integration and repeat relevant checks.
   Preserve and revalidate any flight policy/cohort/commit bindings for a new
   deployment; unchanged flight files alone do not prove a new release is ready.
2. Deploy to an approved Preview with interest intake off. Confirm the paused
   page, closed legacy endpoint, and existing flight behavior in that environment.
3. Verify the existing contact table, admin-only Support access, and staged
   request throttling. Enable only the short interest flag in that Preview and
   confirm one authorized test lead reaches Support before considering release.
4. Resolve the current local network's HTTPS inspection trust problem through
   its network owner, then verify the public custom-domain flow on a trusted
   connection. Do not disable TLS verification as a substitute.

The 100-open-lead capacity check and duplicate lookup are separate database
operations. They reduce routine duplicates and overfill but are not atomic
guarantees under simultaneous submissions. Broad public sharing needs a reviewed
abuse-control plan; database-enforced concurrency controls are outside this
migration-free package.

Full hotel application and transaction readiness remain separate. The pending
independent review/evidence work is not satisfied by this interest integration.

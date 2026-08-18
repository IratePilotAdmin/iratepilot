# iRatePilot Automation Operations Center — Phase 4

Status: Local implementation complete; migrations 064–066, Preview release, and authenticated acceptance pending separate approval

Phase 4 adds service-level objectives, internal escalation ownership, and scheduled provider-health observation. It records operational evidence only. The scanner cannot send notifications, invoke retry adapters, move money, mutate bookings, or contact a supplier.

## Delivered workflow

- Six immutable SLO policies for critical, warning, and review acknowledgment and resolution targets.
- One idempotent observation-only scan per UTC date.
- Append-only SLO evaluation history with `within_target`, `at_risk`, and `breached` states.
- Internal escalation creation when an SLO is breached and automatic resolution when the source incident reaches its policy checkpoint.
- Admin-only acknowledgment with a sanitized, immutable operator receipt.
- Provider-health snapshots derived from existing email, Stripe, PMS, and SynXis ledgers without contacting those providers.
- A Hobby-compatible Vercel Cron schedule at 08:15 UTC.
- A fail-closed scanner route that requires `CRON_SECRET` and `AUTOMATION_POLICY_SCANNER_ENABLED=true` before the database function can run.
- Graceful Phase 1–3 operation when migration 066 is absent.

## SLO policy baseline

| Severity | Acknowledgment at risk / breach | Resolution at risk / breach |
| --- | --- | --- |
| Critical | 10 / 15 minutes | 90 / 120 minutes |
| Warning | 45 / 60 minutes | 360 / 480 minutes |
| Review | 180 / 240 minutes | 1080 / 1440 minutes |

These are internal operator targets, not customer promises or contractual service-level agreements. Changing them requires a later migration and review.

## Database boundary

Migration `202608170066_automation_slo_escalations.sql` adds:

- `automation_escalation_policies` for the fixed policy baseline;
- `automation_policy_scans` for the idempotent daily scan record;
- `automation_slo_evaluations` for append-only incident timing evidence;
- `automation_provider_health_snapshots` for append-only internal-ledger health evidence;
- `automation_escalations` for current internal ownership state; and
- `automation_escalation_events` for immutable detection, acknowledgment, and resolution receipts.

All tables have row-level security enabled and expose no direct access to `anon` or `authenticated`. The scheduled scan function is executable only by `service_role` and re-checks `auth.role()` before reading or writing. The acknowledgment function is executable only by authenticated users and re-checks the administrator profile inside the transaction.

## Scheduling boundary

Vercel Cron runs only on Production deployments. The checked-in schedule alone does not authorize a scan. The route returns a disabled response unless `AUTOMATION_POLICY_SCANNER_ENABLED=true` is separately configured, and it rejects requests without the correct bearer `CRON_SECRET` before creating a service-role client.

Preview deployment cannot exercise Vercel Cron automatically. Preview acceptance should call neither the cron endpoint nor the scan function until migration 066 and a controlled manual test are separately approved.

## Actions deliberately excluded

- External notification, paging, email, SMS, or support-message delivery.
- Workflow DevKit installation or durable executor startup.
- Email, webhook, payment, refund, transfer, payout, or booking retries.
- Booking, inventory, publication, partner, or hotel-manager mutations.
- PMS, CRS, SynXis, Stripe, Resend, or other provider requests.
- Feature-flag, credential, deployment, domain, or Production changes.
- Manual scan controls in the administrator UI.

## Verification gates

- [x] SLO policies are fixed, bounded, and immutable.
- [x] Scheduled scans are idempotent by UTC date and service-role-only.
- [x] The cron route authenticates and checks the disabled-by-default feature flag before service-role access.
- [x] SLO evaluations, provider-health snapshots, and escalation events are append-only.
- [x] Escalation acknowledgment re-checks administrator authorization and rejects sensitive text.
- [x] Provider health reads only existing internal ledgers and invokes no provider SDK or network request.
- [x] The UI exposes no manual scanner, external notification, retry, payment, or provider controls.
- [x] Full local repository verification passes: ESLint, TypeScript, 972 tests across 226 files, and the optimized 111-page Next.js build.
- [ ] Migrations 064–066 are separately approved and applied to the isolated Preview database only.
- [ ] Phase 2–4 changes are separately approved for commit and push.
- [ ] Preview deployment reaches `READY` and authenticated browser acceptance passes.

## Next phase

Phase 5 implements one locked internal email-outbox receipt adapter with inherited dual approval, idempotency, two kill switches, and no network or external side effects. Autonomous message delivery, money movement, publication, and supplier activation remain prohibited.

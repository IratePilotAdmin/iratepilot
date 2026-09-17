# Hotel partner recruitment release record

Reviewed: 2026-09-17

## Current release state

The guarded hotel-partner recruitment flow is live on the canonical Production
site. It may accept applications from authorized representatives of eligible
four- and five-star hotels and resorts. This release does not publish a hotel,
enable consumer booking, move money, activate payouts, or authorize supplier
traffic.

Verified hosted behavior:

- `/partners` and `/partners/register` are available on `www.iratepilot.com`.
- Account confirmation, sign-in, saved onboarding drafts, and submitted
  applications were accepted in hosted Preview before Production release.
- Application attribution is retained for recruitment campaign reporting.
- A new application queues the configured administrator alert without exposing
  a personal phone number on the public site.
- The administrator queue loads on Production and currently contains no pending
  real hotel application.
- Approval requires five explicit checks: legal business identity,
  representative authority, content rights, current commercial disclosure, and
  acknowledgement that approval creates only an inactive draft.
- Approval requires a substantive review note. Decisions and all five checks are
  recorded as append-only evidence.
- Authenticated users cannot execute either legacy review function. The current
  evidence-recording function is the only authenticated review path.
- The current fee schedule is 13% commission plus a mandatory 3% rewards
  contribution, stored as a 16% total hotel deduction. Earlier booking records
  retain their recorded schedules and amounts.

The reviewed hotel migration and rollback packages are `202609160139` through
`202609170144`. The final Production database check confirmed the eight-argument
review function, disabled legacy execute privileges, and the fifth evidence
column. The application release completed as Vercel deployment
`dpl_DXruDnhsfgQwoSY74vYSwfacX9Zu`, READY and aliased to
`https://www.iratepilot.com`.

The authenticated operational check returned `ready: true` with zero email
backlog, dead letters, webhook-processing failures, payout exceptions, or
suppression alerts, and with the email worker enabled.

## Closed software gates

- Public recruitment landing and short registration.
- Confirmed-email authentication and recovery acceptance.
- Private draft save, conflict handling, submission, and duplicate protection.
- Four- and five-star eligibility enforcement.
- Campaign attribution and applicant notification.
- Public personal-phone exclusion checks.
- Current fee disclosure in public, applicant, finance, and reservation views.
- Administrator review checklist, required notes, inactive-draft provisioning,
  immutable review evidence, and legacy-path revocation.
- Preview and Production builds, health checks, canonical alias, and operational
  readiness verification.

## Intentionally open external gates

These items cannot be completed by software work alone and remain fail-closed:

1. Receive and independently verify the first real hotel application.
2. Have the verified hotel operator accept the scoped portal workflow.
3. Obtain the selected PMS, CRS, franchise, or inventory supplier approval,
   credentials, property mapping, and certification evidence.
4. Complete the verified hotel's commercial agreement, legal review, tax and
   seller-of-travel requirements, cancellation and chargeback policy, and
   support ownership.
5. Complete Stripe live-account and Connect onboarding for the verified legal
   entity, then approve live webhooks, refunds, transfers, and payouts.
6. Load and review real rates and future inventory while the listing remains
   inactive.
7. Make separate recorded decisions for property publication, consumer booking,
   live payment acceptance, partner payouts, and supplier traffic.

The OpenAI Support database-recovery case is tracked separately and does not
change these hotel recruitment controls.

## Next trigger

No synthetic applicant should be created to advance this release. The next
hotel gate begins when the first eligible real hotel submits an application.
Until then, the acquisition funnel may remain public while all publication,
booking, payment, payout, and supplier controls stay disabled.

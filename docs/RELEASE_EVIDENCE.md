# iRatePilot Release Evidence Record

Use this document for PR #122 before changing it from draft to ready for review. Do not paste secrets, API keys, database URLs, customer data, or full payment identifiers.

## Release identity

- Release candidate commit:
- Preview deployment URL:
- Preview deployment status:
- Test date and time:
- Tester:
- Supabase project/environment:
- Stripe mode: test

## Database evidence

- [ ] Database backup completed
- [ ] `supabase/preflight_20260802.sql` completed
- [ ] All blocker queries returned zero rows or were resolved
- [ ] Migrations `202608020001` through `202608020025` applied in order
- [ ] `supabase/verify_schema.sql` completed
- [ ] `supabase/postflight_20260802.sql` completed
- [ ] All required Boolean checks returned true
- [ ] Row-level security verified

Record only summary evidence:

- Backup timestamp:
- Migration completion timestamp:
- Preflight result:
- Verification result:
- Postflight result:
- Exceptions or remediation:

## Environment evidence

- [ ] Supabase variables configured in the correct Vercel scopes
- [ ] Stripe test variables configured
- [ ] Stripe webhook endpoint and signing secret configured
- [ ] Resend variables configured, or email intentionally disabled and documented
- [ ] `CRON_SECRET` configured when the email worker is enabled
- [ ] `PILOT_MODE=true`
- [ ] `NEXT_PUBLIC_PUBLIC_BOOKING=false`
- [ ] Test checkout flags match the approved pilot plan
- [ ] No secrets are exposed to `NEXT_PUBLIC_*` variables

Environment exceptions:

## Automated validation

- GitHub Actions run:
- GitHub Actions result:
- Vercel deployment:
- Vercel result:
- Test suite result:
- Production build result:

## Critical smoke tests

Record PASS, FAIL, or NOT RUN and a brief evidence note.

| Workflow | Result | Evidence or issue |
| --- | --- | --- |
| Public search uses approved inventory |  |  |
| Customer account registration and login |  |  |
| Partner application and admin approval |  |  |
| Property, room, rate, and inventory setup |  |  |
| Customer booking request |  |  |
| Partner approves booking safely |  |  |
| Stripe test checkout |  |  |
| Webhook finalizes paid booking once |  |  |
| Customer confirmation and Trips display |  |  |
| Customer-partner booking messages |  |  |
| Unpaid confirmed cancellation |  |  |
| Paid cancellation and test refund |  |  |
| Inventory restored after cancellation |  |  |
| Rewards reversed correctly |  |  |
| Partner and admin data isolation |  |  |
| Transactional email worker authorization |  |  |
| Mobile and offline privacy behavior |  |  |

## Defects and accepted limitations

| Severity | Description | Owner | Resolution or accepted limitation |
| --- | --- | --- | --- |
|  |  |  |  |

No open Critical or High defects are allowed for release.

## Financial and operational restrictions

- [ ] Stripe remains in test mode
- [ ] Automated partner payouts remain disabled
- [ ] Demonstration inventory is not represented as real availability
- [ ] Refund and cancellation behavior is disclosed to pilot users
- [ ] Pilot support owner is identified
- [ ] Rollback owner is identified

## Decision

- Decision: GO / NO-GO
- Decision timestamp:
- Decision maker:
- Reason:
- Rollback trigger:
- Follow-up actions:

A GO decision requires every mandatory checkbox, all critical smoke tests passing, no unresolved Critical or High defect, and successful database and deployment verification.

# iRatePilot Release Ownership Matrix

This document defines accountable owners for the private-pilot release governed by PR #122.

## Current status

**NO-GO until every required role is assigned and acknowledged.**

A single person may hold more than one role during the private pilot, but each responsibility must still be explicitly assigned. No critical release function may be left unowned.

## Required owners

| Role | Named owner | Backup | Required acknowledgement | Authority |
| --- | --- | --- | --- | --- |
| Executive release owner |  |  |  | Final GO / NO-GO decision |
| Database operator |  |  |  | Run backup, preflight, migrations, verification, and postflight |
| Application release operator |  |  |  | Confirm exact commit, CI, Vercel deployment, and cutover |
| Payment test owner |  |  |  | Confirm Stripe test mode, checkout, webhooks, refunds, and reconciliation |
| Inventory integrity owner |  |  |  | Approve property, room, rate, and availability data |
| Security and privacy owner |  |  |  | Review access, secrets, data exposure, and incident response |
| Customer support owner |  |  |  | Handle invited tester support and escalation |
| Partner support owner |  |  |  | Handle hotel onboarding, inventory, and booking support |
| Incident commander |  |  |  | Coordinate Severity 0 and Severity 1 response |
| Rollback owner |  |  |  | Execute and verify rollback or workflow shutdown |
| Reconciliation owner |  |  |  | Confirm booking, payment, refund, reward, and inventory records align |

## RACI by release activity

| Activity | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Confirm final release commit | Application release operator | Executive release owner | Security owner | All owners |
| Verify GitHub Actions and Vercel | Application release operator | Executive release owner | Security owner | Support owners |
| Create and verify Supabase backup | Database operator | Executive release owner | Rollback owner | Application operator |
| Run database preflight | Database operator | Executive release owner | Application operator | Rollback owner |
| Apply migrations | Database operator | Executive release owner | Application operator, rollback owner | Support owners |
| Run schema and postflight checks | Database operator | Executive release owner | Security owner | All owners |
| Approve pilot inventory | Inventory integrity owner | Executive release owner | Partner support owner | Payment owner |
| Run test checkout and webhook tests | Payment test owner | Executive release owner | Application operator | Reconciliation owner |
| Run cancellation and refund tests | Payment test owner | Executive release owner | Inventory and application owners | Reconciliation owner |
| Complete smoke test | Application release operator | Executive release owner | All functional owners | Pilot participants |
| Decide GO / NO-GO | Executive release owner | Executive release owner | All owners | Pilot participants |
| Pause booking or inventory | Incident commander | Executive release owner | Relevant functional owner | Support owners |
| Execute rollback | Rollback owner | Executive release owner | Database and application operators | All owners |
| Close daily reconciliation | Reconciliation owner | Executive release owner | Payment and inventory owners | Support owners |

## Required acknowledgements

Before the private pilot can receive a GO decision, each named owner must confirm:

- they understand their assigned duties;
- they have access to the tools required for their role;
- they know the escalation and rollback process;
- they will not expose credentials or customer information in GitHub;
- they understand that Stripe remains in test mode;
- they understand that public booking and automated partner payouts remain disabled;
- they are available during the approved execution and support window.

## Separation-of-duty expectations

When another qualified person is available:

- the person applying database migrations should not be the only person verifying the results;
- the person implementing a payment or refund change should not be the only person reconciling it;
- the final GO approver should review evidence produced by the operational owners;
- the rollback owner should not approve an untested rollback plan alone.

For a one-person private pilot, document that the same person holds multiple roles and add an independent evidence review before expanding beyond the first cohort.

## Escalation authority

Any of the following roles may immediately recommend a workflow pause:

- database operator;
- payment test owner;
- inventory integrity owner;
- security and privacy owner;
- incident commander;
- reconciliation owner.

The incident commander may pause the affected workflow immediately. The executive release owner decides whether to continue, restrict, or stop the entire pilot after reviewing the available evidence.

## Sign-off record

Complete this section for the exact release commit.

- Release commit SHA:
- Review date and time:
- Executive release owner decision:
- Database owner sign-off:
- Application release owner sign-off:
- Payment owner sign-off:
- Inventory owner sign-off:
- Security owner sign-off:
- Support owner sign-off:
- Rollback owner sign-off:
- Reconciliation owner sign-off:
- Open exceptions:
- Final decision: **NO-GO / GO FOR PRIVATE PILOT ONLY**

## Completion gate

Do not mark PR #122 ready for review or merge until:

1. every required role has a named primary owner;
2. critical roles have a backup or a documented one-person exception;
3. required acknowledgements are recorded;
4. the exact release commit is listed;
5. all owners have reviewed the applicable runbooks;
6. the written decision is GO for private pilot only.

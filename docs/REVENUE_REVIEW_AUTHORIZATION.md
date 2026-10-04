# Supervisor review authorization qualification

Migration `20260930143701_revenue_review_authorization_lock.sql` is applied to the actual PMS database and belongs in `pms-migrations/`, outside the OTA migration chain.

Previously, the review RPC checked manager access before waiting for the property advisory transaction lock. A membership demotion or removal committed during that wait could leave the request authorized by an obsolete check.

The function now re-reads the caller's membership and property after acquiring the advisory lock, requires an owner or manager role, and uses `FOR SHARE OF m,p` to retain those authorization rows until transaction completion. This check precedes receipt replay as well as issue mutation. Demotion, removal and property deletion cannot complete between that check and commit; changes committed before the check are denied. Existing revision and request-identity guards remain in place. The lock order is property advisory lock, then authorization rows, then issue row. Existing membership removal does not take the property advisory lock.

## Database verification

`scripts/qualify-revenue-review-authorization.sql` creates an isolated tenant, property and membership for an existing owner, then rolls back all fixture writes through a caught subtransaction sentinel. It passed against the deployed function:

| Case | Result |
| --- | --- |
| Authorized claim | Revision advanced to 2 |
| Same request retry | Stored receipt replayed |
| Retry after demotion to staff | Access denied, SQLSTATE 42501 |
| Request after membership removal | Access denied, SQLSTATE 42501 |
| Request without identity | Access denied, SQLSTATE 42501 |

A separate committed isolated fixture allowed two temporary pg_cron workers to run on independent database connections. One worker held the property advisory lock, demoted only the test membership and held its transaction for four seconds. The review worker began one second later, saw the still-committed owner membership in its initial check, and waited for that lock.

| Worker | Start (UTC, September 30, 2026) | Finish (UTC) | Result |
| --- | --- | --- | --- |
| Demotion transaction | 14:40:00.230428 | 14:40:04.238121 | Test membership became staff |
| Waiting review | 14:40:01.240255 | 14:40:04.240405 | Access denied |

The issue remained open, unassigned and at revision 1, with no claim event. Both temporary jobs were unscheduled and the fixture events, issue, property, membership and tenant were deleted. Cleanup returned zero for each fixture category, with five actual properties remaining. No real membership or hotel rate was changed.

This verifies the controlled database demotion race and sequential removal checks. It does not qualify HTTP authentication, browser behavior, multiple real staff identities, every permission-changing operation, or concurrent portfolio-scale load. The pilot remains in shadow mode; signed PMS-to-OTA HTTP validation and forecast accuracy remain open, and rate writeback stays disabled.

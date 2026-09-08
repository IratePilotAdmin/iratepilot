# Named fee reconciliation

Migration 191 calculates resort, technology, cleaning and legacy fee targets from effective opening classifications, reads recorded fee history, and includes target balances and suggested adjustments in the forward preview. Approval stores the derived fee breakdown. Service close copies it to the forward entry, and ledger preparation preserves each fee category.

Existing approvals and entries gain nullable fee-bucket columns without backfilling historical attribution. Older aggregate adjustments remain unallocated. History counts approvals once, whether or not they have been posted. New approvals require the fee breakdown to reconcile to the aggregate fee adjustment and known category targets.

Local hotel/home tests exercise nonzero category corrections, uncategorized historical amounts, approval, service close, separate journal accounts, balanced posting and retry. Historical service entries are direct test fixtures. Installation testing covers rollback, preservation of an existing approval's original columns, aggregate-history fallback, and private helper access restrictions.

Not installed live. Remaining verification includes populated historical forward-entry preservation, concurrent changes, fee-only corrections without simultaneous tax changes, and frontend review/recovery controls. Full hotel launch acceptance is not established by these tests.

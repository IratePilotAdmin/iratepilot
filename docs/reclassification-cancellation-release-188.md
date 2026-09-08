# Unresolved category correction cancellation

Migration 188 adds an immutable cancellation record and a guarded cancellation endpoint for owners and managers. A cancelled request cannot later insert a category revision. An already saved revision cannot be cancelled; the caller must recover its receipt or submit a new reviewed correction. Repeating a cancellation returns the original result for its actor.

The endpoint and revision insertion serialize on the property lock. Native PostgreSQL tests against the numbered migration verify both cancellation-before-save and save-before-cancellation for hotel and whole-home fixtures. The combined concurrency test observes fourteen lock waits, including revision and invoice races. Separate tests verify staff denial, repeat cancellation, preservation of existing records, transactional installation rollback, and restrictions on direct application-role access.

This is locally verified, not installed in hosted Supabase. It does not cancel folio entries or invoices, and does not change guest balances. Frontend recovery/cancellation controls, deployment, and real-property acceptance remain required.

# Guest API security corrections — September 12, 2026

The live email-job claim function had browser execution privileges and no internal caller check. Its privileges were corrected to deny anon/authenticated and permit service_role. Independent live catalog verification returned false/false/true. Migration 202608140051 already expresses this policy; the cause of live divergence remains unresolved. A source search found no later migration explicitly granting this function to browsers.

The booking-message permission expression could evaluate to NULL when partner details were missing. The corrected expression uses IS NOT TRUE to reject an unrelated non-admin caller. Live replacement changed only this expression and retained existing function privileges. Independent catalog verification confirmed the new expression, absence of the old expression, and authenticated execution.

Migration 202609120220 records the booking correction and accepts an already-corrected installation. It rejects unexpected guard combinations rather than silently skipping them. The live correction was applied directly; this document does not claim migration-history reconciliation.

Local PostgreSQL tests exercised the actual function against a minimal rolled-back schema under the authenticated role: customer, administrator and approved owner succeed; unrelated users with missing partner, null owner/status or suspended partner fail without message writes. All 36 SQL permission combinations passed. The release migration was tested against both original and corrected definitions. These tests do not cover the complete hosted schema, HTTP delivery or concurrent partner revocation.

Run `supabase/verify/20260912_guest_api_security.sql` after deployment to check both saved protections without invoking either business function. This checks catalog state, not complete guest messaging or email-worker delivery. Those acceptance checks and the wider API review remain outstanding.

# Automation Operations Center Phase 5 synthetic check runbook

Status: Prepared; blocked until three independently authenticated Preview administrators and a separate execution approval are available

## Purpose and boundary

This runbook closes the optional Phase 5 acceptance gate with one labeled, internal, read-only receipt check. It applies only to the isolated Vercel project `iratepilotadmin-private-preview`, the alias `https://project-w1cin.vercel.app`, and its isolated Preview Supabase project. It never authorizes Production automation, message delivery, money movement, booking mutation, publication, payouts, or supplier traffic.

The only adapter is `email_outbox_receipt_check`. It reads at most the allowlisted status of one sanitized internal UUID and records an immutable `validated` or `blocked` receipt. It has no network access and cannot send or retry email.

## Hard prerequisites

- A separate approval explicitly names this one Preview-only synthetic check.
- Three independently authenticated Preview administrators are available: one requester and two different approvers. Never create a fictitious administrator to satisfy the quorum.
- The Operations API reports `safetyReady=true`, six of six safety locks engaged, the Phase 4 scanner disabled, and both Phase 5 kill switches disabled.
- The isolated Preview project and database identifiers are independently confirmed before every switch change.
- No Production environment variable, database, deployment, alias, or domain is in scope.
- A sanitized, clearly labeled synthetic UUID is selected. Do not use an email address, recipient, message body, credential, payment detail, guest detail, provider payload, or live operational identifier.

Abort if any prerequisite is missing.

## Prepared rehearsal

1. The requester creates and acknowledges a communications incident labeled `PHASE5-SYNTHETIC-RECEIPT-CHECK-YYYYMMDD` with no sensitive data.
2. The requester creates an `email_delivery_review` rehearsal using a generated non-existent version-4 UUID. The expected adapter result is `blocked`, proving the guardrail without reading an existing receipt.
3. Two other administrators independently approve the request. The requester must not approve their own request.
4. Complete the Phase 3 dry run and confirm the only result is `validated_no_executor` with no provider call.
5. Set `AUTOMATION_SANDBOX_EXECUTOR_ENABLED=true` only in the isolated Vercel project's Preview environment and create a fresh isolated Preview deployment. Never promote it to the main project or Production.
6. After the deployment is `READY`, enable only the Preview database row for `email_outbox_receipt_check`. Reconfirm `network_access=false` and `external_side_effects=false`.
7. Run the internal receipt check once. Expect one immutable `blocked` execution and event stating that no message was sent.
8. Immediately set the database registry row back to `enabled=false` and verify the effective executor becomes locked.
9. Restore `AUTOMATION_SANDBOX_EXECUTOR_ENABLED=false` in Preview, redeploy, and verify both switches and the effective state are disabled.
10. Resolve the labeled incident with a sanitized note and preserve the immutable retry and execution receipts as evidence.

## Relock verification

Acceptance is incomplete until the application and database switches are disabled, the executor is locked, the Phase 4 scanner is disabled, all six safety locks are engaged, and the execution count increased by exactly one. The receipt must record `blocked`, `message_sent=false`, `money_moved=false`, `external_side_effect_created=false`, and `network_accessed=false`. Production configuration and traffic must remain unchanged.

Record the deployment ID, sanitized incident/retry/execution IDs, operator roles, timestamps, result, and relock confirmation in the Preview evidence document. Never record passwords, tokens, environment values, emails, or provider data.

## Immediate abort and rollback

Stop before execution and relock any enabled switch if fewer than three independent administrators are available; the target cannot be proven isolated; any Production target is selected; a safety lock is disengaged; the scanner is enabled; the request lacks two approvals or a completed dry run; the adapter reports network access or external side effects; or the target contains sensitive or live operational data.

Relock the database switch first, restore the Preview application flag to false, redeploy, and verify the authenticated API before recording the rehearsal as complete.

# Native ARI shadow receiver

The OTA default branch lacked `/api/pms/ari`. This change prepares a signed, read-only receiver at that path. It is disabled unless `IRP_NATIVE_ARI_RECEIVER_MODE=validate_only` and a server-only `IRP_NATIVE_ARI_RECEIVER_SIGNING_SECRETS` JSON map is configured. Do not place actual credentials in this document, browser variables, commits or test output.

POST authenticates HMAC-SHA256 over `timestamp.connectionId.rawBody`, checks a five-minute timestamp window, binds the connection header to the signed body, bounds streamed payloads to 256 KiB, and validates the narrow USD ARI envelope. Unsupported restriction flags, non-default stay rules, unknown tax/fee fields, duplicate updates and invalid prices are rejected. Database access occurs only after authentication and contract checks.

The service-role-only RPC binds the source PMS property and canonical connection to one enabled sandbox destination. It reads destination room BAR identities and existing nightly price, availability, separate tax and mandatory-fee amounts. It reports whether the proposed values match the stored values. It executes no inventory, room, price or reservation mutation. Missing inventory remains missing evidence.

Responses say `outcome=validated`, `persisted=false`, `certified=false`. They never acknowledge `applied` or `duplicate`; the existing outbound transport therefore cannot mark a validation-only result as successful delivery. An equal pre-existing target value is not proof that this request applied a write.

The database migration was applied to the OTA project for read-only SQL verification. HTTP deployment and signing configuration are still pending. Receiver tests cover authentication, expiry, tampering, scope mismatch, malformed and oversized payloads, restrictions, duplicate updates and refusal of forged write-success receipts. Database checks cover property authorization, direct RPC permissions, comparison with actual destination values, mismatched proposals and unchanged inventory in a read-only transaction.

Next release gate: deploy and configure validation mode in the intended test environment, run a signed sender-to-receiver-to-database check, and retain its readback evidence. Actual transactional writes, durable replay/ordering control, price/tax/fee semantics certification, controlled write/readback testing, the sender outbox migration and worker configuration remain separate gates. Revenue AI writeback stays disabled. This change does not reopen Red Roof or activate commercial inventory.

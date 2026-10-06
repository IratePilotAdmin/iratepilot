# Isolated HTTP receipt recovery and duplicate compensation

The audited HTTP suite now contains 28 cases. The owner write commits, then a
deterministic synthetic exception discards its successful reply at the client
boundary. A separate Auth-issued saved-status request recovers the exact owner
receipt without another apply request. Subsequent price/version readback and
administrative audit verify the stored effect.

The first compensating restoration is submitted simultaneously twice, using the
same immutable request, reviewed version, caller and payload. The suite requires
one fresh receipt and one replay with the same saved timestamp. PMS readback must
show the starting $140 price at version 4; the independent audit must still find
three total decisions/actions for the complete owner/manager/compensation sequence.

This extends the existing expiring synthetic-only fixture; setup and cleanup
remain unchanged. Genuine test credentials remain in the protected environment.
No Red Roof, OTA or production interface write path is activated.

The discarded reply is a controlled client-boundary fault after the HTTP response
arrives, not evidence of a real network interruption or not-found-then-late-commit
race. Simultaneous client dispatch proves duplicate-request behavior for this
run, not deterministic PostgreSQL lock-overlap timing or competition with other
reservation, capacity or membership mutations. The branch is a reduced pricing
qualification schema, not certified complete production parity.

Before execution, verify the exact reviewed draft head and fresh isolated fixture.
Require all 28 cases and the existing independent audit to pass, then run scoped
cleanup and verify disabled execution ACLs and original function hashes.

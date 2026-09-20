# Flight Consumer Production Offer-Reference Encryption and Retention Gate 117

Gate 117 supplies the route-free encryption-only adapter required by Gate 116 and
a bounded database purge for expired encrypted offer references. It does not add a
route, scheduler, decrypt operation, Duffel call, Stripe call, booking authority,
payment authority, or consumer exposure.

The adapter is disabled unless its exact enable flag is `true`. It requires distinct,
canonical base64url 32-byte AES and HMAC keys plus a bounded key version. Every call
uses a random 12-byte IV and AES-256-GCM with a 16-byte tag. The authenticated-data
bytes exactly bind the Gate 116 admission receipt, subject, request, local/source
evidence, projection, offer expiry, and fixed key version. The canonical base64url
envelope contains only the algorithm, IV, tag, ciphertext, key version, and format
version. A separately keyed HMAC-SHA256 binds its domain, complete envelope, AAD,
plaintext provider reference, and key version. The adapter logs and persists no
plaintext and implements no decryption.

Migration 117 changes only the Gate 116 vault trigger from UPDATE/DELETE refusal to
UPDATE refusal. Direct table privileges remain revoked and forced RLS remains active.
The sole service-role security-definer purge locks and deletes at most 500 rows whose
trusted retention expiry has passed, using `SKIP LOCKED`. A non-empty purge creates
one append-only digest/count receipt and returns only its UUID, count, trusted time,
and explicit false authorities. An empty purge creates no receipt and returns no
ciphertext or digest.

Rollback refuses after any purge receipt exists. An evidence-free rollback drops the
purge surface and restores UPDATE/DELETE immutability on the vault.

Remaining launch prerequisites are externally provisioned encryption/HMAC keys, a
reviewed scheduler invocation, key rotation/retirement operations, and a separately
reviewed decrypt capability at the later booking gate. Gate 105 also has a surfaced
PostgreSQL output-variable ambiguity in its source-recording RPC and requires a new
forward repair before live shopping can invoke Gates 116–117 end to end.

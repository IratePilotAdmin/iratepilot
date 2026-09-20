# Flight Consumer Production Public-Offer Projection Gate 116

Gate 116 converts one already-recorded Gate 105 Duffel response into a bounded,
consumer-safe offer projection while preserving the provider offer reference only
as authenticated ciphertext. It is route-free and transport-free. It does not call
Duffel or Stripe, decrypt a reference, expose an offer to a consumer, create an
order, charge, capture, refund, ticket, service, retry, or release anything.

The composite service-role RPC revalidates the exact Gate 115 admission ID and
receipt, its distinct execution/policy/admission-policy/cohort/subject/idempotency/
request bindings, admitted budget claim, unexpired claim for first creation, and
all thirteen explicit false authority axes. Exact completed replays are recoverable
without extending the expired admission claim. It independently reconstructs the
Gate 115 normalized public request digest and the distinct Gate 101 canonical Duffel
request-body digest, then binds the Gate 105 raw-response digest and accounts for
every recorded offer source exactly once.

Five forced-RLS, no-direct-grant, append-only tables store the batch, complete source
dispositions, safe offers, normalized segments, and encrypted reference mappings.
The safe read RPC is subject/admission/receipt/request bound and never returns a raw
provider identifier, ciphertext, source identity, or authority. Mapping retention is
fixed at seven days; public presentation is capped at ten minutes and stops at least
two minutes before provider expiry.

Duffel may return a change/refund penalty in a currency different from the offer.
This gate intentionally refuses that offer instead of converting or presenting the
penalty. The conservative refusal is policy, not a malformed-provider assumption.

Encryption remains a separate injected port contract. Gate 117 now supplies a
default-off environment-key AES-256-GCM/HMAC adapter and a bounded service-role purge.
The port declares a fixed key version. The caller and SQL independently recompute AAD
over the admission, subject, request, local/source evidence, projection, expiry, and
key version, and independently hash the ciphertext before persistence.

Remaining operational blockers are Production secret provisioning, KMS/keyring-backed
rotation and retirement, a reviewed purge scheduler, backup crypto-shred evidence, and
a separately reviewed decrypt capability. Gate 117 does not add a route or authority.
Gate 105 also has a surfaced PostgreSQL output-variable ambiguity in its source-recording
RPC and requires a forward repair. Its row-only evidence cannot durably bind the response
digest for a legitimate zero-offer response; the planned source-batch header/completion
repair is therefore required before zero-offer live completion is trustworthy. Gate 116
rejects any non-empty same-attempt source set split across response digests.

Rollback is permitted only while all five evidence tables are empty. Migration 116
is Production-local and must not be applied or deployed by this engineering gate.

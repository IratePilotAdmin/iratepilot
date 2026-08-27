# Flight Consumer Production Public-Shopping Dispatch Gate 119

Gate 119 is a route-free, default-off dispatch foundation. Its composite service-role
RPC locks and revalidates one unexpired admitted Gate 115 receipt, derives a
per-admission Gate 101 idempotency binding, prepares and claims exactly one
`create_offer_request` attempt, and persists an immutable dispatch receipt in the
same transaction. Only the first created result carries the narrowly branded
one-time create-offer-request dispatch capability. Exact replays carry no dispatch
capability and can only read the already persisted Gate 116 safe projection.

The dispatch table is forced-RLS, has no direct grants, is append-only, and is unique
by admission, shopping attempt, shopping idempotency, and receipt. Every order,
Stripe, booking, payment, capture, refund, settlement, ticketing, servicing, consumer
release, consumer exposure, and blind-retry authority remains explicitly false.
Expired, refused, reused, or colliding admissions fail closed. Rollback refuses after
any dispatch evidence exists.

The server-only orchestrator uses an injected fetch and is disabled unless explicitly
enabled through its dedicated public-dispatch runtime. That runtime composes the exact
Gate 115 admission execution/policy/admission-policy/cohort bindings, requires the
mutually exclusive admin shopping-dark flag to remain false, and internally derives
the live credential/account-bound shopping scope from one immutable environment
snapshot. Account, credential, admission, policy, and cohort digests are compared in
constant time before any claim or fetch.
It sends the exact canonical Duffel v2
offer-request body to the fixed URL with redirects disabled, a 15-second abort, an
explicit `Accept-Encoding: identity`, an identity-only JSON response, and a 4 MiB
streaming limit. It hashes the untouched raw
bytes, records the complete Gate 118 source batch (including a legitimate zero-offer
batch), lists the exact sources, projects through Gate 116 with Gate 117 encryption,
persists completion, and returns only the subject-bound safe read. Request and raw
buffers are overwritten in every terminal path.

Network uncertainty is terminalized as ambiguous; a received response that cannot be
safely persisted is terminalized as failed. Neither case authorizes an automatic or
blind retry. This gate adds no route, UI, deployment, database apply, order, payment,
capture, or booking capability. Production token provisioning, explicit runtime
enablement, reviewed default repository wiring to the final Gate 118 interface, and
route/auth/rate-limit review remain later launch gates.

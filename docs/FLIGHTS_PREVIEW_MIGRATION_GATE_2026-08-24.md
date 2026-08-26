# Flight Preview migration gate — 2026-08-24

## Status

The guarded installer is implemented and locally verified for the applied flight baseline
068 through 080 and the collision-free canonical pending block 120 through 137. It is a
Preview-only, fail-closed operator gate. It does not encode a claim about the current remote
ledger; apply mode reads and validates that ledger at execution time. Production is
hard-blocked and was not contacted by the local verification described here.

Applying these migrations does not activate Consumer Preview or authorize provider traffic,
orders, payment capture, ticketing, email, Production deployment, or live booking. Migrations
126 through 137 require the runtime to be relocked before their changes can be installed.
The unpublished flight identifiers 081 through 098 are retired permanently. The colliding
identifier 082 remains owned by the separately published hotel agreement-evidence migration;
this flight-only gate never applies that file. Apply mode instead requires the exact hotel
082 file and rollback to be pinned locally and requires 082 to be an already-applied external
remote predecessor before any canonical flight migration can be pending.

## Fixed scope

- Approved Preview project ref: `eiqmdldjnedqgbtoozqa`
- Hard-blocked Production project ref: `allliumarkejinplrggl`
- Any non-empty configured Production ref is also blocked from matching Preview.
- Required repository baseline tip: `202608170067_automation_sandbox_executor.sql`
- Required remote flight baseline tip: `202608250080_flight_consumer_preview_activation_control.sql`
- Required external predecessor: the pinned, separately owned
  `202608250082_hotel_commercial_agreement_evidence.sql`, already present in the remote ledger.
- Accepted remote states: the complete flight baseline through 080, external hotel 082, and
  exactly one installed prefix of canonical migrations 120 through 137.
- Permitted pending states: only the corresponding exact suffix of 120 through 137, including
  the full 18-migration suffix and the empty suffix. Gaps, reordering, extra migrations, and
  every retired flight identifier 081 and 083 through 098 are rejected. Numeric 082 is
  accepted only as the exact pinned hotel-owned external predecessor.

The 31 flight migrations and 25 rollback artifacts for 074 through 080 and 120 through 137,
plus the external hotel 082 migration and rollback, are byte-pinned. Rollback files are
verified but never executed by this gate.

| Order | Migration | Migration SHA-256 | Rollback SHA-256 |
|---:|---|---|---|
| 1 | `202608230068_flight_commerce_foundation.sql` | `29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d` | — |
| 2 | `202608240069_flight_provider_request_attempts.sql` | `7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611` | — |
| 3 | `202608250070_flight_duffel_test_order_attempts.sql` | `882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe` | — |
| 4 | `202608250071_flight_duffel_preview_rpc_bridge.sql` | `bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d` | — |
| 5 | `202608250072_flight_duffel_preview_runtime_assertions.sql` | `b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b` | — |
| 6 | `202608250073_flight_duffel_claim_terminal_return.sql` | `b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045` | — |
| 7 | `202608250074_flight_consumer_preview_foundation.sql` | `c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98` | `128132c9bd3f0e78b5447b1ac37311d46c0882bae450aa92b9aa50d5f158d4f0` |
| 8 | `202608250075_flight_consumer_preview_orchestration.sql` | `3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49` | `d213a7b2a5ec793b2778564c989b694a7a260a8ea37a687e999e54041a572c67` |
| 9 | `202608250076_flight_consumer_preview_control_plane.sql` | `3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1` | `6204b1fcf01c56844f2d61bd588b8046830036c095b1e7e36bae663bdca06293` |
| 10 | `202608250077_flight_consumer_preview_async_finalization.sql` | `f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7` | `1d70dad494830705b0f3628a58930f30d9cab3f958abb6b502ce15da460326ce` |
| 11 | `202608250078_flight_consumer_notification_delivery.sql` | `187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb` | `ba64f007fa9be33b7f3c83fe3ab7ce5c0534e83f992559505b4d6b6579d53f19` |
| 12 | `202608250079_flight_consumer_preview_support_intake.sql` | `02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca` | `4d51f43824e047a3c1969777ff01d815ea44965b8324c6b12ef8ae8dbcfba0fb` |
| 13 | `202608250080_flight_consumer_preview_activation_control.sql` | `b84e6afc90e196cb1ab630512c145021af42a0f1b8d67d10bbaea2b8f63a420a` | `19b12c59e1da57613990e20bfff115023d25026b4adb250273b3ffd2f373c726` |
| 14 | `202608260120_flight_consumer_webhook_operational_escalation.sql` | `161cb8c088793c810a2133f2014886ef79768f3162fe5fc923f6bde79226ce99` | `b35d802921ee7878e4279e94c57230aad28ca49c5cc83437eff9fdb556602986` |
| 15 | `202608260121_flight_consumer_activation_cas_qualification.sql` | `0be59a48d010fad7537f285456ab14a12733150d51fe5c2d1d7437af3bd253ca` | `acbf756da48c09ce0b417ae0742892601b733cabeba7f29f47af07a88c9c1458` |
| 16 | `202608260122_flight_consumer_relock_settlement_constraint.sql` | `05d15d04f2b80c33417a7b91b8641bf671bc8a15deee8dc0886eba9dc6521b09` | `ffcb057921fa3a085cbfdf64ccc4481f2b7ad7c9d35b2c0e339f9dd52621b23c` |
| 17 | `202608260123_flight_consumer_search_repair.sql` | `903230c9c179567444932aeb190d6f24d6711e3b764425cbcd21a1d3b121057e` | `dbfaf2d116f3beedcb075220518d39eed02e5523626b60b6a65feda3a50d15fe` |
| 18 | `202608260124_flight_consumer_ciphertext_validation_repair.sql` | `6f869b730b0946ca1facd07758871928cddfe5229b6dea5080dbde311b2b23ba` | `2b11dcab3cc5a41f7cf92dcb7e1e993cd3c6b40145aabbaf8d7eabad1060ef79` |
| 19 | `202608260125_flight_consumer_reprice_projection_repair.sql` | `d2f03669e49b6d42557e7a8e73e195a7aff87f4d38210d0610a186b656db8773` | `c1dd412d4518148a633750b249467203285c82fe375e3dd6b2120470729ebbe3` |
| 20 | `202608260126_flight_consumer_capture_projection_repair.sql` | `6c3c9c3629d86402576e5ef360059c5a569ff7ab6c50776aebef06b32af31637` | `f65e48cd6014357d27ae212951dce10fb880a14cc9b0e62208bec5fe4986354d` |
| 21 | `202608260127_flight_consumer_order_ambiguity_semantics_repair.sql` | `be0e47e14679925edfc935af542439510d90fcc5975c725bd673332c859157b9` | `8cf6a87ef4c9cebaf16093afe5789c89b34822cb3a2e4e7a9d5147c4812b7eb7` |
| 22 | `202608260128_flight_consumer_order_recovery_hardening.sql` | `7a2ecd0ea11f008096978ee092059f7cea33ede46285f40370e8bd8799c48244` | `8ea7642d415cb6ea36bc5bc8b6db7c48be31944e10951ed3c782af44f272d5be` |
| 23 | `202608260129_flight_consumer_duffel_pending_webhook_link.sql` | `85d82ca534455a375b2a6073abb27825ef1b77d745189cca4f5f5e82454e4906` | `e2b1f3077a0b8575af90e9fd20b922f8157ab7cde2917cd8405b9fa7e6bb9692` |
| 24 | `202608260130_flight_consumer_completion_lease.sql` | `96994117e09984981ef10392b3c640b395baa843f4141bc622e4c3bcb3c8155c` | `338c1fad9ec26823d45c08b08d594f130fdf766b16f22080d844f0145cac79ab` |
| 25 | `202608260131_flight_consumer_terminal_recovery_safety.sql` | `95d4ffe8e1ac53ab237f16ece68c2ccfea63b06378cea9800b625b59e9d9993d` | `b8f5c8c8ecb809ff9b1e2e3738ec9874a6fc9bd38076fc1a07b22366e3b65dd7` |
| 26 | `202608260132_flight_consumer_capture_attestation_gate.sql` | `47262234052bd8370765d1b195d7f6e565c00b543fdebabf9818fe8ac669ca28` | `05932c2361eec67ebfd3374102ccf14a93a72c8cd844b7b5bdf54eb85b75359d` |
| 27 | `202608260133_flight_consumer_completion_lease_qualification_repair.sql` | `27b5b35ee8239f091c61a75dd7fcd7c3beb0c1eb5aa652ecf8ae96c73ddcf65e` | `8ece424d11710e37f7b998c4c308d5848d979462161f5faf44c89080b99345ec` |
| 28 | `202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql` | `bc568c1129737290f7ecb46f783e573ebcfbc8a0d9f64e2a3d9e2bd9445ab9b7` | `b113c99aec505319866840467262c7bee23efc0b56f662ba831bdfdbd7137eb5` |
| 29 | `202608260135_flight_consumer_completion_lease_recovery.sql` | `7a57a21709b3d979226987b10419694389fa2aef2428216ccc8ac915283e8fb4` | `f8ef205df51c9f5d0b671042fc51a341cf46ebfb9e5466c1d95149f2c1863930` |
| 30 | `202608260136_flight_consumer_terminal_offer_evidence_recovery.sql` | `89880fa51d3c997b8364b6663ef617a735c3eaf712348ee55a5eb295a11e91da` | `1d890c2ed74a3a2a8b37ee07f16f8f3d5781e0c63e8812ccae8811b878d94bd5` |
| 31 | `202608260137_flight_consumer_terminal_offer_local_identity.sql` | `09a89471334e6c25df324e54e242fef8a86416a278b3c37a19cb4d1f7986aeb8` | `438367c921f972db2c8736e06c39663f025931879e3655423025c984fd50a2db` |

The frozen repository schema mirror that accompanies migration 137 has SHA-256
`45a708d50c69d12458df7d12e5e9479044621d510023a76a6e8ef8ac28b1d8b8`.
The installer does not use that mirror hash as a substitute for its read-only post-apply
remote schema verification.

## Safety repairs in 126 through 137

- 126 repairs output-parameter-safe capture, terminal response, synchronous/async
  finalization, and refund projections.
- 127 makes ambiguous Duffel order outcomes converge to the correct review target while
  preserving exact captured-payment liability.
- 128 bounds create-order dispatch by refreshed offer authority, rechecks locked evidence at
  claim time, and returns explicit recovery deadline/evidence metadata.
- 129 adds append-only pending linkage and terminal resolution for a valid Duffel webhook that
  arrives while its exact create-order attempt is still dispatching.
- 130 adds a digest-only, order-scoped completion lease so HTTP idempotency keys coordinate
  one local owner, exact replay, bounded recovery, and no provider redispatch authority.
- 131 atomically projects adverse capture terminals into reconciliation, prevents Duffel
  dispatch while order/payment reconciliation is active, and permits terminal success replay
  from immutable retained evidence without minting new authority from a rotated provider
  binding. Its internal projector and predecessor functions remain ungranted.
- 132 adds a service-role-only, digest/categorical capture-attestation mismatch projector. It
  locks order, succeeded capture attempt, and payment in the shared order, attempt, payment
  sequence; rejects provider-order and processor-reference conflicts; preserves immutable
  provider success for terminal replay; and atomically moves the order/payment into review
  with an active reconciliation case before any Duffel claim can proceed.
- 133 forward-repairs the four 130 completion-lease RPCs after proving the exact predecessor
  source and UPDATE/predicate inventory. All six lease updates retain aliases, all 19 CAS
  predicates are relation-qualified, `#variable_conflict error` remains effective, execution
  stays service-role-only, the completion-lease table remains forced-RLS with no direct grants,
  and the Preview TEST runtime must be relocked before and after installation.
- 134 removes the one invalid `flight_offer_evidence_vault.deleted_at` predicate from the
  exact private 128 Duffel claim body. The repaired authority still requires exact refreshed,
  unexpired offer evidence and matching reprice identity; the public 131 reconciliation
  wrapper remains unchanged, and the private predecessor remains ungranted.
- 135 adds a service-role-only recovery RPC for an existing completion lease. It reuses the
  lease's immutable request digest, reclaims only a released or expired-processing lease,
  holds while provider or capture dispatch is active, preserves exact terminal replay, and
  always returns `provider_redispatch_authorized = false`.
- 136 repairs historical terminal convergence for an already-succeeded Duffel TEST order. It
  replaces invalid offer-vault field references, evaluates offer-evidence validity at the
  immutable provider dispatch instant, bounds recovery to seven days, requires a captured and
  unrefunded Stripe TEST payment plus retained original response evidence, and adds two
  service-role-only read boundaries without granting provider or payment redispatch authority.
- 137 adds one service-role-only, read-only projection for the durable `local_offer_id`. It
  first delegates the complete authorization decision to the exact migration-136 historical
  loader, then binds the returned evidence ID, offer ID, and receipt to the same vault row and
  returns only the stable local identity. Direct vault reads remain revoked, the predecessor
  source and ACL are pinned, and no encrypted evidence, provider/payment reference, mutation,
  or dispatch authority is exposed.

## Target and secret handling

The operator must inject:

- `PREVIEW_SUPABASE_PROJECT_REF=eiqmdldjnedqgbtoozqa`
- `PREVIEW_SUPABASE_DB_URL` for that exact Preview database
- `PRODUCTION_SUPABASE_PROJECT_REF`, when configured, identifying Production and never the
  approved Preview ref

Only official Supabase direct or pooler PostgreSQL URL shapes are accepted. The database must
be `postgres`, and the username must bind the exact approved Preview ref. Arbitrary hosts,
paths, query parameters, protocols, usernames, ports, and project refs are rejected.

The script removes the password from the derived CLI argument and passes it only through
`PGPASSWORD` and `SUPABASE_DB_PASSWORD` in a minimal child environment. It does not print the
URL, password, environment, or captured Supabase CLI output. It invokes the fixed `supabase`
executable with shell execution disabled.

## Operator procedure

Run from the repository root after the exact Preview environment is injected.

### Plan only

```text
node scripts/apply-flight-preview-migrations.mjs --plan
```

Plan mode validates the target metadata and all pinned local bytes, reports the 18-migration
canonical apply order and all 19 permitted pending suffixes, and performs no CLI, network, or
database action. If hotel 082 is absent locally, plan mode reports that apply blocker without
mutating anything.

### Apply with exact confirmation

Only after reviewing the plan and receiving the separate shared-Preview approval:

```text
node scripts/apply-flight-preview-migrations.mjs --apply-confirmation=PREVIEW_eiqmdldjnedqgbtoozqa_FLIGHT_120_137
```

No shorter `--apply` or `--yes` invocation exists.

## Apply sequence

1. Recheck every pinned migration and rollback byte, including the separately owned hotel 082
   predecessor artifacts. The gate never schedules hotel 082 itself.
2. Read the remote migration ledger.
3. Require local history to match the repository exactly.
4. Require the complete remote flight baseline through 080, the already-applied external
   hotel 082 predecessor, and one exact installed prefix of 120 through 137; derive the only
   permitted pending suffix. Reject remote retired flight identifiers 081 and 083 through
   098. Hotel 082 is exempt only in its pinned external-predecessor role.
5. If pending, run `supabase db push --dry-run` and require exactly that suffix, once each and
   in order.
6. Recheck the pins and remote ledger immediately before mutation. If a concurrent operator
   installed the complete suffix, skip the redundant push; any other change stops the gate.
7. If still pending, push only the approved suffix, then require the complete 120–137 ledger.
8. Take a read-only `public` schema dump and verify the targeted table/column contracts, exact
   RPC signatures, enabled and forced RLS, service-role-only function grants, absence of direct
   access to the new evidence tables, isolation of the internal 131 projector, and the narrow
   121–137 safety-body markers enforced by this gate.

If all 31 migrations are installed, the gate performs no push but still executes the physical
schema verification.

The schema result is a targeted physical boundary, not a byte-for-byte attestation of every
remote policy, function body, trigger, constraint, or ACL. Migration byte pins identify the
only files the gate may apply; broader catalog attestation remains a separate operational
gate.

## Failure and recovery boundary

The gate never repairs migration history, marks a migration applied, runs a rollback, accepts
a gap, or continues after verification failure. Preserve non-public operator evidence and
perform a separate incident review before remediation. Do not bypass the ledger or hash
checks.

## Local verification

`tests/flight-preview-migration-gate.test.ts` covers:

- exact historical 068–080 and canonical 120–137 migration and rollback bytes and order;
- exact Preview identity, official URL shapes, and Production refusal;
- default plan behavior and the sole apply confirmation;
- secret-safe summaries and child-process isolation;
- mandatory local and remote hotel-082 predecessor evidence, including missing/wrong local
  file and hash failures;
- every exact-prefix pending state for 120–137, including rejection of retired flight 081 and
  083–098 identifiers, gaps, extra versions, malformed ledgers, and local drift;
- exact ledger-derived dry-run files and order;
- fixed non-shell CLI sequencing and concurrent-install rechecks;
- post-apply table/column, RPC signature, RLS, targeted grant, internal-projector, terminal
  recovery, repaired Duffel claim evidence, no-provider-redispatch lease recovery, and
  immutable dispatch-time terminal offer-evidence recovery and durable local-identity proofs;
  and
- already-installed verify-only behavior.

The focused tests use an injected in-memory runner and do not contact Supabase or execute the
Supabase CLI.

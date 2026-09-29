import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_MIGRATION_VERSION =
  "202608260119" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_RPC =
  "claim_flight_consumer_live_public_shopping_dispatch_v1" as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const receipt = z.object({
  decision: z.enum(["created", "replay"]),
  dispatch_id: z.string().uuid(),
  shopping_attempt_id: z.string().uuid(),
  dispatch_receipt_sha256: sha256,
  attempt_state: z.enum(["dispatching", "succeeded", "failed", "ambiguous"]),
  attempt_revision: z.union([z.literal(1), z.literal(2)]),
  create_offer_request_dispatch_authorized: z.boolean(),
  provider_dispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  order_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
  blind_retry_authorized: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.create_offer_request_dispatch_authorized !== (value.decision === "created")) {
    context.addIssue({ code: "custom", path: ["create_offer_request_dispatch_authorized"],
      message: "Dispatch capability must be returned exactly once." });
  }
  if ((value.attempt_state === "dispatching") !== (value.attempt_revision === 1)) {
    context.addIssue({ code: "custom", path: ["attempt_revision"],
      message: "Attempt state and revision do not match." });
  }
  if (value.decision === "created"
    && (value.attempt_state !== "dispatching" || value.attempt_revision !== 1)) {
    context.addIssue({ code: "custom", path: ["attempt_state"],
      message: "A new dispatch must be the freshly claimed attempt." });
  }
});

export type FlightConsumerProductionPublicShoppingDispatchClaimInput = Readonly<{
  admissionId: string; admissionReceiptSha256: string;
  admissionExecutionScopeSha256: string; policySha256: string;
  admissionPolicySha256: string; cohortSha256: string; subjectSha256: string;
  admissionIdempotencySha256: string; publicRequestSha256: string;
  shoppingExecutionScopeSha256: string; shoppingIdempotencySha256: string;
  requestBodySha256: string; dispatchNotAfter: string;
}>;

export function createFlightConsumerProductionPublicShoppingDispatchPersistence(
  client: Readonly<{ rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown; error: unknown;
  }> }> = { async rpc(name, args) {
    const { data, error } = await createAdminClient().rpc(name, args);
    return { data, error };
  } },
) {
  return Object.freeze({
    routeExposed: false as const,
    async claim(input: FlightConsumerProductionPublicShoppingDispatchClaimInput) {
      let result;
      try {
        result = await client.rpc(FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_RPC, {
          p_admission_id: input.admissionId,
          p_admission_receipt_sha256: input.admissionReceiptSha256,
          p_admission_execution_scope_sha256: input.admissionExecutionScopeSha256,
          p_policy_sha256: input.policySha256,
          p_admission_policy_sha256: input.admissionPolicySha256,
          p_cohort_sha256: input.cohortSha256,
          p_subject_sha256: input.subjectSha256,
          p_admission_idempotency_sha256: input.admissionIdempotencySha256,
          p_public_request_sha256: input.publicRequestSha256,
          p_shopping_execution_scope_sha256: input.shoppingExecutionScopeSha256,
          p_shopping_idempotency_sha256: input.shoppingIdempotencySha256,
          p_request_body_sha256: input.requestBodySha256,
          p_dispatch_not_after: input.dispatchNotAfter,
        });
      } catch {
        throw new Error("Public shopping dispatch persistence is unavailable.");
      }
      const accepted = z.array(receipt).length(1).safeParse(result.data);
      if (result.error !== null || !accepted.success) {
        throw new Error("Public shopping dispatch persistence refused the claim.");
      }
      return Object.freeze(accepted.data[0]!);
    },
  });
}

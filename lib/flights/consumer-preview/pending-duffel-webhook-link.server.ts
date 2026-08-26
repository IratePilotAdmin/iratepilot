import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const boundedResolutionSchema = z.array(z.object({
  pending_link_id: uuidSchema,
  pending_revision: z.union([z.literal(0), z.literal(1)]),
  pending_state: z.enum(["pending", "linked", "review"]),
  order_id: uuidSchema.nullable(),
  customer_id: uuidSchema.nullable(),
  provider_attempt_id: uuidSchema.nullable(),
  order_status: z.string().nullable(),
  execution_scope_sha256: sha256Schema.nullable(),
}).strict()).max(8);

export type FlightConsumerPreviewPendingDuffelLinkResolutionPhase =
  | "post_terminal"
  | "post_finalization"
  | "terminal_response_recovery";

export async function resolveFlightConsumerPreviewPendingDuffelWebhookLinks(
  input: Readonly<{
    attemptId: string;
    phase: FlightConsumerPreviewPendingDuffelLinkResolutionPhase;
  }>,
) {
  const safePhase = [
    "post_terminal",
    "post_finalization",
    "terminal_response_recovery",
  ].includes(input.phase) ? input.phase : "invalid_phase";
  try {
    const identity = z.object({
      attemptId: uuidSchema,
      phase: z.enum([
        "post_terminal",
        "post_finalization",
        "terminal_response_recovery",
      ]),
    }).strict().parse(input);
    const { data, error } = await createAdminClient().rpc(
      "resolve_flight_consumer_duffel_pending_links_for_attempt_v1",
      {
        p_attempt_id: identity.attemptId,
        p_expected_terminal_revision: 2,
        p_max_links: 8,
      },
    );
    if (error) throw new Error("pending_link_local_cas_unavailable");
    boundedResolutionSchema.parse(data);
  } catch {
    // Order terminal/finalization state is authoritative. Association retry is
    // fail-open here and remains available through exact webhook replay.
    console.warn("[flight-consumer-preview:pending-webhook-link] resolution deferred", {
      phase: safePhase,
      category: "local_cas_unavailable",
    });
  }
}

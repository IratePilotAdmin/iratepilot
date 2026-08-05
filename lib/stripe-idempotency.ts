import { z } from "zod";

const attemptIdSchema = z.string().uuid();

export function getStripeIdempotencyContext(
  request: Request,
  scope: "booking" | "membership" | "partner-subscription",
  actorId: string,
) {
  const parsed = attemptIdSchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!parsed.success) return null;
  return {
    attemptId: parsed.data,
    idempotencyKey: `iratepilot:${scope}:${actorId}:${parsed.data}`,
  };
}

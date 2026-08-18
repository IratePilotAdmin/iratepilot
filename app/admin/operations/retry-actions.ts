"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { containsSensitiveIncidentContent } from "@/lib/admin/automation-workflow";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export type AutomationRetryActionResult = {
  ok: boolean;
  message: string;
};

const retryKinds = [
  "email_delivery_review",
  "stripe_event_reconciliation",
  "supplier_validation_review",
  "booking_operation_review",
] as const;

const safeText = (label: string, minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum, `${label} is too short.`)
  .max(maximum, `${label} is too long.`)
  .refine((value) => !containsSensitiveIncidentContent(value), `${label} appears to contain sensitive data.`);

const requestSchema = z.object({
  incidentId: z.string().uuid("Choose a valid acknowledged incident."),
  retryKind: z.enum(retryKinds),
  targetReference: safeText("Target reference", 2, 200),
  reason: safeText("Reason", 8, 1000),
});
const requestIdSchema = z.string().uuid("Choose a valid dry-run request.");

const failure = (message = "Check the dry-run request and try again."): AutomationRetryActionResult => ({
  ok: false,
  message,
});

function buildIdempotencyKey(input: z.infer<typeof requestSchema>) {
  return createHash("sha256")
    .update([
      input.incidentId,
      input.retryKind,
      input.targetReference.toLowerCase(),
    ].join(":"))
    .digest("hex");
}

export async function createAutomationRetryRequestAction(input: unknown): Promise<AutomationRetryActionResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return failure(auth.error);

  const idempotencyKey = buildIdempotencyKey(parsed.data);
  try {
    const { data, error } = await auth.supabase.rpc("create_automation_retry_request", {
      p_incident_id: parsed.data.incidentId,
      p_retry_kind: parsed.data.retryKind,
      p_target_reference: parsed.data.targetReference,
      p_reason: parsed.data.reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_retry_request_created", {
      requestId: data?.id,
      retryKind: parsed.data.retryKind,
      executionMode: "dry_run_only",
    });
    return { ok: true, message: "Dry-run request recorded. Two other/distinct administrator approvals are required." };
  } catch (error) {
    await reportOperationalError("automation_retry_request_create_failed", error, {
      retryKind: parsed.data.retryKind,
    });
    return { ok: false, message: "The dry-run request could not be recorded. Confirm the incident is acknowledged." };
  }
}

export async function approveAutomationRetryRequestAction(requestId: string): Promise<AutomationRetryActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return failure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("approve_automation_retry_request", { p_request_id: parsed.data });
    if (error) throw error;
    logOperationalEvent("info", "automation_retry_request_approved", {
      requestId: parsed.data,
      executionMode: "dry_run_only",
    });
    return { ok: true, message: "Independent approval recorded." };
  } catch (error) {
    await reportOperationalError("automation_retry_request_approval_failed", error, { requestId: parsed.data });
    return { ok: false, message: "Approval was not recorded. Requesters cannot approve their own request." };
  }
}

export async function cancelAutomationRetryRequestAction(requestId: string): Promise<AutomationRetryActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return failure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("cancel_automation_retry_request", { p_request_id: parsed.data });
    if (error) throw error;
    logOperationalEvent("info", "automation_retry_request_cancelled", { requestId: parsed.data });
    return { ok: true, message: "Dry-run request cancelled. Its approval history remains immutable." };
  } catch (error) {
    await reportOperationalError("automation_retry_request_cancel_failed", error, { requestId: parsed.data });
    return { ok: false, message: "The dry-run request could not be cancelled." };
  }
}

export async function recordAutomationRetryDryRunAction(requestId: string): Promise<AutomationRetryActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return failure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("record_automation_retry_dry_run", { p_request_id: parsed.data });
    if (error) throw error;
    logOperationalEvent("info", "automation_retry_dry_run_validated", {
      requestId: parsed.data,
      executionMode: "dry_run_only",
      externalActionInvoked: false,
    });
    return { ok: true, message: "Dry-run validation recorded. No executor or external provider was invoked." };
  } catch (error) {
    await reportOperationalError("automation_retry_dry_run_failed", error, { requestId: parsed.data });
    return { ok: false, message: "Two distinct approvals are required before dry-run validation." };
  }
}

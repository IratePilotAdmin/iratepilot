"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export type AutomationExecutorActionResult = {
  ok: boolean;
  message: string;
};

const requestIdSchema = z.string().uuid("Choose a valid approved dry-run request.");

export async function runEmailOutboxReceiptSandboxAction(
  retryRequestId: string,
): Promise<AutomationExecutorActionResult> {
  const parsed = requestIdSchema.safeParse(retryRequestId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Choose a valid request." };
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return { ok: false, message: auth.error || "Administrator authorization required." };
  if (process.env.AUTOMATION_SANDBOX_EXECUTOR_ENABLED !== "true") {
    return { ok: false, message: "The application sandbox-executor kill switch is disabled." };
  }

  try {
    const { data, error } = await auth.supabase.rpc("run_email_outbox_receipt_sandbox", {
      p_retry_request_id: parsed.data,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_email_receipt_sandbox_completed", {
      executionId: data?.id,
      retryRequestId: parsed.data,
      executionMode: "internal_read_only_sandbox",
      externalSideEffect: false,
    });
    return {
      ok: true,
      message: data?.status === "validated"
        ? "Internal email receipt validated. No message was sent."
        : "Receipt check was blocked because the sanitized outbox reference was not found.",
    };
  } catch (error) {
    await reportOperationalError("automation_email_receipt_sandbox_failed", error, {
      retryRequestId: parsed.data,
    });
    return { ok: false, message: "The sandbox check is locked or the request is not eligible." };
  }
}

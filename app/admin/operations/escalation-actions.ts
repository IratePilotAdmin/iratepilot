"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { containsSensitiveIncidentContent } from "@/lib/admin/automation-workflow";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export type AutomationEscalationActionResult = {
  ok: boolean;
  message: string;
};

const escalationIdSchema = z.string().uuid("Choose a valid escalation.");
const noteSchema = z.string().trim().min(2, "Acknowledgment note is too short.").max(500, "Acknowledgment note is too long.")
  .refine((value) => !containsSensitiveIncidentContent(value), "Acknowledgment note appears to contain sensitive data.");

export async function acknowledgeAutomationEscalationAction(
  escalationId: string,
  note: string,
): Promise<AutomationEscalationActionResult> {
  const parsedId = escalationIdSchema.safeParse(escalationId);
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedId.success) return { ok: false, message: parsedId.error.issues[0]?.message || "Choose a valid escalation." };
  if (!parsedNote.success) return { ok: false, message: parsedNote.error.issues[0]?.message || "Check the acknowledgment note." };
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return { ok: false, message: auth.error || "Administrator authorization required." };

  try {
    const { error } = await auth.supabase.rpc("acknowledge_automation_escalation", {
      p_escalation_id: parsedId.data,
      p_note: parsedNote.data,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_escalation_acknowledged", { escalationId: parsedId.data });
    return { ok: true, message: "Escalation acknowledged with an immutable operator receipt." };
  } catch (error) {
    await reportOperationalError("automation_escalation_acknowledgment_failed", error, { escalationId: parsedId.data });
    return { ok: false, message: "The escalation could not be acknowledged." };
  }
}

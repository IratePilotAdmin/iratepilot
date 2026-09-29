"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { containsSensitiveIncidentContent } from "@/lib/admin/automation-workflow";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export type AutomationIncidentActionResult = {
  ok: boolean;
  message: string;
};

const safeText = (label: string, minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum, `${label} is too short.`)
  .max(maximum, `${label} is too long.`)
  .refine((value) => !containsSensitiveIncidentContent(value), `${label} appears to contain sensitive data.`);

const createSchema = z.object({
  title: safeText("Title", 8, 160),
  lane: z.enum(["communications", "bookings", "partners", "support", "payments", "suppliers"]),
  severity: z.enum(["review", "warning", "critical"]),
  sourceReference: z.string().trim().max(200).optional().default("")
    .refine((value) => !containsSensitiveIncidentContent(value), "Source reference appears to contain sensitive data."),
});

const incidentIdSchema = z.string().uuid("Choose a valid incident.");
const noteSchema = safeText("Note", 2, 2000);

function validationFailure(message = "Check the incident fields and try again."): AutomationIncidentActionResult {
  return { ok: false, message };
}

export async function createAutomationIncidentAction(input: unknown): Promise<AutomationIncidentActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return validationFailure(auth.error);

  try {
    const { data, error } = await auth.supabase.rpc("create_automation_incident", {
      p_title: parsed.data.title,
      p_lane: parsed.data.lane,
      p_severity: parsed.data.severity,
      p_source_reference: parsed.data.sourceReference || null,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_incident_created", {
      incidentId: data?.id,
      lane: parsed.data.lane,
      severity: parsed.data.severity,
    });
    return { ok: true, message: "Incident created. Acknowledge and assign it before resolution." };
  } catch (error) {
    await reportOperationalError("automation_incident_create_failed", error, { lane: parsed.data.lane });
    return { ok: false, message: "The incident could not be created." };
  }
}

export async function acknowledgeAutomationIncidentAction(incidentId: string): Promise<AutomationIncidentActionResult> {
  const parsed = incidentIdSchema.safeParse(incidentId);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return validationFailure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("update_automation_incident", {
      p_incident_id: parsed.data,
      p_action: "acknowledge",
      p_assignee_id: null,
      p_resolution_note: null,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_incident_acknowledged", { incidentId: parsed.data });
    return { ok: true, message: "Incident acknowledged." };
  } catch (error) {
    await reportOperationalError("automation_incident_acknowledge_failed", error, { incidentId: parsed.data });
    return { ok: false, message: "The incident could not be acknowledged." };
  }
}

export async function assignAutomationIncidentAction(
  incidentId: string,
  assigneeId: string | null,
): Promise<AutomationIncidentActionResult> {
  const parsedIncident = incidentIdSchema.safeParse(incidentId);
  const parsedAssignee = z.string().uuid().nullable().safeParse(assigneeId || null);
  if (!parsedIncident.success || !parsedAssignee.success) return validationFailure("Choose a valid incident and administrator.");
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return validationFailure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("update_automation_incident", {
      p_incident_id: parsedIncident.data,
      p_action: "assign",
      p_assignee_id: parsedAssignee.data,
      p_resolution_note: null,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_incident_assignment_changed", {
      incidentId: parsedIncident.data,
      assigned: Boolean(parsedAssignee.data),
    });
    return { ok: true, message: parsedAssignee.data ? "Incident assigned." : "Incident assignment cleared." };
  } catch (error) {
    await reportOperationalError("automation_incident_assignment_failed", error, { incidentId: parsedIncident.data });
    return { ok: false, message: "The incident assignment could not be changed." };
  }
}

export async function addAutomationIncidentNoteAction(
  incidentId: string,
  note: string,
): Promise<AutomationIncidentActionResult> {
  const parsedIncident = incidentIdSchema.safeParse(incidentId);
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedIncident.success) return validationFailure(parsedIncident.error.issues[0]?.message);
  if (!parsedNote.success) return validationFailure(parsedNote.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return validationFailure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("add_automation_incident_note", {
      p_incident_id: parsedIncident.data,
      p_note: parsedNote.data,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_incident_note_added", { incidentId: parsedIncident.data });
    return { ok: true, message: "Immutable incident note added." };
  } catch (error) {
    await reportOperationalError("automation_incident_note_failed", error, { incidentId: parsedIncident.data });
    return { ok: false, message: "The incident note could not be added." };
  }
}

export async function resolveAutomationIncidentAction(
  incidentId: string,
  resolutionNote: string,
): Promise<AutomationIncidentActionResult> {
  const parsedIncident = incidentIdSchema.safeParse(incidentId);
  const parsedNote = noteSchema.safeParse(resolutionNote);
  if (!parsedIncident.success) return validationFailure(parsedIncident.error.issues[0]?.message);
  if (!parsedNote.success) return validationFailure(parsedNote.error.issues[0]?.message);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return validationFailure(auth.error);

  try {
    const { error } = await auth.supabase.rpc("update_automation_incident", {
      p_incident_id: parsedIncident.data,
      p_action: "resolve",
      p_assignee_id: null,
      p_resolution_note: parsedNote.data,
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_incident_resolved", { incidentId: parsedIncident.data });
    return { ok: true, message: "Incident resolved with an immutable resolution note." };
  } catch (error) {
    await reportOperationalError("automation_incident_resolve_failed", error, { incidentId: parsedIncident.data });
    return { ok: false, message: "Acknowledge the incident before resolving it." };
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/read-bounded-json";

const statusSchema = z.object({ status: z.enum(["new", "in_progress", "resolved"]) });
const MAX_STATUS_BYTES = 1024;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid support case ID." }, { status: 400 });
    }
    const caseId = id.toLowerCase();

    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_STATUS_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "The support status update is too large." }, { status: 413 });
      }
      return NextResponse.json({ error: "The support status update must be valid JSON." }, { status: 400 });
    }
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid support status." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error, status: databaseStatus } = await admin.from("contact_messages")
      .update({ status: parsed.data.status })
      .eq("id", caseId)
      .select("id,status");
    if (error) throw error;
    // Keep the list representation: a missing response cannot prove zero updated rows.
    if (databaseStatus !== 200 || !Array.isArray(data)) {
      throw new Error("Support status receipt unavailable");
    }
    if (data.length === 0) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
    const updated = data[0];
    if (data.length !== 1 || !updated || typeof updated !== "object" || Array.isArray(updated)
      || typeof updated.id !== "string" || updated.id.toLowerCase() !== caseId
      || updated.status !== parsed.data.status) {
      throw new Error("Support status receipt does not match the requested update");
    }

    const message = parsed.data.status === "resolved"
      ? "Support case resolved."
      : parsed.data.status === "in_progress"
        ? "Support case marked in progress."
        : "Support case reopened.";
    return NextResponse.json({ data: { id: caseId, status: parsed.data.status }, message });
  } catch (error) {
    console.error("Admin support update failed", error);
    return NextResponse.json({
      error: "This status change could not be confirmed. Refresh cases to check its current status before trying again.",
    }, { status: 503 });
  }
}

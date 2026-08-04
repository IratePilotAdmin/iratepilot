import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const inboxLimit = 200;

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const messagesQuery = admin.from("contact_messages")
      .select("id,name,email,message,status,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(inboxLimit);
    const statusCount = (status: string) => admin.from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    const [messages, newCases, inProgressCases, resolvedCases] = await Promise.all([
      messagesQuery,
      statusCount("new"),
      statusCount("in_progress"),
      statusCount("resolved"),
    ]);
    const error = messages.error || newCases.error || inProgressCases.error || resolvedCases.error;
    if (error) throw error;

    return NextResponse.json({
      data: messages.data || [],
      summary: {
        total: messages.count || 0,
        new: newCases.count || 0,
        inProgress: inProgressCases.count || 0,
        resolved: resolvedCases.count || 0,
      },
      limit: inboxLimit,
      truncated: Number(messages.count || 0) > inboxLimit,
    });
  } catch (error) {
    console.error("Admin support inbox failed", error);
    return NextResponse.json({ error: "Support cases could not be loaded." }, { status: 503 });
  }
}

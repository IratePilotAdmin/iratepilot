import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueTransactionalEmail } from "@/lib/email/outbox";

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.user.email) return NextResponse.json({ error: "The admin account has no email address." }, { status: 409 });

  try {
    const admin = createAdminClient();
    const existing = await admin.from("email_outbox")
      .select("id")
      .eq("recipient_email", auth.user.email.trim().toLowerCase())
      .eq("template_name", "launch_delivery_test")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const job = existing.data ?? await queueTransactionalEmail({
        recipientEmail: auth.user.email,
        subject: "iRatePilot transactional email test",
        templateName: "launch_delivery_test",
        templateData: {
          recipient_name: auth.profile.full_name || "iRatePilot Admin",
          message: "This is the approved iRatePilot transactional email delivery test. No booking or payment was created.",
          action_url: "https://www.iratepilot.com/admin/settings",
        },
      });
    return NextResponse.json({
      data: { jobId: job.id, reusedPendingJob: Boolean(existing.data) },
      message: existing.data ? "Pending test email reused." : "Test email queued.",
    });
  } catch (error) {
    console.error("Admin email test failed", error);
    return NextResponse.json({ error: "The test email could not be queued." }, { status: 503 });
  }
}

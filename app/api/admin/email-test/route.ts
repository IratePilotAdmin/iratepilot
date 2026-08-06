import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { queueTransactionalEmail, wakeTransactionalEmailWorker } from "@/lib/email/outbox";

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.user.email) return NextResponse.json({ error: "The admin account has no email address." }, { status: 409 });

  try {
    const job = await queueTransactionalEmail({
      recipientEmail: auth.user.email,
      subject: "iRatePilot transactional email test",
      templateName: "launch_delivery_test",
      templateData: {
        recipient_name: auth.profile.full_name || "iRatePilot Admin",
        message: "This is the approved iRatePilot transactional email delivery test. No booking or payment was created.",
        action_url: "https://www.iratepilot.com/admin/settings",
      },
    });
    const workerTriggered = await wakeTransactionalEmailWorker();
    return NextResponse.json({ data: { jobId: job.id, workerTriggered }, message: workerTriggered ? "Test email queued and the worker was started." : "Test email queued for the scheduled worker." });
  } catch (error) {
    console.error("Admin email test failed", error);
    return NextResponse.json({ error: "The test email could not be queued." }, { status: 503 });
  }
}

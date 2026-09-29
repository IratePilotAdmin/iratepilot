import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.AUTOMATION_POLICY_SCANNER_ENABLED !== "true") {
    return NextResponse.json({
      ok: true,
      disabled: true,
      mode: "observation_only",
      message: "Automation policy scanning is disabled.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("run_automation_policy_scan", {
      p_observed_at: new Date().toISOString(),
    });
    if (error) throw error;
    logOperationalEvent("info", "automation_policy_scan_completed", {
      scanId: data?.id,
      scannerMode: "observation_only",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      ok: true,
      mode: "observation_only",
      scan: data,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await reportOperationalError("automation_policy_scan_failed", error, { durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: false, error: "Automation policy scan failed." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPlatformReadiness } from "@/lib/admin/platform-readiness";

export const dynamic = "force-dynamic";

const AI_DAILY_REQUEST_LIMIT = 200;

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let databaseReachable = false;
    let aiUsage = {
      available: false,
      requestCount: 0,
      limit: AI_DAILY_REQUEST_LIMIT,
      remaining: AI_DAILY_REQUEST_LIMIT,
      windowStartedAt: null as string | null,
      updatedAt: null as string | null,
    };
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createAdminClient();
        const { error } = await admin.from("profiles")
          .select("id", { count: "exact", head: true })
          .abortSignal(AbortSignal.timeout(4_000));
        databaseReachable = !error;

        const { data: usage, error: usageError } = await admin
          .from("ai_travel_request_windows")
          .select("request_count,window_started_at,updated_at")
          .eq("scope", "openai:travel:global")
          .order("window_started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!usageError) {
          const requestCount = Math.max(0, Number(usage?.request_count ?? 0));
          aiUsage = {
            available: true,
            requestCount,
            limit: AI_DAILY_REQUEST_LIMIT,
            remaining: Math.max(0, AI_DAILY_REQUEST_LIMIT - requestCount),
            windowStartedAt: usage?.window_started_at ?? null,
            updatedAt: usage?.updated_at ?? null,
          };
        }
      } catch {
        databaseReachable = false;
      }
    }

    return NextResponse.json({
      ...buildPlatformReadiness(process.env, databaseReachable),
      aiUsage,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin platform readiness failed", error);
    return NextResponse.json({ error: "Platform readiness could not be loaded." }, { status: 503 });
  }
}

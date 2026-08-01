import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { url, key, configured } = getSupabasePublicConfig();
  let database: "configuration_required" | "reachable" | "unreachable" =
    configured ? "unreachable" : "configuration_required";

  if (url && key) {
    try {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .abortSignal(AbortSignal.timeout(4_000));
      database = error ? "unreachable" : "reachable";
    } catch {
      database = "unreachable";
    }
  }

  const ok = configured && database === "reachable";
  return NextResponse.json(
    {
      ok,
      service: "iratepilot",
      authentication: configured ? "configured" : "configuration_required",
      administration: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "configured"
        : "configuration_required",
      database,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}

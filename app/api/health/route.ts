import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function GET() {
  const { configured } = getSupabasePublicConfig();
  return NextResponse.json({
    ok: true,
    service: "iratepilot",
    authentication: configured ? "configured" : "configuration_required",
    database: configured ? "configured" : "configuration_required",
    timestamp: new Date().toISOString()
  });
}

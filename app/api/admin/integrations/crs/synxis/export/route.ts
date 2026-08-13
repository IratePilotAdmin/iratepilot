import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSynxisCertificationPacket } from "@/lib/integrations/synxis-certification-packet";
import { buildSynxisReadiness } from "@/services/hotel-suppliers/synxis";

export const dynamic = "force-dynamic";

const exportLimit = 1_000;

function errorResponse(error: string, status: number) {
  return Response.json({ error }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return errorResponse(
      auth.error ?? "Authorization failed.",
      auth.status ?? 403,
    );

    const admin = createAdminClient();
    const [evidenceResult, historyResult, requestsResult] = await Promise.all([
      admin.from("synxis_crs_launch_evidence")
        .select("vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes,updated_at")
        .eq("provider_id", "sabre-synxis")
        .maybeSingle(),
      admin.from("synxis_crs_evidence_audit")
        .select("id,event_type,changed_fields,actor_id,actor_name,created_at", { count: "exact" })
        .eq("provider_id", "sabre-synxis")
        .order("created_at", { ascending: true })
        .limit(exportLimit),
      admin.from("synxis_request_journal")
        .select("id,request_id,attempt_number,operation,traffic_mode,status,http_status,started_at,completed_at", { count: "exact" })
        .order("started_at", { ascending: true })
        .limit(exportLimit),
    ]);
    const errors = [evidenceResult.error, historyResult.error, requestsResult.error].filter(Boolean);
    if (errors.some((error) => error?.code === "42P01")) {
      return errorResponse("Apply SynXis migrations through 042 before exporting a certification packet.", 503);
    }
    if (errors.length > 0) throw errors[0];

    const row = evidenceResult.data;
    const evidence = {
      vendorApproved: row?.vendor_approved === true,
      certificationEnvironmentApproved: row?.certification_environment_approved === true,
      propertyMapped: row?.property_mapped === true,
      sandboxValidated: row?.sandbox_validated === true,
      productionSmokeValidated: row?.production_smoke_validated === true,
      liveEnabled: row?.live_enabled === true,
      vendorApprovalReference: row?.vendor_approval_reference ?? "",
      approvedEnvironment: row?.approved_environment ?? "",
      propertyCode: row?.property_code ?? "",
      supportContact: row?.support_contact ?? "",
      verificationNotes: row?.verification_notes ?? "",
      updatedAt: row?.updated_at ?? "",
    };
    const packet = buildSynxisCertificationPacket({
      generatedAt: new Date().toISOString(),
      readiness: buildSynxisReadiness(process.env, evidence),
      evidence,
      evidenceHistory: historyResult.data ?? [],
      evidenceHistoryTotal: historyResult.count ?? 0,
      requestReceipts: requestsResult.data ?? [],
      requestReceiptsTotal: requestsResult.count ?? 0,
    });
    const date = packet.generatedAt.slice(0, 10);
    return new Response(`${JSON.stringify(packet, null, 2)}\n`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="iratepilot-synxis-certification-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("SynXis certification export failed", error);
    return errorResponse("SynXis certification packet could not be exported.", 503);
  }
}

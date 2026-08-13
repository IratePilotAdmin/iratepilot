import { requireRole } from "@/lib/auth/require-role";
import { verifySynxisCertificationPacket } from "@/lib/integrations/synxis-certification-packet";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const maximumPacketBytes = 2 * 1024 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return errorResponse(
    auth.error ?? "Authorization failed.",
    auth.status ?? 403,
  );

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumPacketBytes) {
    return errorResponse("Certification packet exceeds the 2 MB verification limit.", 413);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maximumPacketBytes) {
    return errorResponse("Certification packet exceeds the 2 MB verification limit.", 413);
  }

  let packet: unknown;
  try {
    packet = JSON.parse(text);
  } catch {
    return errorResponse("Certification packet is not valid JSON.", 400);
  }

  const verification = verifySynxisCertificationPacket(packet);
  if (!verification.valid || !verification.checksum) {
    return Response.json({ ...verification, issuance: { recorded: false } }, { headers: responseHeaders });
  }

  let receiptQuery = createAdminClient()
    .from("synxis_certification_export_receipts")
    .select("exporter_name,exported_at")
    .eq("provider_id", "sabre-synxis");
  if (verification.issuanceReceiptId) {
    receiptQuery = receiptQuery.eq("id", verification.issuanceReceiptId);
  }
  const receiptResult = await receiptQuery
    .eq("checksum", verification.checksum)
    .maybeSingle();
  if (receiptResult.error?.code === "42P01") {
    return errorResponse("Apply SynXis migration 043 before verifying packet issuance.", 503);
  }
  if (receiptResult.error) {
    console.error("SynXis certification receipt lookup failed", receiptResult.error);
    return errorResponse("Certification packet issuance could not be verified.", 503);
  }

  return Response.json({
    ...verification,
    issuance: receiptResult.data
      ? {
        recorded: true,
        receiptId: verification.issuanceReceiptId,
        matchedBy: verification.issuanceReceiptId ? "receipt_id_and_checksum" : "legacy_checksum",
        exportedBy: receiptResult.data.exporter_name,
        exportedAt: receiptResult.data.exported_at,
      }
      : { recorded: false },
  }, { headers: responseHeaders });
}

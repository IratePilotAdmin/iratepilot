import { requireRole } from "@/lib/auth/require-role";
import { verifySynxisCertificationPacket } from "@/lib/integrations/synxis-certification-packet";

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
  return Response.json(verification, { headers: responseHeaders });
}

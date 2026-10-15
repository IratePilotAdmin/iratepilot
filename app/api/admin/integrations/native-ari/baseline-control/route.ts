import { requireRole } from "@/lib/auth/require-role";
import { readNativePmsBaselinePreview } from "@/lib/native-pms-baseline-preview";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v;
async function readBoundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Open baseline controls from PMS Admin Settings." }, 403);
  if (url.search || url.hash) return reply({ error: "Use the baseline review form." }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "Use the baseline review form." }, 415);
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  let body: unknown;
  try { body = await readBoundedJson(request); }
  catch (error) {
    if (error instanceof Error && error.message === "body_too_large") return reply({ error: "Baseline request is too large." }, 413);
    return reply({ error: "Baseline request is invalid." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Baseline request is invalid." }, 400);
  const b = body as Record<string, unknown>;
  if (Object.keys(b).sort().join(",") !== "confirmation,evidenceReference,expectedCount,fromDate,operation,propertyId,requestId"
    || !uuid(b.requestId) || !uuid(b.propertyId) || !date(b.fromDate)
    || !Number.isSafeInteger(b.expectedCount) || (b.expectedCount as number) < 0 || (b.expectedCount as number) > 1000
    || !["capture", "release"].includes(String(b.operation))
    || typeof b.evidenceReference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/ -]{7,199}$/.test(b.evidenceReference)
    || typeof b.confirmation !== "string") return reply({ error: "Provide a valid sandbox baseline review and evidence reference." }, 400);
  const operation = b.operation as "capture" | "release";
  const expectedConfirmation = `${operation === "capture" ? "CAPTURE BASELINE" : "RELEASE SANDBOX DELIVERY"} ${b.propertyId}`;
  if (b.confirmation !== expectedConfirmation) return reply({ error: `Type ${expectedConfirmation} to confirm.` }, 400);
  const admin = createAdminClient();
  try {
    if (operation === "capture") {
      const previewResult = await admin.rpc("irp_pms_preview_reservation_baseline", { p_property: b.propertyId, p_from: b.fromDate });
      if (previewResult.error) throw previewResult.error;
      const preview = readNativePmsBaselinePreview(previewResult.data, b.fromDate as string);
      if (!preview.eligibleForCapture || preview.reservationCount !== b.expectedCount) return reply({ error: "The baseline is no longer eligible or the reservation count changed. Preview again before proceeding." }, 409);
    }
    const result = await admin.rpc(operation === "capture" ? "irp_pms_capture_reviewed_baseline" : "irp_pms_release_reviewed_baseline", {
      p_request: b.requestId, p_actor: auth.user.id, p_property: b.propertyId, p_from: b.fromDate,
      p_expected_count: b.expectedCount, p_evidence_reference: b.evidenceReference,
    });
    if (result.error) throw result.error;
    return reply({ ok: true, operation, result: result.data });
  } catch {
    return reply({ error: "The sandbox baseline control could not be completed. Review the connection and baseline state; no production connection was changed." }, 409);
  }
}

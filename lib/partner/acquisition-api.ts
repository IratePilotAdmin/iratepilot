import { NextResponse } from "next/server";
import { isPartnerSelfServiceEnabled } from "@/config/partner-acquisition";
import { createRequestClient } from "@/lib/supabase/request";

export function partnerJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function getPartnerApplicantContext(request: Request, mutation = false) {
  if (!isPartnerSelfServiceEnabled()) {
    return { response: partnerJson({ error: "Partner self-service onboarding is not open yet." }, 503) };
  }
  if (mutation && (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site")) {
    return { response: partnerJson({ error: "Open this form on the iRatePilot website." }, 403) };
  }
  const supabase = await createRequestClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: partnerJson({ error: "Sign in to continue." }, 401) };
  if (!user.email || !user.email_confirmed_at) {
    return { response: partnerJson({ error: "Confirm your account email before saving hotel details." }, 403) };
  }
  return { supabase, user, email: user.email.trim().toLowerCase() };
}

class PartnerRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Bound streamed bytes too: Content-Length can be absent or inaccurate. */
export async function readPartnerJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new PartnerRequestError(415, "Use a JSON request.");
  }
  const maximum = 32_000;
  if (Number(request.headers.get("content-length") || 0) > maximum) {
    throw new PartnerRequestError(413, "This setup is too large to save.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PartnerRequestError(400, "Complete the requested fields.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new PartnerRequestError(413, "This setup is too large to save.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof PartnerRequestError) throw error;
    throw new PartnerRequestError(400, "The request could not be read. Please try again.");
  } finally {
    reader.releaseLock();
  }
}

export function partnerOnboardingError(error: unknown) {
  if (error instanceof PartnerRequestError) return partnerJson({ error: error.message }, error.status);
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  // PT409 is a terminal application conflict; 40001 remains a legacy response fallback.
  if (code === "PT409" || code === "40001") return partnerJson({ error: "This draft changed in another window. Reload the saved version before continuing." }, 409);
  if (code === "23505") return partnerJson({ error: "An application already exists for this property. Contact support to review it." }, 409);
  if (code === "42501") return partnerJson({ error: "You do not have access to this draft." }, 403);
  if (code === "P0002") return partnerJson({ error: "This draft was not found." }, 404);
  if (code === "22023") return partnerJson({ error: "Complete the required hotel details and confirmations before continuing." }, 400);
  if (code === "54000") return partnerJson({ error: "The setup limit has been reached. Contact support for help." }, 429);
  return partnerJson({ error: "Hotel setup is temporarily unavailable. Your previously saved details are retained." }, 503);
}

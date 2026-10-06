// bindings:cloudflare-bindings
var env = process.env;

// work/pms/lib/enrolled-staff-assurance.ts
function enrolledStaffAssuranceFailure(authorization, user) {
  const unavailable = { status: 503, message: "Your verification methods could not be checked. Try again." };
  if (user.factors !== void 0 && !Array.isArray(user.factors)) return unavailable;
  if (Array.isArray(user.factors) && user.factors.some((factor) => !factor || typeof factor !== "object" || !["verified", "unverified"].includes(factor.status))) return unavailable;
  if (!Array.isArray(user.factors) || !user.factors.some((factor) => factor.status === "verified")) return null;
  let claims = null;
  try {
    if (!authorization.startsWith("Bearer ")) throw Error("Invalid token");
    const parts = authorization.slice(7).split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) throw Error("Invalid token");
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) claims = parsed;
  } catch {
    claims = null;
  }
  if (claims?.sub !== user.id || claims?.aal !== "aal2" || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1e3) return { status: 403, message: "Complete two-step verification." };
  return null;
}

// work/pms/lib/bounded-provider-response.ts
async function boundedProviderResponse(response, limit = 65536, signal) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8388608) throw Error("Invalid response limit");
  if (!response.body) throw Error("Missing provider response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let completed = false;
  let abort = () => {
  };
  const interrupted = signal ? new Promise((_, reject) => {
    abort = () => reject(Error("Response read interrupted"));
    signal.addEventListener("abort", abort, { once: true });
  }) : void 0;
  try {
    if (signal?.aborted) throw Error("Response read interrupted");
    while (true) {
      const { done, value } = await (interrupted ? Promise.race([reader.read(), interrupted]) : reader.read());
      if (done) {
        completed = true;
        break;
      }
      size += value.byteLength;
      if (size > limit) throw Error("Response too large");
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!completed) void reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// work/pms/lib/payment-provider-json.ts
async function paymentProviderJson(url, init, limit = 65536, timeoutMs = 2e4) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {
          });
          throw Error("Payment provider request failed");
        }
        return JSON.parse(await boundedProviderResponse(response, limit));
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("Payment provider timed out"));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

// qualification:isolated-connection
var supabaseUrl = "https://ybehrayzwzyufxbxcysq.supabase.co";
var publishableKey = "sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf";

// work/pms/lib/release-preview-access.ts
var ReleasePreviewAccessError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
var uuid = (value) => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
async function releasePreviewAccess(authorization, config) {
  if (config.enabled !== true || !uuid(config.ownerId) || typeof config.ownerEmail !== "string" || config.ownerEmail !== config.ownerEmail.trim() || !/^\S+@\S+\.\S+$/.test(config.ownerEmail))
    throw new ReleasePreviewAccessError("Private preview is not available yet.", 503);
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization) || authorization.length > 8192)
    throw new ReleasePreviewAccessError("Sign in to open the private preview.", 401);
  let user;
  try {
    user = await paymentProviderJson(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: publishableKey }, cache: "no-store" }, 65536, 1e4);
  } catch {
    throw new ReleasePreviewAccessError("Your sign-in could not be verified. Try again.", 503);
  }
  if (!user || typeof user !== "object" || !uuid(user.id)) throw new ReleasePreviewAccessError("Your sign-in could not be verified. Try again.", 503);
  const verified = user;
  if (verified.id.toLowerCase() !== config.ownerId.toLowerCase() || typeof verified.email !== "string" || verified.email.toLowerCase() !== config.ownerEmail.toLowerCase() || typeof verified.email_confirmed_at !== "string" || !Number.isFinite(Date.parse(verified.email_confirmed_at)))
    throw new ReleasePreviewAccessError("This preview is available only to its designated owner.", 403);
  const assurance = enrolledStaffAssuranceFailure(authorization, verified);
  if (assurance) throw new ReleasePreviewAccessError(assurance.status === 403 ? "Complete two-step verification to open the private preview." : assurance.message, assurance.status);
  return Object.freeze({ actor: verified.id.toLowerCase() });
}

// work/pms/app/api/release-preview/route.ts
var reply = (body, status) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
async function GET(request) {
  const url = new URL(request.url);
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.has("origin") && request.headers.get("origin") !== url.origin)
    return reply({ error: "Open the private preview from the PMS website." }, 403);
  if (url.search) return reply({ error: "Preview access does not accept URL parameters." }, 400);
  const settings = env;
  try {
    const access = await releasePreviewAccess(request.headers.get("authorization"), { enabled: settings.RELEASE_PREVIEW_ENABLED === "true", ownerId: settings.RELEASE_PREVIEW_OWNER_ID, ownerEmail: settings.RELEASE_PREVIEW_OWNER_EMAIL });
    return reply({ schema_version: 1, actor_id: access.actor, verified: true }, 200);
  } catch (error) {
    return error instanceof ReleasePreviewAccessError ? reply({ error: error.message }, error.status) : reply({ error: "Private preview verification is temporarily unavailable." }, 503);
  }
}
export {
  GET
};

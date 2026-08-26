import { randomUUID } from "node:crypto";

import { requireRole } from "@/lib/auth/require-role";
import {
  activateFlightConsumerPreview,
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
  FlightConsumerPreviewActivationControlError,
  relockFlightConsumerPreview,
  type FlightConsumerPreviewActivationControlClient,
} from "@/lib/flights/consumer-preview/activation-control.server";
import {
  executeFlightConsumerPreviewDuffelWebhookBootstrap,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION,
  FlightConsumerPreviewDuffelWebhookBootstrapError,
} from "@/lib/flights/consumer-preview/duffel-webhook-bootstrap.server";
import { validateSameOriginMutation } from "@/lib/flights/consumer-preview/http.server";
import {
  closeOneTerminalFlightConsumerPreviewReprice,
  FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION,
  FlightConsumerPreviewRepriceRecoveryError,
} from "@/lib/flights/consumer-preview/reprice-recovery.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const maximumFormBytes = 768;
const transport = "NATIVE_OPERATOR_FORM_V1" as const;
const operatorPagePath =
  "/admin/flights/consumer-preview/duffel-webhook-bootstrap" as const;

const operationContracts = Object.freeze({
  bootstrap: FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION,
  ping: FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION,
  activate: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
  recover_reprice: FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION,
  relock: FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
});

type NativeOperation = keyof typeof operationContracts;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function htmlResponse(input: Readonly<{
  body: string;
  status?: number;
  title: string;
}>) {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHtml(input.title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(input.title)}</h1>
    ${input.body}
    <p><a href="${operatorPagePath}">Return to the temporary Preview operator</a></p>
  </main>
</body>
</html>`, {
    status: input.status ?? 200,
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      Expires: "0",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function errorResponse(status: 400 | 401 | 403 | 404 | 409 | 503) {
  const message = {
    400: "The temporary native operator request is invalid.",
    401: "Authentication is required.",
    403: "The temporary native operator request was rejected.",
    404: "Not found.",
    409: "The requested TEST operation did not match the current guarded state.",
    503: "The temporary native operator is unavailable.",
  }[status];
  return htmlResponse({
    body: `<p role="alert">${escapeHtml(message)}</p>`,
    status,
    title: status === 404 ? "Not found" : "Operation not completed",
  });
}

function isNativeSameOriginNavigation(request: Request) {
  return request.headers.has("origin")
    && validateSameOriginMutation(request)
    && request.headers.get("sec-fetch-site")?.toLowerCase() === "same-origin"
    && request.headers.get("sec-fetch-mode")?.toLowerCase() === "navigate"
    && request.headers.get("sec-fetch-dest")?.toLowerCase() === "document";
}

async function readBoundedForm(request: Request) {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") return null;

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumFormBytes)
  ) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      byteLength += item.value.byteLength;
      if (byteLength > maximumFormBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Uint8Array.from(item.value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 1) return null;

  const encoded = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
    const parameters = new URLSearchParams(decoded);
    const entries = [...parameters.entries()];
    if (
      entries.length !== 3
      || parameters.getAll("transport").length !== 1
      || parameters.getAll("operation").length !== 1
      || parameters.getAll("confirmation").length !== 1
      || entries.some(([key]) => !["transport", "operation", "confirmation"].includes(key))
    ) return null;

    const candidateOperation = parameters.get("operation") ?? "";
    if (!(candidateOperation in operationContracts)) return null;
    const operation = candidateOperation as NativeOperation;
    if (
      parameters.get("transport") !== transport
      || parameters.get("confirmation") !== operationContracts[operation]
    ) return null;
    return Object.freeze({ operation });
  } catch {
    return null;
  } finally {
    encoded.fill(0);
  }
}

function isSafeSigningSecret(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 16
    && value.length <= 2_048
    && /^[^\s\u0000-\u001f\u007f]+$/.test(value);
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return errorResponse(404);
  if (!isNativeSameOriginNavigation(request)) return errorResponse(403);

  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    return errorResponse(authentication.status === 401 ? 401 : 403);
  }

  const parsed = await readBoundedForm(request);
  if (parsed === null) return errorResponse(400);

  const input = {
    actorId: authentication.user.id,
    confirmation: operationContracts[parsed.operation],
    idempotencyKey: randomUUID(),
  };

  try {
    if (parsed.operation === "bootstrap" || parsed.operation === "ping") {
      const result = await executeFlightConsumerPreviewDuffelWebhookBootstrap(input);
      if (parsed.operation === "bootstrap") {
        if (result.decision !== "created" || !isSafeSigningSecret(result.signingSecret)) {
          return errorResponse(503);
        }
        return htmlResponse({
          body: `<p>The exact Duffel TEST webhook was created. Store this one-time signing secret in the dedicated Vercel Preview variable, then leave this page.</p>
<code data-testid="duffel-webhook-signing-secret">${escapeHtml(result.signingSecret)}</code>`,
          status: 201,
          title: "Duffel TEST webhook created",
        });
      }
      if (result.decision !== "ping_requested") return errorResponse(503);
      return htmlResponse({
        body: "<p>Duffel accepted the exact TEST webhook ping request.</p>",
        title: "Duffel TEST webhook ping requested",
      });
    }

    if (parsed.operation === "recover_reprice") {
      const result = await closeOneTerminalFlightConsumerPreviewReprice(input);
      if (
        result.decision !== "closed"
        || result.terminalState !== "succeeded"
        || result.idempotencyStatus !== "failed"
        || result.offerStatus !== "expired"
      ) return errorResponse(503);
      return htmlResponse({
        body: "<p>The one terminal TEST reprice attempt was closed without provider redispatch, refreshed evidence, or order creation.</p>",
        title: "Terminal TEST reprice closed",
      });
    }

    const controlClient = authentication.supabase as unknown as FlightConsumerPreviewActivationControlClient;
    if (parsed.operation === "activate") {
      const result = await activateFlightConsumerPreview(controlClient, input);
      if (result.decision !== "activated") return errorResponse(503);
      return htmlResponse({
        body: "<p>Consumer Flight Preview is active in guarded TEST mode. Verify runtime preflight before continuing.</p>",
        title: "Consumer Flight Preview activated",
      });
    }

    const result = await relockFlightConsumerPreview(controlClient, input);
    if (result.decision !== "relocked") return errorResponse(503);
    return htmlResponse({
      body: "<p>Consumer Flight Preview is relocked. Verify that every transaction capability is closed.</p>",
      title: "Consumer Flight Preview relocked",
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) {
      console.warn("[flight-consumer-preview] Duffel TEST bootstrap operation rejected", {
        diagnostic: error.diagnostic,
        kind: error.kind,
      });
    }
    if (
      (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError
        || error instanceof FlightConsumerPreviewActivationControlError
        || error instanceof FlightConsumerPreviewRepriceRecoveryError)
      && error.kind === "conflict"
    ) return errorResponse(409);
    return errorResponse(503);
  }
}

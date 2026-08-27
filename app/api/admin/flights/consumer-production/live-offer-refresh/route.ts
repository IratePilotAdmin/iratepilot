import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/lib/auth/require-role";
import {
  createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow,
  FlightConsumerProductionDuffelOfferRefreshError,
} from "@/lib/flights/consumer-production/duffel-live-offer-refresh-workflow.server";
import { FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION } from "@/lib/flights/consumer-production/duffel-live-offer-reprice.server";
import { FLIGHT_CONSUMER_PRODUCTION_ORIGIN } from "@/lib/flights/consumer-production/runtime.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

const maximumBodyBytes = 8_192;
const requestSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  ),
  offerId: z.string().regex(/^off_[A-Za-z0-9]{8,252}$/),
  sourceShoppingAttemptId: z.string().uuid(),
}).strict();

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBoundedRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBodyBytes) {
        chunk.value.fill(0);
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
    if (bytes < 2) return null;
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
      chunk.fill(0);
    }
    return body;
  } catch {
    return null;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  let rawBody: Uint8Array | null = null;
  try {
    const authentication = await requireRole(["admin"]);
    if ("error" in authentication) {
      return noStoreJson(
        { error: "Live-offer refresh observation could not be completed." },
        authentication.status ?? 401,
      );
    }
    if (
      request.headers.get("origin") !== FLIGHT_CONSUMER_PRODUCTION_ORIGIN
      || request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
        !== "application/json"
    ) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null
      && (!/^(?:0|[1-9]\d*)$/.test(declaredLength)
        || Number(declaredLength) > maximumBodyBytes)
    ) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    rawBody = await readBoundedRequestBody(request);
    if (rawBody === null) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
      );
    } catch {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    const accepted = requestSchema.safeParse(decoded);
    if (!accepted.success) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    const result = await createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow()
      .execute(accepted.data);
    return noStoreJson({
      mode: "duffel_live_offer_refresh_observation_dark",
      result,
      finalCheckoutPricingAuthorized: false,
      consumerReleaseEnabled: false,
    }, 200);
  } catch (error) {
    const status = error instanceof FlightConsumerProductionDuffelOfferRefreshError
      ? error.status
      : 503;
    console.warn(
      "[flight-consumer-production] Duffel live-offer refresh observation rejected",
      {
        diagnostic: error instanceof FlightConsumerProductionDuffelOfferRefreshError
          ? error.diagnostic
          : "unexpected_error",
        status,
      },
    );
    return noStoreJson(
      { error: "Live-offer refresh observation could not be completed." },
      status,
    );
  } finally {
    rawBody?.fill(0);
  }
}

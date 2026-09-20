import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import {
  createFlightConsumerProductionDarkDuffelShoppingWorkflow,
  FlightConsumerProductionDuffelShoppingError,
} from "@/lib/flights/consumer-production/duffel-shopping.server";
import { resolveFlightConsumerProductionShoppingDarkRuntime } from "@/lib/flights/consumer-production/shopping-runtime.server";
import { FLIGHT_CONSUMER_PRODUCTION_ORIGIN } from "@/lib/flights/consumer-production/runtime.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const maximumBodyBytes = 16_384;

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

export async function POST(request: Request) {
  let rawBody: Uint8Array | null = null;
  try {
    const authentication = await requireRole(["admin"]);
    if ("error" in authentication) {
      return noStoreJson({ error: authentication.error }, authentication.status ?? 401);
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
      declaredLength !== null && (
        !/^(?:0|[1-9]\d*)$/.test(declaredLength)
        || Number(declaredLength) > maximumBodyBytes
      )
    ) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }

    rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength < 2 || rawBody.byteLength > maximumBodyBytes) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    const result = await createFlightConsumerProductionDarkDuffelShoppingWorkflow()
      .execute(body);
    return noStoreJson({
      mode: "duffel_live_shopping_dark",
      result,
      consumerReleaseEnabled: false,
    }, 200);
  } catch (error) {
    const status = error instanceof FlightConsumerProductionDuffelShoppingError
      ? error.status
      : 503;
    console.warn("[flight-consumer-production] Duffel live-shopping dark request rejected", {
      diagnostic: error instanceof FlightConsumerProductionDuffelShoppingError
        ? error.diagnostic
        : "unexpected_error",
      status,
      runtimeReasons: error instanceof FlightConsumerProductionDuffelShoppingError
        && error.diagnostic === "workflow_unavailable"
        ? resolveFlightConsumerProductionShoppingDarkRuntime(process.env).reasons
        : undefined,
    });
    return noStoreJson({ error: "Live-shopping diagnostic could not be completed." }, status);
  } finally {
    rawBody?.fill(0);
  }
}

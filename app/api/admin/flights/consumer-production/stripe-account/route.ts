import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import {
  createFlightConsumerProductionStripeAccountPreflightWorkflow,
  FlightConsumerProductionStripeAccountPreflightError,
} from "@/lib/flights/consumer-production/stripe-account-preflight.server";
import { FLIGHT_CONSUMER_PRODUCTION_ORIGIN } from "@/lib/flights/consumer-production/runtime.server";
import {
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE,
} from "@/lib/flights/consumer-production/stripe-runtime.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const maximumBodyBytes = 1_024;
const privateHeaders = {
  "Cache-Control": "no-store, private, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

type StrictStripeAccountPreflightInput = Readonly<{
  confirmation:
    typeof FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION;
}>;

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStrictInput(value: unknown): StrictStripeAccountPreflightInput | null {
  if (!isRecord(value) || Object.keys(value).length !== 1) return null;
  if (
    value.confirmation
      !== FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION
  ) {
    return null;
  }
  return Object.freeze({
    confirmation:
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
  });
}

async function readBoundedBody(request: Request) {
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) {
        completed = true;
        break;
      }
      if (!(part.value instanceof Uint8Array) || chunks.length >= 64) {
        return null;
      }
      total += part.value.byteLength;
      if (total > maximumBodyBytes) return null;
      chunks.push(part.value);
    }
    if (total < 2) return null;
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

export async function POST(request: Request) {
  let rawBody: Uint8Array | null = null;
  try {
    const authentication = await requireRole(["admin"]);
    if ("error" in authentication) {
      return noStoreJson(
        { error: "Stripe account preflight could not be completed." },
        authentication.status ?? 401,
      );
    }
    if (process.env.VERCEL_ENV !== "production") {
      return noStoreJson(
        { error: "Stripe account preflight could not be completed." },
        404,
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

    rawBody = await readBoundedBody(request);
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
    const input = parseStrictInput(decoded);
    decoded = null;
    if (input === null) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }

    const result = await createFlightConsumerProductionStripeAccountPreflightWorkflow()
      .execute(input);
    return noStoreJson({
      mode: FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_MODE,
      result,
      consumerReleaseEnabled: false,
    }, 200);
  } catch (error) {
    const status = error instanceof FlightConsumerProductionStripeAccountPreflightError
      ? error.status
      : 503;
    console.warn("[flight-consumer-production] Stripe account preflight rejected", {
      diagnostic: error instanceof FlightConsumerProductionStripeAccountPreflightError
        ? error.diagnostic
        : "unexpected_error",
      status,
    });
    return noStoreJson(
      { error: "Stripe account preflight could not be completed." },
      status,
    );
  } finally {
    rawBody?.fill(0);
  }
}

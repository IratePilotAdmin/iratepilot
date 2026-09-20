import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import {
  createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow,
  FlightConsumerProductionDuffelOrderPlanRehearsalError,
} from "@/lib/flights/consumer-production/duffel-order-plan-rehearsal.server";
import { FLIGHT_CONSUMER_PRODUCTION_ORIGIN } from "@/lib/flights/consumer-production/runtime.server";
import { FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION } from "@/lib/flights/consumer-production/shopping-runtime.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const maximumBodyBytes = 16_384;
const cabinValues = new Set([
  "economy",
  "premium_economy",
  "business",
  "first",
]);

const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

type StrictOrderPlanInput = Readonly<{
  confirmation: typeof FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION;
  search: Readonly<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    cabin: "economy" | "premium_economy" | "business" | "first";
    adults: 1;
  }>;
}>;

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  return observed.length === expected.length
    && observed.every((key, index) => key === expected[index]);
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseStrictInput(value: unknown): StrictOrderPlanInput | null {
  if (!isRecord(value) || !hasExactKeys(value, ["confirmation", "search"])) return null;
  if (
    value.confirmation
      !== FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION
    || !isRecord(value.search)
    || !hasExactKeys(value.search, [
      "origin",
      "destination",
      "departureDate",
      "returnDate",
      "cabin",
      "adults",
    ])
  ) {
    return null;
  }

  const search = value.search;
  if (
    typeof search.origin !== "string"
    || !/^[A-Z]{3}$/.test(search.origin)
    || typeof search.destination !== "string"
    || !/^[A-Z]{3}$/.test(search.destination)
    || search.origin === search.destination
    || !isLocalDate(search.departureDate)
    || (search.returnDate !== null && !isLocalDate(search.returnDate))
    || (typeof search.returnDate === "string"
      && search.returnDate <= search.departureDate)
    || typeof search.cabin !== "string"
    || !cabinValues.has(search.cabin)
    || search.adults !== 1
  ) {
    return null;
  }

  return Object.freeze({
    confirmation:
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
    search: Object.freeze({
      origin: search.origin,
      destination: search.destination,
      departureDate: search.departureDate,
      returnDate: search.returnDate,
      cabin: search.cabin as StrictOrderPlanInput["search"]["cabin"],
      adults: 1 as const,
    }),
  });
}

export async function POST(request: Request) {
  let rawBody: Uint8Array | null = null;
  try {
    const authentication = await requireRole(["admin"]);
    if ("error" in authentication) {
      return noStoreJson(
        { error: "Order-plan rehearsal could not be completed." },
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

    rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength < 2 || rawBody.byteLength > maximumBodyBytes) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return noStoreJson({ error: "Invalid request." }, 400);
    }
    const input = parseStrictInput(decoded);
    if (input === null) {
      return noStoreJson({ error: "Invalid request." }, 400);
    }

    const result = await createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow()
      .execute(input);
    return noStoreJson({
      mode: "duffel_live_order_plan_rehearsal",
      result,
      consumerReleaseEnabled: false,
    }, 200);
  } catch (error) {
    const status = error instanceof FlightConsumerProductionDuffelOrderPlanRehearsalError
      ? error.status
      : 503;
    console.warn("[flight-consumer-production] Duffel order-plan rehearsal rejected", {
      diagnostic: error instanceof FlightConsumerProductionDuffelOrderPlanRehearsalError
        ? error.diagnostic
        : "unexpected_error",
      status,
    });
    return noStoreJson(
      { error: "Order-plan rehearsal could not be completed." },
      status,
    );
  } finally {
    rawBody?.fill(0);
  }
}

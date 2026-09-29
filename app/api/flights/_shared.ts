import { NextResponse } from "next/server";
import { parseFlightSearch } from "../../../lib/flights/search";

const allowedSearchKeys = ["tripType", "origin", "destination", "departureDate", "returnDate", "travelers", "cabin"] as const;
const maximumSyntheticSearchBodyBytes = 8_192;

export const offlineFlightCapabilities = Object.freeze({
  externalRequestMade: false,
  passengerDataAccepted: false,
  paymentAuthorized: false,
  orderAuthorized: false,
  ticketingAuthorized: false,
  servicingAuthorized: false,
  productionTrafficAuthorized: false,
});

export function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseSyntheticSearchBody(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { error: "Content-Type must be application/json.", search: null } as const;
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumSyntheticSearchBodyBytes)) {
    return { error: "Flight-search JSON exceeds the 8 KiB request limit.", search: null } as const;
  }
  let body: unknown = null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: "A JSON flight-search object is required.", search: null } as const;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumSyntheticSearchBodyBytes) {
        await reader.cancel();
        return { error: "Flight-search JSON exceeds the 8 KiB request limit.", search: null } as const;
      }
      chunks.push(value);
    }
    const encoded = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      encoded.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded)) as unknown;
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A JSON flight-search object is required.", search: null } as const;
  }
  const record = body as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !allowedSearchKeys.includes(key as (typeof allowedSearchKeys)[number]));
  if (unknownKeys.length) {
    return { error: "Only non-sensitive flight-search fields are accepted.", search: null } as const;
  }
  const raw: Record<string, string | undefined> = {};
  for (const key of allowedSearchKeys) {
    const value = record[key];
    if (value !== undefined && typeof value !== "string") {
      return { error: `${key} must be a string.`, search: null } as const;
    }
    raw[key] = value;
  }
  const search = parseFlightSearch(raw);
  if (!search.query) return { error: search.errors.join(" ") || "The flight search is invalid.", search: null } as const;
  return { error: null, search } as const;
}

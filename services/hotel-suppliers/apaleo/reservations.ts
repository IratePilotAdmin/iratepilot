import { createHash } from "node:crypto";
import type { ApaleoFetch } from "./transport";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const statusPattern = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const maxResponseBytes = 262_144;

export type ApaleoReservationReadConfig = {
  accessToken: string;
  reservationId: string;
  propertyCode: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export type ApaleoReservationSnapshot = {
  reservationId: string;
  propertyCode: string;
  status: string;
  snapshotSha256: string;
};

export class ApaleoReservationReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "ApaleoReservationReadError";
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeDate(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export async function fetchApaleoReservation(
  config: ApaleoReservationReadConfig,
  fetcher: ApaleoFetch = fetch,
): Promise<ApaleoReservationSnapshot> {
  const baseUrl = new URL(config.baseUrl ?? "https://api.apaleo.com");
  if (baseUrl.protocol !== "https:") throw new Error("Apaleo base URL must use HTTPS");
  if (!config.accessToken.trim()) throw new Error("Apaleo access token is required");
  if (!identifierPattern.test(config.reservationId)) throw new Error("Apaleo reservation ID is invalid");
  if (!identifierPattern.test(config.propertyCode)) throw new Error("Apaleo property code is invalid");

  const endpoint = new URL(
    `/booking/v1/reservations/${encodeURIComponent(config.reservationId)}`,
    baseUrl,
  );
  if (endpoint.origin !== baseUrl.origin) throw new Error("Apaleo reservation endpoint is invalid");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${config.accessToken}` },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new ApaleoReservationReadError(
        "Apaleo reservation response is too large",
        502,
        "response_too_large",
      );
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maxResponseBytes) {
      throw new ApaleoReservationReadError(
        "Apaleo reservation response is too large",
        502,
        "response_too_large",
      );
    }
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : undefined;
    } catch {
      throw new ApaleoReservationReadError(
        "Apaleo reservation response is malformed",
        502,
        "malformed_response",
      );
    }
    if (!response.ok) {
      throw new ApaleoReservationReadError(
        `Apaleo reservation read failed with status ${response.status}`,
        response.status,
        `http_${response.status}`,
      );
    }

    const source = record(payload);
    const property = record(source?.property);
    const reservationId = text(source?.id);
    const propertyCode = text(source?.propertyId) ?? text(property?.id);
    const status = text(source?.status);
    if (
      reservationId !== config.reservationId
      || propertyCode !== config.propertyCode
      || !status
      || !statusPattern.test(status)
    ) {
      throw new ApaleoReservationReadError(
        "Apaleo reservation response does not match the claimed receipt",
        409,
        "reservation_mismatch",
      );
    }

    const piiFreeSnapshot = {
      reservationId,
      propertyCode,
      status,
      arrival: safeDate(source?.arrival),
      departure: safeDate(source?.departure),
      createdAt: safeDate(source?.created),
      modifiedAt: safeDate(source?.modified),
    };
    return {
      reservationId,
      propertyCode,
      status,
      snapshotSha256: digest(piiFreeSnapshot),
    };
  } catch (error) {
    if (error instanceof ApaleoReservationReadError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApaleoReservationReadError(
        "Apaleo reservation read timed out",
        504,
        "timeout",
      );
    }
    throw new ApaleoReservationReadError(
      "Apaleo reservation read failed",
      502,
      "transport_error",
    );
  } finally {
    clearTimeout(timeout);
  }
}

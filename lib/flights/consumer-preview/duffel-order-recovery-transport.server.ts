import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  DUFFEL_MAX_RAW_BODY_BYTES,
  parseDuffelJsonBody,
} from "../duffel-sandbox-contract";
import { validateDuffelSandboxAccessToken } from "../duffel/credentials.server";
import { sha256FlightEvidence } from "../runtime-safety";
import { sha256FlightConsumerPreviewReference } from "./reference-crypto.server";

const providerOrderIdSchema = z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/);
const responseSchema = z.object({
  data: z.object({
    id: providerOrderIdSchema,
    live_mode: z.literal(false),
  }).passthrough(),
}).passthrough();

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_ORDER_RECOVERY_TIMEOUT_MS = 15_000;

export class FlightConsumerPreviewDuffelOrderRecoveryTransportError extends Error {
  constructor() {
    super("Duffel test order recovery could not be authenticated.");
    this.name = "FlightConsumerPreviewDuffelOrderRecoveryTransportError";
  }
}

function fail(): never {
  throw new FlightConsumerPreviewDuffelOrderRecoveryTransportError();
}

function parseContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d{0,6})$/.test(value)) fail();
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > DUFFEL_MAX_RAW_BODY_BYTES) fail();
  return length;
}

async function readBoundedResponseBody(response: Response) {
  const declaredLength = parseContentLength(response);
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) fail();
      byteLength += item.value.byteLength;
      if (byteLength > DUFFEL_MAX_RAW_BODY_BYTES) {
        await reader.cancel();
        fail();
      }
      chunks.push(Uint8Array.from(item.value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 2) fail();
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
  if (
    declaredLength !== null
    && (contentEncoding === null || contentEncoding === "identity")
    && declaredLength !== byteLength
  ) fail();
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return body;
}

export function createInjectedFlightConsumerPreviewDuffelOrderRecoveryTransport(input: Readonly<{
  accessToken: string;
  fetcher: typeof fetch;
}>) {
  const accessToken = validateDuffelSandboxAccessToken(input.accessToken);
  if (typeof input.fetcher !== "function") fail();
  return Object.freeze({
    async retrieve(untrusted: Readonly<{
      providerOrderId: string;
      providerOrderRefSha256: string;
    }>) {
      const providerOrderId = providerOrderIdSchema.parse(untrusted.providerOrderId);
      const expectedReferenceSha256 = sha256FlightConsumerPreviewReference({
        kind: "duffel_order",
        value: providerOrderId,
      });
      if (untrusted.providerOrderRefSha256 !== expectedReferenceSha256) fail();
      const url = `https://api.duffel.com/air/orders/${providerOrderId}`;
      const recoveryRequestSha256 = sha256FlightEvidence({
        version: "flight-consumer-preview-duffel-order-recovery-request-v1",
        method: "GET",
        endpoint: "https://api.duffel.com/air/orders/{order_id}",
        providerOrderRefSha256: expectedReferenceSha256,
        accept: "application/json",
        duffelVersion: "v2",
      });
      let rawBody: Uint8Array | null = null;
      try {
        const response = await input.fetcher(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Duffel-Version": "v2",
          },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(
            FLIGHT_CONSUMER_PREVIEW_DUFFEL_ORDER_RECOVERY_TIMEOUT_MS,
          ),
        });
        const contentType = response.headers.get("content-type")?.trim() ?? "";
        if (
          response.status !== 200
          || response.redirected
          || (response.url !== "" && response.url !== url)
          || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)
        ) fail();
        rawBody = await readBoundedResponseBody(response);
        const projected = responseSchema.parse(parseDuffelJsonBody(rawBody));
        if (projected.data.id !== providerOrderId) fail();
        const responseSha256 = createHash("sha256").update(rawBody).digest("hex");
        return Object.freeze({
          rawBody: Uint8Array.from(rawBody),
          responseSha256,
          responseBytes: rawBody.byteLength,
          recoveryRequestSha256,
          providerOrderRefSha256: expectedReferenceSha256,
        });
      } catch (error) {
        if (error instanceof FlightConsumerPreviewDuffelOrderRecoveryTransportError) throw error;
        throw new FlightConsumerPreviewDuffelOrderRecoveryTransportError();
      } finally {
        rawBody?.fill(0);
      }
    },
  });
}

export function createFlightConsumerPreviewDuffelOrderRecoveryTransport() {
  return createInjectedFlightConsumerPreviewDuffelOrderRecoveryTransport({
    accessToken: process.env.DUFFEL_TEST_ACCESS_TOKEN ?? "",
    fetcher: fetch,
  });
}

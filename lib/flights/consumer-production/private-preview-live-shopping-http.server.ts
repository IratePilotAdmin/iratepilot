import "server-only";

import { z } from "zod";

import { FLIGHT_CONSUMER_PRODUCTION_ORIGIN } from "./runtime.server";
import { flightConsumerProductionPublicShoppingSearchSchema } from
  "./public-shopping-contract";
import {
  acceptFlightConsumerProductionPrivatePreviewLiveShoppingResult,
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED,
  FlightConsumerProductionPrivatePreviewLiveShoppingError,
} from "./private-preview-live-shopping.server";

export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_PATH =
  "/api/flights/private-preview/live-search" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MAX_BODY_BYTES = 2_048;

const uuidSchema = z.string().uuid();
const bodySchema = z.object({
  search: flightConsumerProductionPublicShoppingSearchSchema,
}).strict();

type Environment = Readonly<Record<string, string | undefined>>;
type Authentication =
  | Readonly<{ userId: string }>
  | Readonly<{ error: string; status: 401 }>;

export type FlightConsumerProductionPrivatePreviewRouteDependencies = Readonly<{
  environment: () => Environment;
  authenticate: () => Promise<Authentication>;
  execute: (input: Readonly<{
    authenticatedCustomerId: string;
    idempotencyKey: string;
    search: z.output<typeof flightConsumerProductionPublicShoppingSearchSchema>;
  }>) => Promise<unknown>;
}>;

function response(body: unknown, status: number, retryAfter?: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    Expires: "0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    Vary: "Cookie, Origin",
  });
  if (retryAfter !== undefined) headers.set("Retry-After", retryAfter);
  return Response.json(body, { status, headers });
}

function enabled(environment: Environment) {
  return environment.VERCEL_ENV === "production"
    && environment[FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]
      === "true";
}

function exactBrowserBoundary(request: Request) {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  const cookie = request.headers.get("cookie");
  return url.origin === FLIGHT_CONSUMER_PRODUCTION_ORIGIN
    && url.pathname === FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_PATH
    && url.search === ""
    && request.headers.get("origin") === FLIGHT_CONSUMER_PRODUCTION_ORIGIN
    && request.headers.get("sec-fetch-site") === "same-origin"
    && request.headers.get("sec-fetch-mode") === "cors"
    && request.headers.get("sec-fetch-dest") === "empty"
    && request.headers.get("authorization") === null
    && cookie !== null
    && cookie.length >= 1
    && cookie.length <= 8_192
    && !/[\u0000-\u001f\u007f]/.test(cookie);
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  const accepted = uuidSchema.safeParse(value);
  return accepted.success ? accepted.data.toLowerCase() : null;
}

async function boundedJson(request: Request) {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  const encoding = request.headers.get("content-encoding");
  const declared = request.headers.get("content-length");
  if (mediaType !== "application/json" || encoding !== null
    || (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared)
      || Number(declared) < 2
      || Number(declared)
        > FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MAX_BODY_BYTES))) {
    return null;
  }
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) || item.value.length === 0) {
        item.value?.fill(0);
        return null;
      }
      bytes += item.value.length;
      if (bytes > FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_MAX_BODY_BYTES) {
        item.value.fill(0);
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(item.value);
    }
    if (bytes < 2 || (declared !== null && Number(declared) !== bytes)) {
      return null;
    }
    const raw = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(raw),
      ) as unknown;
    } catch {
      return null;
    } finally {
      raw.fill(0);
    }
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

export function createFlightConsumerProductionPrivatePreviewRouteHandler(
  dependencies: FlightConsumerProductionPrivatePreviewRouteDependencies,
) {
  return async function POST(request: Request) {
    let environment: Environment;
    try {
      environment = dependencies.environment();
    } catch {
      return response({ error: "Not found." }, 404);
    }
    if (!enabled(environment)) {
      return response({ error: "Not found." }, 404);
    }
    if (!exactBrowserBoundary(request)) {
      return response({ error: "Request refused." }, 403);
    }
    const key = idempotencyKey(request);
    if (key === null) {
      return response({ error: "Invalid request." }, 400);
    }
    let authentication: Authentication;
    try {
      authentication = await dependencies.authenticate();
    } catch {
      return response({ error: "Private-preview search is unavailable." }, 503);
    }
    if ("error" in authentication) {
      return response({ error: "Authentication required." }, 401);
    }
    const body = bodySchema.safeParse(await boundedJson(request));
    if (!body.success) {
      return response({ error: "Invalid request." }, 400);
    }
    try {
      const result = acceptFlightConsumerProductionPrivatePreviewLiveShoppingResult(
        await dependencies.execute({
          authenticatedCustomerId: authentication.userId,
          idempotencyKey: key,
          search: body.data.search,
        }),
      );
      return response({ data: result }, 200);
    } catch (error) {
      if (error instanceof FlightConsumerProductionPrivatePreviewLiveShoppingError
        && error.status === 429) {
        return response({ error: "Private-preview search is unavailable." }, 429, "60");
      }
      if (error instanceof FlightConsumerProductionPrivatePreviewLiveShoppingError
        && error.status === 400) {
        return response({ error: "Invalid request." }, 400);
      }
      return response({ error: "Private-preview search is unavailable." }, 503);
    }
  };
}

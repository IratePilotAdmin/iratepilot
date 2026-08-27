import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

import {
  DUFFEL_API_BASE_URL,
  DUFFEL_MAX_RAW_BODY_BYTES,
  parseDuffelJsonBody,
} from "../duffel-sandbox-contract";
import { validateDuffelSandboxAccessToken } from "../duffel/credentials.server";
import { FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS } from "./duffel-webhook.server";

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION =
  "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION =
  "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW" as const;

const duffelApiVersion = "v2" as const;
const stablePreviewOrigin =
  "https://iratepilot-consumer-flights-preview.vercel.app" as const;
const webhookReceiverPath = "/api/flights/preview/webhooks/duffel" as const;
const listWebhooksUrl = `${DUFFEL_API_BASE_URL}/air/webhooks?limit=200` as const;
const requestTimeoutMs = 15_000;
const uuidSchema = z.string().uuid();
const providerWebhookIdSchema = z.string().regex(/^end_[A-Za-z0-9]{8,252}$/);
const signingSecretSchema = z.string()
  .min(16)
  .max(2_048)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/);

const inputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.union([
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
    z.literal(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION),
  ]),
  idempotencyKey: uuidSchema,
}).strict();

const webhookSchema = z.object({
  active: z.boolean(),
  events: z.array(z.string().min(1).max(128)).max(64),
  id: providerWebhookIdSchema,
  live_mode: z.boolean(),
  url: z.string().url().max(4_096),
}).passthrough();

const listResponseSchema = z.object({
  data: z.array(webhookSchema).max(200),
  meta: z.object({
    after: z.string().max(4_096).nullable(),
    before: z.string().max(4_096).nullable().optional(),
    limit: z.literal(200),
  }).passthrough(),
}).passthrough();

const createResponseSchema = z.object({
  data: webhookSchema.extend({
    secret: signingSecretSchema,
  }),
}).passthrough();

type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;

export type FlightConsumerPreviewDuffelWebhookBootstrapDependencies = Readonly<{
  env: BootstrapEnvironment;
  fetcher: typeof fetch;
}>;

export type FlightConsumerPreviewDuffelWebhookBootstrapResult = Readonly<{
  decision: "created";
  mode: "duffel_test_mode";
  signingSecret: string;
  storeSigningSecretImmediately: true;
  webhookIdSha256: string;
}>;

export type FlightConsumerPreviewDuffelWebhookPingResult = Readonly<{
  decision: "ping_requested";
  mode: "duffel_test_mode";
  webhookIdSha256: string;
}>;

export class FlightConsumerPreviewDuffelWebhookBootstrapError extends Error {
  readonly kind: "conflict" | "unavailable";
  readonly diagnostic: Readonly<{
    operation: "ping_response_contract";
    responseStatus: number;
    redirected: boolean;
    urlMatched: boolean;
    bodyWasNull: boolean;
  }> | null;

  constructor(
    kind: "conflict" | "unavailable" = "unavailable",
    diagnostic: FlightConsumerPreviewDuffelWebhookBootstrapError["diagnostic"] = null,
  ) {
    super("The temporary Duffel test-webhook operation is unavailable.");
    this.name = "FlightConsumerPreviewDuffelWebhookBootstrapError";
    this.kind = kind;
    this.diagnostic = diagnostic === null ? null : Object.freeze({ ...diagnostic });
  }
}

function fail(
  kind: "conflict" | "unavailable" = "unavailable",
  diagnostic: FlightConsumerPreviewDuffelWebhookBootstrapError["diagnostic"] = null,
): never {
  throw new FlightConsumerPreviewDuffelWebhookBootstrapError(kind, diagnostic);
}

function readExactPreviewOrigin(env: BootstrapEnvironment) {
  const raw = env.NEXT_PUBLIC_APP_URL;
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) fail();
  try {
    const parsed = new URL(raw);
    if (
      env.VERCEL_ENV !== "preview"
      || parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.port !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.hostname === "localhost"
      || isIP(parsed.hostname) !== 0
      || raw !== parsed.origin
      || parsed.origin !== stablePreviewOrigin
    ) fail();
    return parsed.origin;
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) throw error;
    fail();
  }
}

function readBypassSecret(env: BootstrapEnvironment) {
  const value = env.FLIGHT_CONSUMER_PREVIEW_PROVIDER_WEBHOOK_BYPASS_SECRET;
  if (
    typeof value !== "string"
    || value.length < 16
    || value.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) fail();
  return value;
}

function createExactReceiverUrl(env: BootstrapEnvironment) {
  const url = new URL(webhookReceiverPath, readExactPreviewOrigin(env));
  url.searchParams.set(
    "x-vercel-protection-bypass",
    readBypassSecret(env),
  );
  return url.toString();
}

function hasExactEvents(events: readonly string[]) {
  if (events.length !== FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS.length) {
    return false;
  }
  const expected = [...FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS].sort();
  const actual = [...events].sort();
  return actual.every((event, index) => event === expected[index]);
}

function isExactTestWebhook(webhook: z.infer<typeof webhookSchema>, receiverUrl: string) {
  return webhook.live_mode === false
    && webhook.active === true
    && webhook.url === receiverUrl
    && hasExactEvents(webhook.events);
}

function assertJsonResponse(response: Response, url: string, status: number) {
  const contentType = response.headers.get("content-type")?.trim() ?? "";
  if (
    response.status !== status
    || response.redirected
    || (response.url !== "" && response.url !== url)
    || !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)
  ) fail();
}

function parseContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d{0,6})$/.test(value)) fail();
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > DUFFEL_MAX_RAW_BODY_BYTES) fail();
  return length;
}

async function readBoundedJsonResponse(response: Response) {
  const declaredLength = parseContentLength(response);
  if (response.body === null) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
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
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  if (
    declaredLength !== null
    && (contentEncoding === undefined || contentEncoding === "identity")
    && declaredLength !== byteLength
  ) fail();
  const rawBody = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  try {
    return parseDuffelJsonBody(rawBody);
  } finally {
    rawBody.fill(0);
  }
}

function requestHeaders(accessToken: string, correlationId: string) {
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    Authorization: `Bearer ${accessToken}`,
    "Duffel-Version": duffelApiVersion,
    "x-client-correlation-id": correlationId,
  } as const;
}

async function listAllTestWebhooks(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
}>) {
  const response = await input.fetcher(listWebhooksUrl, {
    method: "GET",
    headers: requestHeaders(input.accessToken, input.correlationId),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  assertJsonResponse(response, listWebhooksUrl, 200);
  const parsed = listResponseSchema.safeParse(await readBoundedJsonResponse(response));
  if (!parsed.success || parsed.data.meta.after !== null) fail();
  return parsed.data.data;
}

async function createOneTestWebhook(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
  receiverUrl: string;
}>) {
  const createUrl = `${DUFFEL_API_BASE_URL}/air/webhooks`;
  const response = await input.fetcher(createUrl, {
    method: "POST",
    headers: {
      ...requestHeaders(input.accessToken, input.correlationId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        url: input.receiverUrl,
        events: FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS,
      },
    }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (response.status === 409) fail("conflict");
  assertJsonResponse(response, createUrl, 201);
  const parsed = createResponseSchema.safeParse(await readBoundedJsonResponse(response));
  if (!parsed.success || !isExactTestWebhook(parsed.data.data, input.receiverUrl)) fail();
  return Object.freeze({
    decision: "created" as const,
    mode: "duffel_test_mode" as const,
    signingSecret: parsed.data.data.secret,
    storeSigningSecretImmediately: true as const,
    webhookIdSha256: createHash("sha256")
      .update(parsed.data.data.id, "utf8")
      .digest("hex"),
  });
}

async function pingExactTestWebhook(input: Readonly<{
  accessToken: string;
  correlationId: string;
  fetcher: typeof fetch;
  webhook: z.infer<typeof webhookSchema>;
}>) {
  const pingUrl = `${DUFFEL_API_BASE_URL}/air/webhooks/${input.webhook.id}/actions/ping`;
  const response = await input.fetcher(pingUrl, {
    method: "POST",
    headers: {
      ...requestHeaders(input.accessToken, input.correlationId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (
    response.status !== 204
    || response.redirected
    || (response.url !== "" && response.url !== pingUrl)
    || response.body !== null
  ) fail("unavailable", {
    operation: "ping_response_contract",
    responseStatus: response.status,
    redirected: response.redirected,
    urlMatched: response.url === "" || response.url === pingUrl,
    bodyWasNull: response.body === null,
  });
  return Object.freeze({
    decision: "ping_requested" as const,
    mode: "duffel_test_mode" as const,
    webhookIdSha256: createHash("sha256")
      .update(input.webhook.id, "utf8")
      .digest("hex"),
  });
}

export async function executeFlightConsumerPreviewDuffelWebhookBootstrap(
  untrusted: Readonly<{
    actorId: string;
    confirmation: string;
    idempotencyKey: string;
  }>,
  dependencies: FlightConsumerPreviewDuffelWebhookBootstrapDependencies = {
    env: process.env,
    fetcher: fetch,
  },
): Promise<
  | FlightConsumerPreviewDuffelWebhookBootstrapResult
  | FlightConsumerPreviewDuffelWebhookPingResult
> {
  try {
    const input = inputSchema.parse(untrusted);
    if (typeof dependencies.fetcher !== "function") fail();
    const receiverUrl = createExactReceiverUrl(dependencies.env);
    const accessToken = validateDuffelSandboxAccessToken(
      dependencies.env.DUFFEL_TEST_ACCESS_TOKEN,
    );
    const webhooks = await listAllTestWebhooks({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
    });

    if (
      input.confirmation
      === FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION
    ) {
      if (webhooks.length !== 0) fail("conflict");
      return await createOneTestWebhook({
        accessToken,
        correlationId: input.idempotencyKey,
        fetcher: dependencies.fetcher,
        receiverUrl,
      });
    }

    if (
      webhooks.length !== 1
      || !isExactTestWebhook(webhooks[0]!, receiverUrl)
    ) fail("conflict");
    return await pingExactTestWebhook({
      accessToken,
      correlationId: input.idempotencyKey,
      fetcher: dependencies.fetcher,
      webhook: webhooks[0]!,
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelWebhookBootstrapError) throw error;
    throw new FlightConsumerPreviewDuffelWebhookBootstrapError();
  }
}

export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_LIST_URL =
  listWebhooksUrl;
export const FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_RECEIVER_PATH =
  webhookReceiverPath;

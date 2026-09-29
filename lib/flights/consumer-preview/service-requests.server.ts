import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  flightConsumerPreviewServiceRequestInputSchema,
  flightConsumerPreviewServiceRequestStatusSchema,
  flightConsumerPreviewServiceRequestTypeSchema,
  type FlightConsumerPreviewServiceRequestDto,
} from "./service-request-contract";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));

const serviceRequestRowSchema = z.object({
  service_request_id: uuidSchema,
  order_id: uuidSchema,
  request_type: flightConsumerPreviewServiceRequestTypeSchema,
  reason_code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  request_status: flightConsumerPreviewServiceRequestStatusSchema,
  created_at: instantSchema,
  updated_at: instantSchema,
}).strict();

const createResultRowSchema = serviceRequestRowSchema.extend({
  decision: z.enum(["created", "replay"]),
}).strict();

const adminServiceRequestRowSchema = serviceRequestRowSchema.extend({
  customer_id: uuidSchema,
  confirmation_code: z.string().min(1).max(64),
  order_status: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
}).strict();

export interface FlightConsumerPreviewServiceRequestRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export class FlightConsumerPreviewServiceRequestError extends Error {
  readonly kind: "conflict" | "unavailable";

  constructor(kind: "conflict" | "unavailable" = "unavailable") {
    super("Flight Consumer Preview support requests are unavailable.");
    this.name = "FlightConsumerPreviewServiceRequestError";
    this.kind = kind;
  }
}

export type FlightConsumerPreviewAdminServiceRequest =
  FlightConsumerPreviewServiceRequestDto & Readonly<{
    customerId: string;
    confirmationCode: string;
    orderStatus: string;
  }>;

function requestDto(row: z.infer<typeof serviceRequestRowSchema>): FlightConsumerPreviewServiceRequestDto {
  return Object.freeze({
    id: row.service_request_id,
    orderId: row.order_id,
    requestType: row.request_type,
    reasonCode: row.reason_code,
    status: row.request_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rpcErrorKind(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return "unavailable" as const;
  const code = String((error as { code?: unknown }).code ?? "");
  return ["23505", "23514", "40001"].includes(code) ? "conflict" as const : "unavailable" as const;
}

async function callRpc(
  client: FlightConsumerPreviewServiceRequestRpcClient,
  name: string,
  parameters: Readonly<Record<string, unknown>>,
) {
  try {
    const result = await client.rpc(name, parameters);
    if (result.error) throw new FlightConsumerPreviewServiceRequestError(rpcErrorKind(result.error));
    return result.data;
  } catch (error) {
    if (error instanceof FlightConsumerPreviewServiceRequestError) throw error;
    throw new FlightConsumerPreviewServiceRequestError();
  }
}

export function hashFlightConsumerPreviewServiceRequestIdempotencyKey(idempotencyKey: string) {
  const parsed = uuidSchema.safeParse(idempotencyKey);
  if (!parsed.success) throw new FlightConsumerPreviewServiceRequestError("conflict");
  return createHash("sha256")
    .update("iratepilot.flight.consumer-preview.service-request-idempotency.v1\n")
    .update(parsed.data.toLowerCase())
    .digest("hex");
}

export async function createFlightConsumerPreviewServiceRequest(
  client: FlightConsumerPreviewServiceRequestRpcClient,
  input: Readonly<{
    orderId: string;
    requestType: string;
    reasonCode: string;
    idempotencyKey: string;
  }>,
) {
  const parsed = z.object({
    orderId: uuidSchema,
    requestType: z.string(),
    reasonCode: z.string(),
    idempotencyKey: uuidSchema,
  }).strict().superRefine((value, context) => {
    const request = flightConsumerPreviewServiceRequestInputSchema.safeParse({
      requestType: value.requestType,
      reasonCode: value.reasonCode,
    });
    if (!request.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid service request." });
    }
  }).safeParse(input);
  if (!parsed.success) throw new FlightConsumerPreviewServiceRequestError("conflict");
  const request = flightConsumerPreviewServiceRequestInputSchema.parse({
    requestType: parsed.data.requestType,
    reasonCode: parsed.data.reasonCode,
  });
  const raw = await callRpc(client, "create_flight_consumer_preview_service_request_v1", {
    p_order_id: parsed.data.orderId,
    p_request_type: request.requestType,
    p_reason_code: request.reasonCode,
    p_idempotency_key_sha256:
      hashFlightConsumerPreviewServiceRequestIdempotencyKey(parsed.data.idempotencyKey),
  });
  const rows = z.array(createResultRowSchema).length(1).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewServiceRequestError();
  const row = rows.data[0]!;
  if (row.order_id !== parsed.data.orderId) throw new FlightConsumerPreviewServiceRequestError();
  return Object.freeze({ decision: row.decision, request: requestDto(row) });
}

export async function listFlightConsumerPreviewServiceRequests(
  client: FlightConsumerPreviewServiceRequestRpcClient,
  input: Readonly<{ orderId?: string | null }> = {},
) {
  const parsed = z.object({ orderId: uuidSchema.nullable().default(null) }).strict().safeParse(input);
  if (!parsed.success) throw new FlightConsumerPreviewServiceRequestError("conflict");
  const raw = await callRpc(client, "list_flight_consumer_preview_service_requests_v1", {
    p_order_id: parsed.data.orderId,
  });
  const rows = z.array(serviceRequestRowSchema).max(200).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewServiceRequestError();
  if (parsed.data.orderId !== null && rows.data.some((row) => row.order_id !== parsed.data.orderId)) {
    throw new FlightConsumerPreviewServiceRequestError();
  }
  return Object.freeze(rows.data.map(requestDto));
}

export async function listFlightConsumerPreviewAdminServiceRequests(
  client: FlightConsumerPreviewServiceRequestRpcClient,
  input: Readonly<{ limit?: number; status?: string | null }> = {},
) {
  const parsed = z.object({
    limit: z.number().int().min(1).max(100).default(50),
    status: flightConsumerPreviewServiceRequestStatusSchema.nullable().default(null),
  }).strict().safeParse(input);
  if (!parsed.success) throw new FlightConsumerPreviewServiceRequestError("conflict");
  const raw = await callRpc(client, "list_flight_consumer_admin_service_requests_v1", {
    p_limit: parsed.data.limit,
    p_status: parsed.data.status,
  });
  const rows = z.array(adminServiceRequestRowSchema).max(parsed.data.limit).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewServiceRequestError();
  return Object.freeze(rows.data.map((row): FlightConsumerPreviewAdminServiceRequest => Object.freeze({
    ...requestDto(row),
    customerId: row.customer_id,
    confirmationCode: row.confirmation_code,
    orderStatus: row.order_status,
  })));
}

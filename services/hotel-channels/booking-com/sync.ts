import { createHash, randomUUID } from "node:crypto";
import { buildBookingComInventoryAriPlan, type BookingComInventoryPlan } from "./inventory-to-ari";

export type BookingComSyncStore = {
  loadInventoryPlan(input: {
    propertyId: string;
    connectionId: string;
    startDate: string;
    endDate: string;
    currency: string;
    priceBasis: "before_tax" | "after_tax";
  }): Promise<Omit<BookingComInventoryPlan, "now"> & { propertyId: string; connectionId: string }>;
  enqueue(input: {
    connectionId: string;
    syncId: string;
    requestIndex: number;
    kind: "availability" | "rate";
    providerPropertyId: string;
    endpoint: string;
    requestXml: string;
    requestSha256: string;
  }): Promise<{ outcome: string; jobId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export type BookingComSyncInput = {
  propertyId: string;
  connectionId: string;
  syncId: string;
  startDate: string;
  endDate: string;
  currency: string;
  priceBasis: "before_tax" | "after_tax";
};

export function parseBookingComSyncInput(value: unknown): BookingComSyncInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["propertyId", "connectionId", "syncId", "startDate", "endDate", "currency", "priceBasis"].includes(key))
    || typeof row.propertyId !== "string" || !UUID.test(row.propertyId)
    || typeof row.connectionId !== "string" || !/^booking-[a-f0-9]{32}$/.test(row.connectionId)
    || typeof row.syncId !== "string" || !UUID.test(row.syncId)
    || typeof row.startDate !== "string" || !validDate(row.startDate)
    || typeof row.endDate !== "string" || !validDate(row.endDate)
    || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)
    || (row.priceBasis !== "before_tax" && row.priceBasis !== "after_tax")) return null;
  const start = Date.parse(`${row.startDate}T00:00:00Z`);
  const end = Date.parse(`${row.endDate}T00:00:00Z`);
  if (end < start || end - start > 89 * 86_400_000) return null;
  return row as unknown as BookingComSyncInput;
}

/** Builds and durably queues an idempotent 90-day maximum test-mode ARI sync. */
export async function queueBookingComInventorySync(
  input: BookingComSyncInput,
  store: BookingComSyncStore,
  now = new Date(),
) {
  if (!parseBookingComSyncInput(input) || !store || !(now instanceof Date) || !Number.isFinite(now.valueOf())) {
    throw new Error("booking_com_sync_input_invalid");
  }
  const source = await store.loadInventoryPlan(input);
  if (source.propertyId !== input.propertyId || source.connectionId !== input.connectionId) {
    throw new Error("booking_com_sync_scope_mismatch");
  }
  const requests = buildBookingComInventoryAriPlan({ ...source, now });
  if (requests.length > 1000) throw new Error("booking_com_sync_too_many_requests");
  const jobs = [];
  for (const [requestIndex, request] of requests.entries()) {
    const requestXml = request.body;
    jobs.push(await store.enqueue({
      connectionId: input.connectionId,
      syncId: input.syncId,
      requestIndex,
      kind: request.kind,
      providerPropertyId: request.channelPropertyId,
      endpoint: request.endpoint,
      requestXml,
      requestSha256: createHash("sha256").update(requestXml, "utf8").digest("hex"),
    }));
  }
  return {
    syncId: input.syncId,
    queued: jobs.filter((job) => job.outcome === "queued").length,
    existing: jobs.filter((job) => job.outcome === "duplicate").length,
    jobIds: jobs.map((job) => job.jobId),
    environment: "test" as const,
    dispatched: false as const,
  };
}

export function createBookingComSyncId() {
  return randomUUID();
}

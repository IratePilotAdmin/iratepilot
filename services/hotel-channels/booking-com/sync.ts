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

export type BookingComYearSyncInput = Omit<BookingComSyncInput, "endDate">;

/** Splits 366 consecutive nights into stable, non-overlapping 90-day test scopes. */
export function planBookingComYearSync(input: BookingComYearSyncInput): BookingComSyncInput[] {
  if (!parseBookingComSyncInput({ ...input, endDate: input?.startDate })) {
    throw new Error("booking_com_sync_input_invalid");
  }
  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const windows: BookingComSyncInput[] = [];
  for (let offset = 0; offset < 366; offset += 90) {
    const endOffset = Math.min(offset + 89, 365);
    const digest = createHash("sha256").update(`booking-com-year-v1:${input.syncId}:${offset}`).digest();
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = digest.subarray(0, 16).toString("hex");
    const syncId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    windows.push({ ...input, syncId,
      startDate: new Date(start + offset * 86_400_000).toISOString().slice(0, 10),
      endDate: new Date(start + endOffset * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return windows;
}

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

function requireCompleteInventoryWindow(input: BookingComSyncInput, source: BookingComInventoryPlan) {
  if (!Array.isArray(source.mappings) || !Array.isArray(source.inventory)) return;
  const mappedRooms = new Set(source.mappings.map((mapping) => mapping.localRoomId));
  // The payload builder reports the existing invalid-plan error for no mappings.
  if (mappedRooms.size === 0) return;
  const datesByRoom = new Map<string, Set<string>>();
  for (const row of source.inventory) {
    if (row.date < input.startDate || row.date > input.endDate) throw new Error("booking_com_sync_inventory_outside_window");
    if (!mappedRooms.has(row.roomId)) continue;
    const dates = datesByRoom.get(row.roomId) ?? new Set<string>();
    dates.add(row.date);
    datesByRoom.set(row.roomId, dates);
  }
  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const end = Date.parse(`${input.endDate}T00:00:00Z`);
  for (let day = start; day <= end; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    for (const roomId of mappedRooms) {
      if (!datesByRoom.get(roomId)?.has(date)) throw new Error("booking_com_sync_incomplete_inventory");
    }
  }
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
  requireCompleteInventoryWindow(input, source);
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

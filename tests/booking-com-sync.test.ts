import { describe, expect, it, vi } from "vitest";
import { queueBookingComInventorySync, parseBookingComSyncInput, type BookingComSyncStore } from "@/services/hotel-channels/booking-com/sync";

const input = {
  propertyId: "11111111-1111-4111-8111-111111111111",
  connectionId: `booking-${"a".repeat(32)}`,
  syncId: "22222222-2222-4222-8222-222222222222",
  startDate: "2026-10-01",
  endDate: "2026-10-01",
  currency: "USD",
  priceBasis: "before_tax" as const,
};

function store(overrides: Partial<BookingComSyncStore> = {}) {
  const enqueue = vi.fn(async (value: Parameters<BookingComSyncStore["enqueue"]>[0]) => ({ outcome: "queued", jobId: `job-${value.requestIndex}` }));
  const base: BookingComSyncStore = {
    loadInventoryPlan: async () => ({
      propertyId: input.propertyId,
      connectionId: input.connectionId,
      channelPropertyId: "booking-property-1",
      currency: input.currency,
      priceBasis: input.priceBasis,
      propertyRoomIds: ["room-1"],
      mappings: [{ providerRoomTypeId: "NDQ2", providerRatePlanId: "BAR", localRoomId: "room-1" }],
      inventory: [{ roomId: "room-1", date: "2026-10-01", availableUnits: 2, nightlyRate: "125.00" }],
    }),
    enqueue,
    ...overrides,
  };
  return { value: base, enqueue };
}

describe("Booking.com inventory sync queue", () => {
  it("validates bounded explicit scopes and rejects unexpected fields", () => {
    expect(parseBookingComSyncInput(input)).toEqual(input);
    expect(parseBookingComSyncInput({ ...input, extra: true })).toBeNull();
    expect(parseBookingComSyncInput({ ...input, endDate: "2026-12-30" })).toBeNull();
    expect(parseBookingComSyncInput({ ...input, startDate: "2026-02-30" })).toBeNull();
  });

  it("generates exact property-scoped request XML, hashes it, and queues using caller idempotency", async () => {
    const fake = store();
    const result = await queueBookingComInventorySync(input, fake.value, new Date("2026-09-25T12:00:00Z"));
    expect(result).toMatchObject({ syncId: input.syncId, queued: 2, existing: 0, environment: "test", dispatched: false });
    expect(fake.enqueue).toHaveBeenCalledTimes(2);
    expect(fake.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      connectionId: input.connectionId,
      syncId: input.syncId,
      requestIndex: 0,
      kind: "availability",
      providerPropertyId: "booking-property-1",
      requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(fake.enqueue.mock.calls[0]?.[0].requestXml).toContain('BookingLimit="2"');
    expect(fake.enqueue.mock.calls[1]?.[0].requestXml).toContain('AmountBeforeTax="12500"');
  });

  it("does not enqueue plans for mismatched database scope or incomplete inventory", async () => {
    const mismatched = store({ loadInventoryPlan: async () => ({
      propertyId: "33333333-3333-4333-8333-333333333333",
      connectionId: input.connectionId,
      channelPropertyId: "booking-property-1", currency: "USD", priceBasis: "before_tax",
      propertyRoomIds: ["room-1"], mappings: [], inventory: [],
    }) });
    await expect(queueBookingComInventorySync(input, mismatched.value, new Date("2026-09-25T12:00:00Z")))
      .rejects.toThrow("booking_com_sync_scope_mismatch");
    expect(mismatched.enqueue).not.toHaveBeenCalled();

    const empty = store({ loadInventoryPlan: async () => ({
      propertyId: input.propertyId, connectionId: input.connectionId,
      channelPropertyId: "booking-property-1", currency: "USD", priceBasis: "before_tax",
      propertyRoomIds: ["room-1"], mappings: [], inventory: [],
    }) });
    await expect(queueBookingComInventorySync(input, empty.value, new Date("2026-09-25T12:00:00Z")))
      .rejects.toThrow("invalid_inventory_plan");
    expect(empty.enqueue).not.toHaveBeenCalled();
  });
});

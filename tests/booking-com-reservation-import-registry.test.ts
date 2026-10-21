import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({
  rows: new Map<string, unknown[]>(),
  limits: [] as Array<{ table: string; limit: number }>,
  claims: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        limit: (limit: number) => {
          registry.limits.push({ table, limit });
          return Promise.resolve({ data: (registry.rows.get(table) ?? []).slice(0, limit), error: null });
        },
      };
      return query;
    },
    rpc: () => { registry.claims++; throw new Error("A reservation was leased"); },
  }),
}));

import { runBookingComReservationImport } from "@/lib/booking-com-reservation-import";

const config = {
  supabaseUrl: "https://source.supabase.co", serviceRoleKey: "s".repeat(40),
  credentialEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
  reservationEncryptionKey: Buffer.alloc(32, 2).toString("base64"),
  destinationUrl: "https://receiver.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  destinationPublishableKey: `sb_publishable_${"p".repeat(20)}`,
};

beforeEach(() => {
  registry.rows.clear();
  registry.limits.length = 0;
  registry.claims = 0;
});

describe("Booking.com PMS import registry pagination boundary", () => {
  it.each([
    ["irp_ota_channel_connections", 51],
    ["irp_pms_outbox_connections", 101],
    ["irp_pms_native_ari_connections", 101],
  ])("fails before claiming when %s has more than the supported limit", async (table, count) => {
    registry.rows.set(table, Array.from({ length: count }, () => ({})));
    await expect(runBookingComReservationImport(config)).rejects.toThrow(
      "booking_com_reservation_import_registry_limit_exceeded",
    );
    expect(registry.claims).toBe(0);
    expect(registry.limits).toEqual(expect.arrayContaining([
      { table: "irp_ota_channel_connections", limit: 51 },
      { table: "irp_pms_outbox_connections", limit: 101 },
      { table: "irp_pms_native_ari_connections", limit: 101 },
    ]));
  });
});

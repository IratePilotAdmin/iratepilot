import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({
  rows: [] as unknown[],
  requestedLimit: 0,
  selectedColumns: "",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "irp_ota_channel_connections") throw new Error("unexpected table");
      const query = {
        select: (columns: string) => { registry.selectedColumns = columns; return query; },
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: (limit: number) => {
          registry.requestedLimit = limit;
          return Promise.resolve({ data: registry.rows.slice(0, limit), error: null });
        },
      };
      return query;
    },
  }),
}));

import { runBookingComReservationPoller } from "@/lib/booking-com-reservation-poller";

beforeEach(() => {
  registry.rows = [];
  registry.requestedLimit = 0;
  registry.selectedColumns = "";
});

describe("Booking.com reservation polling connection boundary", () => {
  it("refuses to poll any hotel when the approved registry exceeds 50", async () => {
    registry.rows = Array.from({ length: 51 }, () => ({}));
    const fetcher = vi.fn();
    const getToken = vi.fn();

    await expect(runBookingComReservationPoller({
      fetcher: fetcher as typeof fetch,
      getToken,
    })).rejects.toThrow("booking_com_reservation_connection_limit_exceeded");

    expect(registry.requestedLimit).toBe(51);
    expect(getToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts exactly 50 rows without provider calls for invalid rows", async () => {
    registry.rows = Array.from({ length: 50 }, () => ({}));
    const fetcher = vi.fn();
    const result = await runBookingComReservationPoller({ fetcher: fetcher as typeof fetch });

    expect(registry.requestedLimit).toBe(51);
    expect(result).toMatchObject({ connections: 50, polled: 0, review: 50, acknowledgementsSent: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads the stored certification decision and skips an uncertified hotel", async () => {
    registry.rows = [{
      connection_id: "booking-test-one",
      property_id: "11111111-1111-4111-8111-111111111111",
      provider_property_id: "12345",
      machine_account_id: "22222222-2222-4222-8222-222222222222",
      certification_complete: false,
    }];
    const getToken = vi.fn();
    const fetcher = vi.fn();
    const result = await runBookingComReservationPoller({ getToken, fetcher: fetcher as typeof fetch });

    expect(registry.selectedColumns).toContain("certification_complete");
    expect(result).toMatchObject({ polled: 0, review: 1, acknowledgementsSent: 0 });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

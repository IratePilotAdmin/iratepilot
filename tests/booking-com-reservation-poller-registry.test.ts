import { beforeEach, describe, expect, it, vi } from "vitest";

const registry = vi.hoisted(() => ({
  rows: [] as unknown[],
  requestedLimit: 0,
  selectedColumns: "",
  lookups: {} as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (!["irp_ota_channel_connections", "properties", "irp_ota_machine_accounts", "partners"].includes(table)) throw new Error("unexpected table");
      const query = {
        select: (columns: string) => { registry.selectedColumns = columns; return query; },
        eq: () => query,
        not: () => query,
        order: () => query,
        maybeSingle: () => Promise.resolve({ data: registry.lookups[table] ?? null, error: null }),
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
  registry.lookups = {};
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

  it("rereads the connection and refuses a hotel disabled after the initial list", async () => {
    const listed = {
      connection_id: "booking-test-one",
      property_id: "11111111-1111-4111-8111-111111111111",
      provider_property_id: "12345",
      machine_account_id: "22222222-2222-4222-8222-222222222222",
      certification_complete: true,
    };
    registry.rows = [listed];
    registry.lookups = {
      irp_ota_channel_connections: { ...listed, provider: "booking_com", environment: "test",
        enabled: false, partner_approved: true, pii_compliance_approved: true },
      properties: { id: listed.property_id, partner_id: "33333333-3333-4333-8333-333333333333", active: true },
      partners: { id: "33333333-3333-4333-8333-333333333333", status: "approved" },
      irp_ota_machine_accounts: { id: listed.machine_account_id, property_id: listed.property_id,
        provider: "booking_com", environment: "test", enabled: true, partner_approved: true,
        approved_at: "2026-10-01T00:00:00Z" },
    };
    const getToken = vi.fn();
    const fetcher = vi.fn();
    const result = await runBookingComReservationPoller({ getToken, fetcher: fetcher as typeof fetch });

    expect(result).toMatchObject({ polled: 0, review: 1, acknowledgementsSent: 0 });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

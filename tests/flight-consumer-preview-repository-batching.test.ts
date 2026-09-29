import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createClient, requireRuntime } = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireRuntime: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: requireRuntime,
}));

import { listConsumerFlightOrders } from "../lib/flights/consumer-preview/repository.server";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const executionScopeSha256 = "a".repeat(64);

function awaitableQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: typeof result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe("Consumer Preview My Trips repository", () => {
  beforeEach(() => {
    createClient.mockReset();
    requireRuntime.mockReset();
    requireRuntime.mockResolvedValue({ binding: { executionScopeSha256 } });
  });

  it("loads a bounded order page with one batched query per related relation", async () => {
    const calls = new Map<string, number>();
    const rows: Record<string, unknown[]> = {
      flight_orders: [{
        id: orderId,
        search_id: searchId,
        offer_id: offerId,
        confirmation_code: "IRP-TEST-0001",
        status: "ticketed",
        currency: "USD",
        total_cents: 9_442,
        created_at: "2026-08-25T12:00:00.000Z",
        updated_at: "2026-08-25T12:01:00.000Z",
      }],
      flight_searches: [{
        id: searchId,
        origin_iata: "ORD",
        destination_iata: "MIA",
        departure_date: "2026-11-05",
        return_date: null,
        cabin: "economy",
        adult_count: 1,
        child_count: 0,
        infant_in_seat_count: 0,
        infant_on_lap_count: 0,
      }],
      flight_payments: [{
        order_id: orderId,
        status: "captured",
        updated_at: "2026-08-25T12:01:00.000Z",
      }],
      flight_ticket_documents: [
        { order_id: orderId, status: "issued" },
        { order_id: orderId, status: "voided" },
      ],
    };
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: customerId } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({
        data: [{
          service_request_id: "55555555-5555-4555-8555-555555555555",
          order_id: orderId,
          request_type: "cancel",
          reason_code: "plans_changed",
          request_status: "requested",
          created_at: "2026-08-25T12:02:00.000Z",
          updated_at: "2026-08-25T12:02:00.000Z",
        }],
        error: null,
      }),
      from: vi.fn((table: string) => {
        calls.set(table, (calls.get(table) ?? 0) + 1);
        return awaitableQuery({ data: rows[table] ?? [], error: null });
      }),
    });

    const orders = await listConsumerFlightOrders();

    expect(orders).toEqual([expect.objectContaining({
      id: orderId,
      confirmationCode: "IRP-TEST-0001",
      status: "ticketed",
      paymentStatus: "captured",
      ticketCount: 1,
      serviceRequestCount: 1,
      latestServiceRequestStatus: "requested",
      serviceRequestsAvailable: true,
      search: expect.objectContaining({ origin: "ORD", destination: "MIA", travelerCount: 1 }),
    })]);
    expect(Object.fromEntries(calls)).toEqual({
      flight_orders: 1,
      flight_searches: 1,
      flight_payments: 1,
      flight_ticket_documents: 1,
    });
  });

  it("returns immediately without related reads when the customer has no orders", async () => {
    const from = vi.fn(() => awaitableQuery({ data: [], error: null }));
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: customerId } }, error: null }) },
      rpc: vi.fn(),
      from,
    });

    await expect(listConsumerFlightOrders()).resolves.toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("flight_orders");
  });

  it("does not block durable booking reads when the optional support ledger is unavailable", async () => {
    const rows: Record<string, unknown[]> = {
      flight_orders: [{
        id: orderId,
        search_id: searchId,
        offer_id: offerId,
        confirmation_code: "IRP-TEST-0001",
        status: "ticketed",
        currency: "USD",
        total_cents: 9_442,
        created_at: "2026-08-25T12:00:00.000Z",
        updated_at: "2026-08-25T12:01:00.000Z",
      }],
      flight_searches: [{
        id: searchId,
        origin_iata: "ORD",
        destination_iata: "MIA",
        departure_date: "2026-11-05",
        return_date: null,
        cabin: "economy",
        adult_count: 1,
        child_count: 0,
        infant_in_seat_count: 0,
        infant_on_lap_count: 0,
      }],
      flight_payments: [{ order_id: orderId, status: "captured", updated_at: "2026-08-25T12:01:00.000Z" }],
      flight_ticket_documents: [{ order_id: orderId, status: "issued" }],
    };
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: customerId } }, error: null }) },
      rpc: vi.fn().mockRejectedValue(new Error("support RPC unavailable")),
      from: vi.fn((table: string) => awaitableQuery({ data: rows[table] ?? [], error: null })),
    });

    await expect(listConsumerFlightOrders()).resolves.toEqual([
      expect.objectContaining({
        id: orderId,
        status: "ticketed",
        paymentStatus: "captured",
        ticketCount: 1,
        serviceRequestCount: 0,
        latestServiceRequestStatus: null,
        serviceRequestsAvailable: false,
      }),
    ]);
  });
});

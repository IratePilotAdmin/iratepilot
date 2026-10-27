import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyRatehawkCertificationFailure,
  RatehawkCertificationRunnerError,
  runRatehawkCertificationScenario,
} from "../services/hotel-suppliers/ratehawk-certification-runner.server";
import { InventorySupplierResponseError } from "../services/hotel-suppliers/inventory-response.server";
import { InventorySandboxTransportError } from "../services/hotel-suppliers/inventory-sandbox-transport.server";

const environment = {
  HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
  HOTEL_INVENTORY_RATEHAWK_KEY_ID: "partner-id",
  HOTEL_INVENTORY_RATEHAWK_API_KEY: "ratehawk-api-key",
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createFetcher(finalStatus: "ok" | "error", options?: {
  finalError?: string;
  priceChanged?: boolean;
}) {
  let partnerOrderId = "";
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (url.endsWith("/search/hp/")) {
      return jsonResponse({
        status: "ok",
        data: { hotels: [{ rates: [{ book_hash: "search-rate-hash" }] }] },
      });
    }
    if (url.endsWith("/hotel/prebook/")) {
      return jsonResponse({
        status: "ok",
        data: {
          changes: { price_changed: options?.priceChanged ?? false },
          hotels: [{ rates: [{ book_hash: "booking-rate-hash" }] }],
        },
      });
    }
    if (url.endsWith("/booking/form/")) {
      partnerOrderId = String(body.partner_order_id);
      return jsonResponse({
        status: "ok",
        data: {
          order_id: 123,
          partner_order_id: partnerOrderId,
          payment_types: [{ type: "deposit", amount: "100.00", currency_code: "USD" }],
        },
      });
    }
    if (url.endsWith("/booking/finish/")) return jsonResponse({ status: "ok" });
    if (url.endsWith("/booking/finish/status/")) {
      return finalStatus === "ok"
        ? jsonResponse({ status: "ok", data: { partner_order_id: partnerOrderId } })
        : jsonResponse({
          status: "error",
          error: options?.finalError ?? "soldout",
          data: { partner_order_id: partnerOrderId },
        });
    }
    if (url.endsWith("/order/cancel/")) {
      return jsonResponse({
        status: "ok",
        data: { amount_payable: { amount: "0.00", currency_code: "USD" } },
      });
    }
    throw new Error(`Unexpected RateHawk endpoint: ${url}`);
  });
}

describe("RateHawk certification runner", () => {
  it("returns only allowlisted, non-secret diagnostic fields", () => {
    expect(classifyRatehawkCertificationFailure(
      new RatehawkCertificationRunnerError("unexpected_outcome"),
    )).toEqual({ code: "runner_unexpected_outcome", status: null });
    expect(classifyRatehawkCertificationFailure(
      new RatehawkCertificationRunnerError("unexpected_outcome", {
        status: "failed",
        error: "incorrect_children_data",
        attempts: 2,
      }),
    )).toEqual({
      code: "runner_unexpected_outcome",
      status: null,
      outcomeStatus: "failed",
      outcomeError: "incorrect_children_data",
      attempts: 2,
    });
    expect(classifyRatehawkCertificationFailure(
      new RatehawkCertificationRunnerError("unexpected_outcome", {
        status: "failed",
        error: "credential_like_token_123",
        attempts: 1,
      }),
    ).outcomeError).toBe("unrecognized");
    expect(classifyRatehawkCertificationFailure(
      new InventorySandboxTransportError("ratehawk", "timeout"),
    )).toEqual({ code: "transport_timeout", status: null });
    expect(classifyRatehawkCertificationFailure(
      new InventorySupplierResponseError("ratehawk", "supplier_error", 429),
    )).toEqual({ code: "supplier_supplier_error", status: 429 });
    expect(classifyRatehawkCertificationFailure(new Error("secret details")))
      .toEqual({ code: "unknown_error", status: null });
  });

  it("runs the child scenario and cancels a confirmed sandbox reservation", async () => {
    const fetcher = createFetcher("ok");

    const result = await runRatehawkCertificationScenario({
      environment,
      scenarioId: "children",
      fetcher,
      now: new Date("2026-10-27T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      scenario: "children",
      finalStatus: "confirmed",
      cancelled: true,
      cancellationAmount: "0.00",
      cancellationCurrency: "USD",
      bookingFormAttempts: 1,
      statusAttempts: 1,
    });
    expect(result.partnerOrderId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fetcher).toHaveBeenCalledTimes(6);

    const hotelpage = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(hotelpage).toMatchObject({
      checkin: "2026-11-26",
      checkout: "2026-11-28",
      residency: "mc",
      hid: 10004834,
      guests: [{ adults: 2, children: [0, 17] }],
    });
    const bookingForm = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body));
    expect(bookingForm.user_ip).toBe("203.0.113.10");
    const finish = JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body));
    expect(finish.rooms[0].guests).toHaveLength(4);
    expect(finish.rooms[0].guests).toEqual([
      { first_name: "AdultOne", last_name: "Ratehawk" },
      { first_name: "AdultTwo", last_name: "Ratehawk" },
      { first_name: "ChildZero", last_name: "Ratehawk", is_child: true, age: 0 },
      { first_name: "ChildSeventeen", last_name: "Ratehawk", is_child: true, age: 17 },
    ]);
  });

  it("preserves the documented async suffix and does not cancel a failed booking", async () => {
    const fetcher = createFetcher("error");

    const result = await runRatehawkCertificationScenario({
      environment,
      scenarioId: "unknown_soldout",
      fetcher,
      now: new Date("2026-10-27T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      scenario: "unknown_soldout",
      finalStatus: "failed",
      finalError: "soldout",
      cancelled: false,
    });
    expect(result.partnerOrderId).toMatch(/_unknown_soldout$/);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/order/cancel/"))).toBe(false);
  });

  it("requires the documented price increase to be present", async () => {
    await expect(runRatehawkCertificationScenario({
      environment,
      scenarioId: "price_change",
      fetcher: createFetcher("ok", { priceChanged: false }),
      now: new Date("2026-10-27T12:00:00.000Z"),
    })).rejects.toMatchObject({ code: "unexpected_outcome" });

    await expect(runRatehawkCertificationScenario({
      environment,
      scenarioId: "price_change",
      fetcher: createFetcher("ok", { priceChanged: true }),
      now: new Date("2026-10-27T12:00:00.000Z"),
    })).resolves.toMatchObject({ finalStatus: "confirmed", cancelled: true });
  });

  it("rejects an asynchronous result that does not match its certification case", async () => {
    await expect(runRatehawkCertificationScenario({
      environment,
      scenarioId: "unknown_book_limit",
      fetcher: createFetcher("error", { finalError: "soldout" }),
      now: new Date("2026-10-27T12:00:00.000Z"),
    })).rejects.toMatchObject({ code: "unexpected_outcome" });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  CloudbedsHttpTransport,
  CloudbedsTransportError,
} from "../services/hotel-suppliers/cloudbeds";
import type { CloudbedsFetch } from "../services/hotel-suppliers/cloudbeds";

const config = { apiKey: "cbat_property_secret" };

function request(operation: "availability" | "create_reservation" | "cancel_reservation") {
  return {
    propertyCode: "hotel-1",
    operation,
    requestId: "IRP-200",
    payload: { propertyID: "12345", reservationID: "98765" },
  };
}

describe("CloudbedsHttpTransport", () => {
  it("sends authenticated availability as a GET query", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new CloudbedsHttpTransport(config, fetcher);

    await transport.execute({
      ...request("availability"),
      payload: { startDate: "2026-09-10", endDate: "2026-09-12", rooms: 1, adults: 2 },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.cloudbeds.com/api/v1.3/getAvailableRoomTypes?startDate=2026-09-10&endDate=2026-09-12&rooms=1&adults=2",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual(expect.objectContaining({
      "x-api-key": "cbat_property_secret",
      "x-iratepilot-request-id": "IRP-200",
    }));
  });

  it("posts reservation fields as form data", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new CloudbedsHttpTransport(config, fetcher);
    await transport.execute({
      ...request("create_reservation"),
      payload: {
        propertyID: "12345",
        guestFirstName: "Ada",
        guestLastName: "Lovelace",
        rooms: [{ roomTypeID: "KING", roomRateID: "BAR-KING", quantity: 1 }],
        adults: [{ roomTypeID: "KING", quantity: 2 }],
        children: [{ roomTypeID: "KING", quantity: 0 }],
      },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.cloudbeds.com/api/v1.3/postReservation");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get("propertyID")).toBe("12345");
    expect(body.get("guestFirstName")).toBe("Ada");
    expect(body.getAll("rooms")).toEqual([
      JSON.stringify([{ roomTypeID: "KING", roomRateID: "BAR-KING", quantity: 1 }]),
    ]);
    expect(body.getAll("adults")).toEqual([
      JSON.stringify([{ roomTypeID: "KING", quantity: 2 }]),
    ]);
    expect(body.getAll("children")).toEqual([
      JSON.stringify([{ roomTypeID: "KING", quantity: 0 }]),
    ]);
  });

  it("cancels through putReservation with an enforced canceled status", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response("{}", { status: 200 }));
    const transport = new CloudbedsHttpTransport(config, fetcher);
    await transport.execute({
      ...request("cancel_reservation"),
      payload: { reservationID: "98765", status: "confirmed" },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.cloudbeds.com/api/v1.3/putReservation");
    const body = init?.body as FormData;
    expect(body.get("reservationID")).toBe("98765");
    expect(body.get("status")).toBe("canceled");
  });

  it("rejects insecure or cross-origin configuration", async () => {
    expect(() => new CloudbedsHttpTransport({ ...config, baseUrl: "http://api.cloudbeds.test" }))
      .toThrow("must use HTTPS");
    const transport = new CloudbedsHttpTransport({
      ...config,
      operationPaths: { availability: "https://attacker.invalid/collect" },
    });
    await expect(transport.execute(request("availability"))).rejects.toThrow("configured origin");
  });

  it("returns structured errors without exposing the API key", async () => {
    const fetcher = vi.fn<CloudbedsFetch>(async () => new Response(
      JSON.stringify({ code: "AUTH_FAILED", message: "Authentication failed" }),
      { status: 401, headers: { "content-type": "application/json" } },
    ));
    const transport = new CloudbedsHttpTransport(config, fetcher);

    const error = await transport.execute(request("create_reservation")).catch((value) => value);
    expect(error).toBeInstanceOf(CloudbedsTransportError);
    expect(error).toMatchObject({
      status: 401,
      operation: "create_reservation",
      requestId: "IRP-200",
      responseCode: "AUTH_FAILED",
      message: "Authentication failed",
    });
    expect(JSON.stringify(error)).not.toContain(config.apiKey);
  });
});


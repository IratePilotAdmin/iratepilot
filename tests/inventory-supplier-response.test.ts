import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  InventorySupplierResponseError,
  parseInventorySupplierResponse,
} from "../services/hotel-suppliers/inventory-response.server";

describe("inventory supplier response boundary", () => {
  it.each(["hotelbeds", "ratehawk", "expedia-rapid"] as const)(
    "accepts a bounded JSON response for %s",
    (supplierId) => {
      expect(parseInventorySupplierResponse({
        supplierId,
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: '{"hotels":[{"id":"hotel-1","rates":[]}]}',
      })).toEqual({ hotels: [{ id: "hotel-1", rates: [] }] });
    },
  );

  it("accepts vendor JSON media types", () => {
    expect(parseInventorySupplierResponse({
      supplierId: "expedia-rapid",
      status: 200,
      contentType: "application/vnd.expedia+json",
      body: "[]",
    })).toEqual([]);
  });

  it("rejects supplier errors without exposing the response body", () => {
    const secretBody = '{"error":"credential secret must not escape"}';
    let thrown: unknown;
    try {
      parseInventorySupplierResponse({
        supplierId: "hotelbeds",
        status: 401,
        contentType: "application/json",
        body: secretBody,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InventorySupplierResponseError);
    expect(thrown).toMatchObject({
      supplierId: "hotelbeds",
      code: "supplier_error",
      status: 401,
    });
    expect(String(thrown)).not.toContain(secretBody);
    expect(String(thrown)).not.toContain("credential secret");
  });

  it.each([
    { contentType: "text/html", body: "{}", code: "invalid_content_type" },
    { contentType: "application/json", body: "", code: "invalid_body" },
    { contentType: "application/json", body: "{", code: "invalid_json" },
    { contentType: "application/json", body: "true", code: "invalid_body" },
  ])("rejects $code responses", ({ contentType, body, code }) => {
    expect(() => parseInventorySupplierResponse({
      supplierId: "ratehawk",
      status: 200,
      contentType,
      body,
    })).toThrow(expect.objectContaining({ code }));
  });

  it("rejects oversized and excessively nested responses", () => {
    expect(() => parseInventorySupplierResponse({
      supplierId: "expedia-rapid",
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: "x".repeat(5_000_001) }),
    })).toThrow(expect.objectContaining({ code: "response_too_large" }));

    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 34; index += 1) nested = { child: nested };
    expect(() => parseInventorySupplierResponse({
      supplierId: "expedia-rapid",
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(nested),
    })).toThrow(expect.objectContaining({ code: "response_too_complex" }));
  });
});

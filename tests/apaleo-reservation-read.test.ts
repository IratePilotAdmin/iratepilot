import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ApaleoReservationReadError,
  fetchApaleoReservation,
} from "../services/hotel-suppliers/apaleo/reservations";

describe("Apaleo reservation reads", () => {
  it("retrieves and hashes only a PII-free reservation snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "MUC-RES-1",
      propertyId: "MUC",
      status: "Confirmed",
      arrival: "2026-10-20T15:00:00Z",
      departure: "2026-10-22T11:00:00Z",
      created: "2026-10-15T12:00:00Z",
      modified: "2026-10-15T12:05:00Z",
      primaryGuest: { firstName: "Private", lastName: "Guest", email: "private@example.com" },
    }), { status: 200 }));

    const result = await fetchApaleoReservation({
      accessToken: "access-token",
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
    }, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.apaleo.com/booking/v1/reservations/MUC-RES-1"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("authorization")).toBe("Bearer access-token");
    expect(result).toEqual({
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
      status: "Confirmed",
      snapshotSha256: createHash("sha256").update(JSON.stringify({
        reservationId: "MUC-RES-1",
        propertyCode: "MUC",
        status: "Confirmed",
        arrival: "2026-10-20T15:00:00.000Z",
        departure: "2026-10-22T11:00:00.000Z",
        createdAt: "2026-10-15T12:00:00.000Z",
        modifiedAt: "2026-10-15T12:05:00.000Z",
      })).digest("hex"),
    });
    expect(JSON.stringify(result)).not.toMatch(/Private|Guest|private@example/);
  });

  it("rejects a reservation returned for a different property", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "MUC-RES-1",
      propertyId: "BER",
      status: "Confirmed",
    }), { status: 200 }));

    await expect(fetchApaleoReservation({
      accessToken: "access-token",
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
    }, fetcher)).rejects.toMatchObject({
      status: 409,
      detailCode: "reservation_mismatch",
    });
  });

  it("returns a stable error code without exposing the provider response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: "Private provider detail",
    }), { status: 404 }));

    await expect(fetchApaleoReservation({
      accessToken: "access-token",
      reservationId: "MUC-RES-1",
      propertyCode: "MUC",
    }, fetcher)).rejects.toEqual(expect.objectContaining<Partial<ApaleoReservationReadError>>({
      status: 404,
      detailCode: "http_404",
      message: "Apaleo reservation read failed with status 404",
    }));
  });
});

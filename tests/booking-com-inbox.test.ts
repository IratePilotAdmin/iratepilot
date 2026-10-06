import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptBookingComReservation, stageBookingComReservation } from "../services/hotel-channels/booking-com/inbox";
import type { BookingComInboundReservation } from "../services/hotel-channels/booking-com/reservation-parser";

const key = Buffer.alloc(32, 7).toString("base64");
const reservation: BookingComInboundReservation = {
  reservationIds: [{ value: "booking-9001", source: "BOOKING.COM", type: "14" }],
  providerPropertyId: "12345", status: "Book",
  guest: { name: "Guest Example", email: "guest@example.com", phone: "+1 555 0100" },
  rooms: [{ providerRoomIndex: 1, providerRoomTypeId: "room-1", providerRatePlanId: "bar", checkIn: "2026-10-02", checkOut: "2026-10-04", guests: 2, totalMinor: 32550, totalBasis: "after_tax", currency: "USD" }],
};
const input = {
  connectionId: "booking-test-1", propertyId: "10000000-0000-4000-8000-000000000001",
  providerPropertyId: "12345", eventKind: "new" as const, reservation,
};
const previousKey = process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY;
  else process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = previousKey;
});

describe("encrypted OTA reservation inbox staging", () => {
  it("encrypts normalized guest data and stages only hashes plus ciphertext", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    let captured: Record<string, unknown> | undefined;
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      captured = args;
      return { data: { outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001" }, error: null };
    });
    const result = await stageBookingComReservation(rpc, input);
    expect(result).toMatchObject({ outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001" });
    expect(captured).toBeDefined();
    expect(captured).not.toHaveProperty("guest");
    expect(captured).not.toHaveProperty("p_reservation_id");
    expect(captured?.p_reservation_id_sha256).toBe(createHash("sha256").update("booking_com\u000012345\u0000booking-9001").digest("hex"));
    expect(captured?.p_ciphertext).not.toContain("guest@example.com");
    const clear = decryptBookingComReservation({
      connectionId: input.connectionId, propertyId: input.propertyId,
      reservationIdDigest: String(captured?.p_reservation_id_sha256), payloadDigest: String(captured?.p_payload_sha256),
      ciphertext: String(captured?.p_ciphertext), iv: String(captured?.p_iv), tag: String(captured?.p_tag),
    });
    expect(clear).toMatchObject({ provider: "booking_com", eventKind: "new", reservation: { guest: reservation.guest } });
    expect(captured?.p_room_mappings).toEqual([{ roomTypeId: "room-1", ratePlanId: "bar" }]);
  });

  it("fails closed without a valid encryption key and does not call the database", async () => {
    delete process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY;
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(stageBookingComReservation(rpc, input)).rejects.toThrow("ota_reservation_encryption_unavailable");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects fields outside the normalized allowlist before staging", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const reservationWithCardData = {
      ...reservation,
      paymentCard: { number: "4111111111111111" },
    };
    await expect(stageBookingComReservation(rpc, {
      ...input,
      reservation: reservationWithCardData as BookingComInboundReservation,
    })).rejects.toThrow("invalid_ota_reservation_inbox_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps validated Payments Clarity v2 amounts inside the encrypted inbox", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    let captured: Record<string, unknown> | undefined;
    const reservationWithPriceDetails: BookingComInboundReservation = {
      ...reservation,
      rooms: [{
        ...reservation.rooms[0]!,
        priceDetails: {
          guestView: { totalMinor: 33100, taxes: [{ amountMinor: 550, currency: "USD", type: "exclusive", classification: "unknown", code: "15", description: "City tax" }] },
          hotelView: { totalMinor: 32550, netPriceMinor: 30000, taxes: [{ amountMinor: 250, currency: "USD", type: "exclusive", classification: "tax", code: "18", description: "Withheld lodging tax" }] },
        },
      }],
    };
    await stageBookingComReservation(async (_name, args) => {
      captured = args;
      return { data: { outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001" }, error: null };
    }, { ...input, reservation: reservationWithPriceDetails });
    const clear = decryptBookingComReservation({
      connectionId: input.connectionId, propertyId: input.propertyId,
      reservationIdDigest: String(captured?.p_reservation_id_sha256), payloadDigest: String(captured?.p_payload_sha256),
      ciphertext: String(captured?.p_ciphertext), iv: String(captured?.p_iv), tag: String(captured?.p_tag),
    });
    expect(clear.reservation.rooms[0]?.priceDetails).toEqual(reservationWithPriceDetails.rooms[0]?.priceDetails);

    const badCurrency = structuredClone(reservationWithPriceDetails);
    badCurrency.rooms[0]!.priceDetails!.guestView.taxes[0]!.currency = "EUR";
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(stageBookingComReservation(rpc, { ...input, reservation: badCurrency })).rejects.toThrow("invalid_ota_reservation_inbox_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the provider reservation status to distinguish changes and cancellations", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: { outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001", eventKind: args.p_event_kind }, error: null,
    }));
    await stageBookingComReservation(rpc, { ...input, eventKind: "modified_or_cancelled", reservation: { ...reservation, status: "Modify" } });
    expect(rpc.mock.calls[0]?.[1].p_event_kind).toBe("modified");
    await stageBookingComReservation(rpc, { ...input, eventKind: "modified_or_cancelled", reservation: { ...reservation, status: "Cancel" } });
    expect(rpc.mock.calls[1]?.[1].p_event_kind).toBe("cancelled");
    await expect(stageBookingComReservation(rpc, { ...input, eventKind: "modified_or_cancelled" }))
      .rejects.toThrow("unsupported_ota_reservation_status");
  });

  it("deduplicates a changed message by its reservation ID regardless of response-token order", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    let captured: Record<string, unknown> | undefined;
    await stageBookingComReservation(async (_name, args) => {
      captured = args;
      return { data: { outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001" }, error: null };
    }, {
      ...input,
      eventKind: "modified_or_cancelled",
      reservation: {
        ...reservation,
        status: "Modify",
        reservationIds: [
          { value: "message-token-18", source: "BOOKING.COM", type: "18" },
          { value: "booking-9001", source: "BOOKING.COM", type: "14" },
        ],
      },
    });

    expect(captured?.p_reservation_id_sha256)
      .toBe(createHash("sha256").update("booking_com\u000012345\u0000booking-9001").digest("hex"));
    expect(decryptBookingComReservation({
      connectionId: input.connectionId,
      propertyId: input.propertyId,
      reservationIdDigest: String(captured?.p_reservation_id_sha256),
      payloadDigest: String(captured?.p_payload_sha256),
      ciphertext: String(captured?.p_ciphertext),
      iv: String(captured?.p_iv),
      tag: String(captured?.p_tag),
    })).toMatchObject({ eventKind: "modified", reservation: { reservationIds: [
      { value: "message-token-18", type: "18" }, { value: "booking-9001", type: "14" },
    ] } });
  });

  it("rejects a response token without its base reservation ID before database staging", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(stageBookingComReservation(rpc, {
      ...input,
      eventKind: "modified_or_cancelled",
      reservation: {
        ...reservation,
        status: "Modify",
        reservationIds: [{ value: "message-token-18", source: "BOOKING.COM", type: "18" }],
      },
    })).rejects.toThrow("reservation_id_invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds ciphertext to connection/property identity and surfaces no raw database error", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    const rpc = vi.fn(async () => ({ data: null, error: new Error("SQL leaked guest@example.com") }));
    await expect(stageBookingComReservation(rpc, input)).rejects.toThrow("ota_reservation_staging_failed");
    await expect(stageBookingComReservation(rpc, { ...input, providerPropertyId: "other" }))
      .rejects.toThrow("invalid_ota_reservation_inbox_input");
  });

  it("rejects ciphertext tampering and wrong property AAD", async () => {
    process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY = key;
    let captured: Record<string, unknown> | undefined;
    await stageBookingComReservation(async (_name, args) => {
      captured = args;
      return { data: { outcome: "received", inboxId: "20000000-0000-4000-8000-000000000001" }, error: null };
    }, input);
    const envelope = {
      connectionId: input.connectionId, propertyId: input.propertyId,
      reservationIdDigest: String(captured?.p_reservation_id_sha256), payloadDigest: String(captured?.p_payload_sha256),
      ciphertext: String(captured?.p_ciphertext), iv: String(captured?.p_iv), tag: String(captured?.p_tag),
    };
    expect(() => decryptBookingComReservation({ ...envelope, propertyId: "10000000-0000-4000-8000-000000000002" }))
      .toThrow();
    const tamperedCiphertext = Buffer.from(envelope.ciphertext, "base64");
    tamperedCiphertext[0] ^= 1;
    expect(() => decryptBookingComReservation({ ...envelope, ciphertext: tamperedCiphertext.toString("base64") }))
      .toThrow();
  });
});

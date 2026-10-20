import { describe, expect, it, vi } from "vitest";

const booking = vi.hoisted(() => ({
  decoded: {
    eventKind: "cancelled",
    reservation: {
      reservationIds: [{ value: "booking-123", source: "booking.com" }],
      providerPropertyId: "12345", status: "Cancelled", guest: { name: "Test Guest" },
      rooms: [{ providerRoomIndex: 1, providerRoomTypeId: "room", providerRatePlanId: "bar",
        checkIn: "2026-10-01", checkOut: "2026-10-02", guests: 1, totalMinor: 10000, totalBasis: "after_tax", currency: "USD" }],
    },
  } as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/hotel-channels/booking-com/inbox", () => ({
  decryptBookingComReservation: vi.fn(() => booking.decoded as never),
}));

import { runBookingComReservationImport } from "@/lib/booking-com-reservation-import";

const item = {
  id: "aa208036-fd47-4e29-8a93-6548764bc8a0", connection_id: "booking-connection", property_id: "f7ae8a9b-2e93-47b3-a416-070a09bb931d",
  provider_reservation_id_sha256: "a".repeat(64), payload_sha256: "b".repeat(64), event_kind: "cancelled" as const,
  source_version: 3, pii_ciphertext: "cipher", pii_initialization_vector: "a".repeat(16), pii_authentication_tag: "b".repeat(22) + "==", pii_key_version: 1,
  lease_token: "925c8013-048b-4e94-a528-ad168c7dc6b1",
};
const connection = {
  connectionId: item.connection_id, propertyId: item.property_id, providerPropertyId: "12345", machineAccountId: "f8628002-27dc-4dfc-b747-073e83d9e1fd",
  pmsConnectionId: "iratepilot-test", tenantId: "6ac49661-c958-4d2d-9752-1a794f259ec8", pmsPropertyId: "bf62321d-3393-4ca6-aede-59d21fc33a8d",
  encryptedSecret: { ciphertext: "c", initializationVector: "i", authenticationTag: "t", keyVersion: 1 as const },
};
const config = {
  supabaseUrl: "https://project.supabase.co", serviceRoleKey: "s".repeat(40), credentialEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
  reservationEncryptionKey: Buffer.alloc(32, 2).toString("base64"), destinationUrl: "https://project.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  destinationPublishableKey: `sb_publishable_${"p".repeat(20)}`,
  hotelFeesEnabled: true,
};

function setDecoded(eventKind: "new" | "modified" | "cancelled", rooms = 1, paymentMode = "pay_at_property", classification = "tax", feeMinor = 500) {
  booking.decoded = {
    eventKind,
    reservation: {
      reservationIds: [{ value: "booking-123", source: "booking.com", type: "14" }],
      providerPropertyId: "12345", status: eventKind === "cancelled" ? "Cancelled" : eventKind === "modified" ? "Modify" : "Book",
      paymentMode, guest: { name: "Test Guest" },
      rooms: Array.from({ length: rooms }, (_, index) => ({
        providerRoomIndex: index + 1, providerRoomTypeId: "room", providerRatePlanId: "bar",
        checkIn: "2026-10-01", checkOut: "2026-10-02", guests: 1, totalMinor: 11700, totalBasis: "after_tax", currency: "USD",
        priceDetails: { guestView: { totalMinor: 11700, taxes: [
          { amountMinor: 1200, currency: "USD", type: "inclusive", classification, code: "3" },
          { amountMinor: feeMinor, currency: "USD", type: "inclusive", classification: "fee", code: "12" },
        ] }, hotelView: { totalMinor: 11200, taxes: [] } },
      })),
    },
  };
}

function setup(fetcher: typeof fetch) {
  const finishes: Array<{ outcome: string; code: string }> = [];
  const store = {
    listConnections: async () => [connection], claim: async () => item,
    finish: async (_item: typeof item, outcome: string, code: string) => { finishes.push({ outcome, code }); return true; },
  };
  return { finishes, store, fetcher };
}

describe("Booking.com reservation-to-PMS import", () => {
  it("persists a cancellation and only marks it imported after a valid provider acknowledgement", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 200, body: { eventId: item.id, sourceVersion: item.source_version, outcome: "cancellation-staged" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("<OTA_HotelResModifyNotifRS><Success/></OTA_HotelResModifyNotifRS>", { status: 200 }));
    const deps = setup(fetcher);
    const result = await runBookingComReservationImport(config, {
      ...deps, getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    }, Date.parse("2026-09-25T12:00:00.000Z"));
    expect(result).toMatchObject({ outcome: "imported", eventId: item.id, sourceVersion: 3 });
    expect(deps.finishes).toEqual([{ outcome: "imported", code: "pms_persisted_and_provider_acknowledged" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not acknowledge a PMS cancellation that remains under review", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      status: 200, body: { eventId: item.id, sourceVersion: item.source_version, outcome: "review-required" },
    }), { status: 200 }));
    const deps = setup(fetcher);
    const result = await runBookingComReservationImport(config, {
      ...deps, getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review" });
    expect(deps.finishes).toEqual([{ outcome: "review", code: "pms_review_required" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge a provider error hidden in an HTTP 200 response", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 200, body: { eventId: item.id, sourceVersion: item.source_version, outcome: "cancellation-staged" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("<OTA_HotelResModifyNotifRS><Errors><Error Code=\"1\"/></Errors></OTA_HotelResModifyNotifRS>", { status: 200 }));
    const deps = setup(fetcher);
    const result = await runBookingComReservationImport(config, {
      ...deps, getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review" });
    expect(deps.finishes[0]).toMatchObject({ outcome: "review", code: "provider_ack_rejected" });
  });

  it("imports a mapped USD single-room booking and acknowledges only after the PMS receipt", async () => {
    setDecoded("new");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 200, body: { eventId: item.id, sourceVersion: item.source_version, outcome: "reservation-staged" } }))
      .mockResolvedValueOnce(new Response("<OTA_HotelResNotifRS><Success/></OTA_HotelResNotifRS>", { status: 200 }));
    const deps = setup(fetcher);
    const result = await runBookingComReservationImport(config, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    }, Date.parse("2026-09-25T12:00:00.000Z"));
    expect(result).toMatchObject({ outcome: "imported" });
    const firstCall = fetcher.mock.calls[0]!;
    const sent = JSON.parse(String(firstCall[1]?.body));
    const event = JSON.parse(sent.p_raw_body);
    expect(event.booking).toMatchObject({ subtotal: "100.00", taxes: "12.00", fees: "0.00", hotel_fees: "5.00", total: "117.00" });
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain("OTA_HotelResNotifRS");
    expect(deps.finishes).toEqual([{ outcome: "imported", code: "pms_persisted_and_provider_acknowledged" }]);
  });

  it("uses the atomic PMS group gateway for multiple new room stays", async () => {
    setDecoded("new", 2);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 200, body: { outcome: "reservation-group-staged", roomCount: 2 } }))
      .mockResolvedValueOnce(new Response("<OTA_HotelResNotifRS><Success/></OTA_HotelResNotifRS>", { status: 200 }));
    const deps = setup(fetcher);
    const result = await runBookingComReservationImport(config, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "imported" });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("irp_pms_ota_gateway_group");
    const payload = JSON.parse(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_raw_body);
    expect(payload.rooms).toHaveLength(2);
    expect(payload.rooms[0].booking).toMatchObject({ id: "booking-123_r1", confirmation_code: "booking-123", hotel_fees: "5.00" });
  });

  it("keeps new bookings in review when payment, currency, charge type, or fee migration is unsupported", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const deps = setup(fetcher);
    setDecoded("new", 1, "payments_by_booking");
    let result = await runBookingComReservationImport(config, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review", code: "payment_treatment_required" });
    setDecoded("new", 1, "pay_at_property", "unknown");
    result = await runBookingComReservationImport(config, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review", code: "unknown_charge_type" });
    setDecoded("new", 1);
    const decoded = booking.decoded as { reservation: { rooms: Array<{ priceDetails: { guestView: { taxes: Array<{ type: string }> } } }> } };
    decoded.reservation.rooms[0]!.priceDetails.guestView.taxes[0]!.type = "exclusive";
    result = await runBookingComReservationImport(config, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review", code: "exclusive_charge_requires_review" });
    setDecoded("new");
    result = await runBookingComReservationImport({ ...config, hotelFeesEnabled: false }, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    });
    expect(result).toMatchObject({ outcome: "review", code: "hotel_fee_migration_required" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps zero-fee bookings compatible until the separate hotel-fee migration is enabled", async () => {
    setDecoded("new", 1, "pay_at_property", "tax", 0);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 200, body: { eventId: item.id, sourceVersion: item.source_version, outcome: "reservation-staged" } }))
      .mockResolvedValueOnce(new Response("<OTA_HotelResNotifRS><Success/></OTA_HotelResNotifRS>", { status: 200 }));
    const deps = setup(fetcher);
    await expect(runBookingComReservationImport({ ...config, hotelFeesEnabled: false }, {
      ...deps, store: { ...deps.store, claim: async () => ({ ...item, event_kind: "new" }) },
      getToken: async () => "t".repeat(40), decryptSecret: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: "h".repeat(40) }),
    })).resolves.toMatchObject({ outcome: "imported" });
    const event = JSON.parse(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_raw_body);
    expect(event.booking).not.toHaveProperty("hotel_fees");
    expect(event.booking).toMatchObject({ subtotal: "105.00", taxes: "12.00", fees: "0.00", total: "117.00" });
  });
});

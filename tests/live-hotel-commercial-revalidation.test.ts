import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launchAuthorization = readFileSync(
  new URL("../lib/hotels/marketplace-launch-authorization.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202610050164_revalidate_live_hotel_commerce.sql", import.meta.url),
  "utf8",
);
const paymentCompletionRoute = readFileSync(
  new URL("../app/api/bookings/[id]/complete-payment/route.ts", import.meta.url),
  "utf8",
);
const stripeWebhookRoute = readFileSync(
  new URL("../app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);

describe("live hotel commercial revalidation", () => {
  it("rechecks current commercial hotel inventory during every launch authorization", () => {
    expect(launchAuthorization).toContain('admin.rpc("has_current_commercial_hotel_inventory")');
    expect(launchAuthorization).toContain("hotelCommerceStateAvailable: !commercialHotelInventory.error");
    expect(launchAuthorization).toContain("commercialHotelInventoryReady: commercialHotelInventory.data === true");
  });

  it("requires current verified intake and matching commercial review evidence", () => {
    expect(migration).toContain("create function public.has_current_bookable_hotel_property");
    expect(migration).toContain("partner_application_review_evidence");
    expect(migration).toContain("current_hotel_commercial_agreement_evidence_id");
    expect(migration).toContain("property_commercial_review_evidence");
    expect(migration).toContain("review.commercial_agreement_evidence_id =");
  });

  it("requires current room terms and future priced inventory", () => {
    expect(migration).toContain("create function public.has_current_commercial_hotel_inventory");
    expect(migration).toContain("room.direct_currency_code is distinct from 'USD'");
    expect(migration).toContain("inventory_record.stay_date >= current_date");
    expect(migration).toContain("inventory_record.direct_tax_amount between 0 and 25000");
    expect(migration).toContain("inventory_record.direct_mandatory_fee_amount between 0 and 25000");
  });

  it("rechecks the booked property before finalizing a live payment", () => {
    expect(migration).toContain("p_payment_mode = 'live'");
    expect(migration).toContain("has_current_bookable_hotel_property(v_booking.property_id)");
    expect(migration).toContain("The hotel is no longer commercially authorized for live payment");
    const livePropertyGuard = "if not public.has_current_bookable_hotel_property(v_booking.property_id)";
    expect(migration.indexOf("v_booking.stripe_payment_intent_id is not null"))
      .toBeLessThan(migration.indexOf(livePropertyGuard));
    expect(migration.indexOf(livePropertyGuard))
      .toBeLessThan(migration.indexOf("set stripe_payment_intent_id = p_payment_intent_id"));
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("'hotel-commercial-agreement:' || v_booking.property_id::text");
  });

  it("lets succeeded payments bypass mutable launch gates and reach refund-capable finalization", () => {
    expect(paymentCompletionRoute).not.toContain("isHotelMarketplaceLaunchAuthorized");
    expect(paymentCompletionRoute).not.toContain("isHotelMarketplacePaymentFinalizationAuthorized");
    expect(stripeWebhookRoute).not.toContain("isHotelMarketplaceLaunchAuthorized");
    expect(stripeWebhookRoute).not.toContain("isHotelMarketplacePaymentFinalizationAuthorized");
    expect(paymentCompletionRoute).toContain("completeApprovedBookingPayment(intent)");
    expect(stripeWebhookRoute).toContain("completeApprovedBookingPayment(intent)");
  });

  it("keeps the runtime revalidation functions private to the service role", () => {
    expect(migration).toContain("revoke all on function public.has_current_bookable_hotel_property(uuid)");
    expect(migration).toContain("grant execute on function public.has_current_bookable_hotel_property(uuid)\n  to service_role");
    expect(migration).toContain("revoke all on function public.has_current_commercial_hotel_inventory()");
    expect(migration).toContain("grant execute on function public.has_current_commercial_hotel_inventory()\n  to service_role");
  });
});

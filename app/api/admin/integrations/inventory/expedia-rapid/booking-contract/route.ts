import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import {
  buildExpediaRapidBookingRequest,
  mapExpediaRapidBookingRequirementCoverage,
  sanitizeExpediaRapidBookingEvidence,
} from "@/services/hotel-suppliers/expedia-rapid-booking.server";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  const request = buildExpediaRapidBookingRequest({
    environment: "sandbox",
    bookingLink: "https://test.ean.com/v3/itineraries?token=iratepilot-contract-validation",
    apiKey: "contract-validation-key",
    sharedSecret: "contract-validation-secret",
    timestampSeconds: 1_700_000_000,
    customerIp: "192.0.2.1",
    customerSessionId: "contract-validation-session",
    userAgent: "iRatePilot-contract-validation/1.0",
    internalBookingId: "contract-validation-booking",
    email: "synthetic-traveler@example.com",
    phone: { country_code: "1", area_code: "202", number: "5550100" },
    rooms: [{ given_name: "Synthetic", family_name: "Traveler", smoking: false }],
    payments: [{
      type: "customer_card",
      number: "4111111111111111",
      security_code: "123",
      expiration_month: "08",
      expiration_year: "2030",
      billing_contact: {
        given_name: "Synthetic",
        family_name: "Payor",
        address: {
          line_1: "100 Test Street",
          city: "Test City",
          state_province_code: "OH",
          postal_code: "43215",
          country_code: "US",
        },
      },
    }],
  });
  const evidence = sanitizeExpediaRapidBookingEvidence(request, {
    outcome: "action_required",
    status: null,
    recovery: "do_not_retry",
    transactionIdPresent: false,
  });

  return NextResponse.json({
    softwareContractOnly: true,
    supplierRequestSent: false,
    bookingCreated: false,
    paymentCreated: false,
    requirementCoverage: mapExpediaRapidBookingRequirementCoverage(evidence),
  }, { headers: noStoreHeaders });
}

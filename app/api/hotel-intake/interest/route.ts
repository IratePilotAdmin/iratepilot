import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatHotelManagerInterestMessage,
  HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX,
  hotelManagerInterestSchema,
  matchesHotelManagerInterestMessage,
} from "@/lib/hotels/manager-interest";
import { getPartnerApplicationRequestGateFailure } from "@/lib/http/partner-application-request-gate";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/read-bounded-json";

const MAX_INTEREST_BYTES = 12_000;
const MAX_OPEN_MANAGER_INTERESTS = 100;
const HOTEL_INTEREST_LIKE_PATTERN = `${HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX.replace(/[\\%_]/g, "\\$&")}%`;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  if (process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Hotel manager interest intake is not open yet." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const requestGateFailure = getPartnerApplicationRequestGateFailure(request);
  if (requestGateFailure) {
    return NextResponse.json(
      { error: requestGateFailure.error },
      { status: requestGateFailure.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_INTEREST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "The interest form is too large." },
        { status: 413, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "The interest form must be valid JSON." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = hotelManagerInterestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Complete the required hotel and business-contact fields." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const admin = createAdminClient();
    const { data: openInterestsForEmail, error: existingError } = await admin
      .from("contact_messages")
      .select("id,message")
      .eq("email", parsed.data.businessEmail)
      .like("message", HOTEL_INTEREST_LIKE_PATTERN)
      .in("status", ["new", "in_progress"])
      .limit(MAX_OPEN_MANAGER_INTERESTS);
    if (existingError) throw existingError;
    if (!Array.isArray(openInterestsForEmail) || openInterestsForEmail.some((interest) => (
      !interest || typeof interest !== "object" || Array.isArray(interest)
      || typeof interest.id !== "string" || !interest.id.trim()
      || typeof interest.message !== "string"
    ))) {
      throw new Error("Hotel manager interest duplicate lookup could not be verified.");
    }
    const existingForHotel = openInterestsForEmail.some((interest) => (
      matchesHotelManagerInterestMessage(interest.message, parsed.data)
    ));

    if (!existingForHotel) {
      const { count, error: capacityError } = await admin
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .like("message", HOTEL_INTEREST_LIKE_PATTERN)
        .in("status", ["new", "in_progress"]);
      if (capacityError) throw capacityError;
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("Hotel manager interest capacity could not be determined.");
      }
      if (count >= MAX_OPEN_MANAGER_INTERESTS) {
        return NextResponse.json(
          {
            code: "hotel_interest_capacity_full",
            error: "Hotel manager interest capacity is temporarily full. Please contact the team.",
          },
          { status: 429, headers: NO_STORE_HEADERS },
        );
      }

      const { error } = await admin.from("contact_messages").insert({
        name: parsed.data.contactName,
        email: parsed.data.businessEmail,
        message: formatHotelManagerInterestMessage(parsed.data),
        status: "new",
      });
      if (error) throw error;
    }

    return NextResponse.json(
      {
        status: "received",
        intakeMode: "manager_interest",
        message: "Your private hotel manager interest request was received.",
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: "Hotel manager interest intake is temporarily unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

import { NextResponse } from "next/server";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { fees } from "@/config/fees";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true") return NextResponse.json({ error: "Test checkout is disabled." }, { status: 503 });
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return NextResponse.json({ error: "A Stripe test key is required." }, { status: 503 });
  const parsed = checkoutSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the property, room, dates, and guest count." }, { status: 400 });

  const checkIn = parseISO(parsed.data.checkIn);
  const checkOut = parseISO(parsed.data.checkOut);
  const nights = differenceInCalendarDays(checkOut, checkIn);
  if (nights < 1 || nights > 30 || checkIn < startOfDay(new Date())) {
    return NextResponse.json({ error: "Choose a future stay between 1 and 30 nights." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });

  const { data: room, error: roomError } = await supabase.from("rooms")
    .select("id,name,property_id,max_guests,properties!inner(id,name,slug,active)")
    .eq("id", parsed.data.roomId).eq("active", true)
    .eq("properties.slug", parsed.data.hotelSlug).eq("properties.active", true).single();
  if (roomError || !room) return NextResponse.json({ error: "The selected approved room was not found." }, { status: 404 });
  if (parsed.data.guests > Number(room.max_guests)) return NextResponse.json({ error: "Guest count exceeds this room’s capacity." }, { status: 400 });

  const { data: inventory, error: inventoryError } = await supabase.from("inventory")
    .select("stay_date,available_units,rate").eq("room_id", room.id)
    .gte("stay_date", parsed.data.checkIn).lt("stay_date", parsed.data.checkOut).order("stay_date");
  if (inventoryError) return NextResponse.json({ error: "Inventory could not be verified." }, { status: 503 });
  if ((inventory || []).length !== nights || (inventory || []).some((day) => day.available_units < 1)) {
    return NextResponse.json({ error: "This room is not available for every selected night." }, { status: 409 });
  }

  const { data: profile } = await supabase.from("profiles").select("membership_tier").eq("id", user.id).single();
  const subtotal = (inventory || []).reduce((sum, day) => sum + Number(day.rate), 0);
  const memberFeeExempt = profile?.membership_tier === "basic" || profile?.membership_tier === "business";
  const serviceFee = memberFeeExempt ? 0 : Math.round(subtotal * fees.serviceFeeRate * 100) / 100;
  const total = subtotal + serviceFee;
  const property = room.properties as unknown as { id: string; name: string };
  const confirmationCode = `IRP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const intent = await getStripe().paymentIntents.create({
    amount: Math.round(total * 100),
    currency: "usd",
    payment_method_types: ["card"],
    metadata: {
      mode: "booking_test",
      userId: user.id,
      propertyId: property.id,
      roomId: room.id,
      hotelSlug: parsed.data.hotelSlug,
      roomName: room.name,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      nights: String(nights),
      guests: String(parsed.data.guests),
      confirmationCode
    }
  });
  return NextResponse.json({
    clientSecret: intent.client_secret,
    breakdown: {
      propertyName: property.name,
      roomName: room.name,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      nights,
      guests: parsed.data.guests,
      subtotal,
      serviceFee,
      total
    }
  });
}

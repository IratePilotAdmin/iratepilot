import { NextResponse } from "next/server";
import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { fees } from "@/config/fees";
import { createClient } from "@/lib/supabase/server";
import { bookingSchema } from "@/lib/validation";
import { calculateVerifiedStayPricing } from "@/lib/bookings/stay-pricing";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.from("bookings")
      .select("id,confirmation_code,check_in,check_out,guests,subtotal,fees,total,status,cancellation_reason,created_at,properties(name,city,country),rooms(name),booking_status_history(status,note,created_at),booking_cancellation_requests(id,status,reason,refund_amount,stripe_refund_id)")
      .eq("customer_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Trips are not configured." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (process.env.PILOT_MODE !== "true") return NextResponse.json({ error: "Private booking requests are disabled." }, { status: 503 });
  const parsed = bookingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the property, room, dates, and guest count." }, { status: 400 });

  const checkIn = parseISO(parsed.data.checkIn);
  const checkOut = parseISO(parsed.data.checkOut);
  const nights = differenceInCalendarDays(checkOut, checkIn);
  if (nights < 1 || nights > 30 || checkIn < startOfDay(new Date())) {
    return NextResponse.json({ error: "Choose a future stay between 1 and 30 nights." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const roomResult = await supabase.from("rooms")
      .select("id,name,property_id,max_guests,properties!inner(id,name,slug,active)")
      .eq("id", parsed.data.roomId).eq("active", true).eq("properties.slug", parsed.data.hotelSlug).eq("properties.active", true).single();
    if (roomResult.error || !roomResult.data) return NextResponse.json({ error: "The selected approved room was not found." }, { status: 404 });
    if (parsed.data.guests > Number(roomResult.data.max_guests)) return NextResponse.json({ error: "Guest count exceeds this room’s capacity." }, { status: 400 });

    const findExistingBooking = () => supabase.from("bookings")
      .select("id,confirmation_code,status,subtotal,fees,total")
      .eq("customer_id", user.id)
      .eq("room_id", parsed.data.roomId)
      .eq("check_in", parsed.data.checkIn)
      .eq("check_out", parsed.data.checkOut)
      .in("status", ["pending", "confirmed"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const existingResult = await findExistingBooking();
    if (existingResult.error) throw existingResult.error;
    if (existingResult.data) {
      return NextResponse.json({
        data: existingResult.data,
        duplicate: true,
        mode: "private_request",
        message: "Your existing booking request was returned. No duplicate request was created."
      });
    }

    const inventoryResult = await supabase.from("inventory").select("stay_date,available_units,rate")
      .eq("room_id", parsed.data.roomId).gte("stay_date", parsed.data.checkIn).lt("stay_date", parsed.data.checkOut).order("stay_date");
    if (inventoryResult.error) throw inventoryResult.error;
    const inventory = inventoryResult.data || [];
    const { data: profile } = await supabase.from("profiles").select("membership_tier").eq("id", user.id).single();
    const memberFeeExempt = profile?.membership_tier === "basic" || profile?.membership_tier === "business";
    const pricing = calculateVerifiedStayPricing(inventory, nights, memberFeeExempt ? 0 : fees.serviceFeeRate);
    if (!pricing.ok && pricing.reason === "availability") {
      return NextResponse.json({ error: "This room is not available for every selected night." }, { status: 409 });
    }
    if (!pricing.ok) return NextResponse.json({ error: "Pricing could not be verified for this stay." }, { status: 503 });
    const { subtotal, serviceFee, total } = pricing;
    const property = roomResult.data.properties as unknown as { id: string; name: string };
    const confirmationCode = `IRP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const { data, error } = await supabase.from("bookings").insert({
      confirmation_code: confirmationCode,
      customer_id: user.id,
      property_id: property.id,
      room_id: parsed.data.roomId,
      check_in: parsed.data.checkIn,
      check_out: parsed.data.checkOut,
      guests: parsed.data.guests,
      subtotal,
      taxes: 0,
      fees: serviceFee,
      total,
      status: "pending"
    }).select("id,confirmation_code,status,subtotal,fees,total").single();
    if (error?.code === "23505") {
      const concurrentResult = await findExistingBooking();
      if (concurrentResult.error) throw concurrentResult.error;
      if (concurrentResult.data) {
        return NextResponse.json({
          data: concurrentResult.data,
          duplicate: true,
          mode: "private_request",
          message: "Your existing booking request was returned. No duplicate request was created."
        });
      }
    }
    if (error) throw error;
    return NextResponse.json({
      data,
      mode: "private_request",
      message: "Booking request created for manual partner review. No payment was collected."
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The booking request could not be created." }, { status: 503 });
  }
}

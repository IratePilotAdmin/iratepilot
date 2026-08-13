import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/202608020024_booking_messages.sql", import.meta.url), "utf8");
const threadRoute = readFileSync(new URL("../app/api/bookings/[id]/messages/route.ts", import.meta.url), "utf8");
const customerRoute = readFileSync(new URL("../app/api/bookings/messages/route.ts", import.meta.url), "utf8");
const partnerRoute = readFileSync(new URL("../app/api/partner/messages/route.ts", import.meta.url), "utf8");
const partnerPage = readFileSync(new URL("../app/partner/messages/page.tsx", import.meta.url), "utf8");
const customerPage = readFileSync(new URL("../app/account/support/page.tsx", import.meta.url), "utf8");

describe("booking-scoped customer and partner messages", () => {
  it("protects message reads for customers, approved property partners, and admins", () => {
    expect(migration).toContain('create table if not exists public.booking_messages');
    expect(migration).toContain('create policy "Customers can view own booking messages"');
    expect(migration).toContain('create policy "Approved partners can view own booking messages"');
    expect(migration).toContain("partners.status = 'approved'");
    expect(migration).toContain('create policy "Admins can view booking messages"');
    expect(migration).toContain("revoke insert, update, delete on public.booking_messages from anon, authenticated");
  });

  it("sends validated messages atomically through an authorized function", () => {
    expect(migration).toContain("create or replace function public.send_booking_message");
    expect(migration).toContain("security definer");
    expect(migration).toContain("auth.uid() is distinct from v_booking.customer_id");
    expect(migration).toContain("v_partner_status = 'approved'");
    expect(migration).toContain("insert into public.notifications");
    expect(migration).toContain("grant execute on function public.send_booking_message(uuid, text) to authenticated");
    expect(threadRoute).toContain('bookingMessageSchema.safeParse');
    expect(threadRoute).toContain('.rpc("send_booking_message"');
  });

  it("enforces booking access before thread reads and partner inbox queries", () => {
    expect(threadRoute).toContain('booking.customer_id === auth.user.id');
    expect(threadRoute).toContain('partner?.owner_id === auth.user.id && partner.status === "approved"');
    expect(partnerRoute).toContain('partner.status !== "approved"');
    expect(partnerRoute.indexOf('partner.status !== "approved"')).toBeLessThan(partnerRoute.indexOf('from("bookings")'));
    expect(partnerRoute).toContain("BOOKING_LIMIT");
    expect(partnerRoute).toContain("MESSAGE_LIMIT");
    expect(customerRoute).toContain('requireRole(["customer"])');
    expect(customerRoute).toContain('.eq("customer_id", auth.user.id)');
    expect(customerRoute).toContain("latestMessage");
  });

  it("replaces both placeholders with a shared booking message center", () => {
    expect(partnerPage).toContain('<BookingMessageCenter mode="partner" initialBookingId={booking} />');
    expect(customerPage).toContain('<BookingMessageCenter mode="customer" initialBookingId={booking} />');
    expect(partnerPage).not.toContain("ready for database and supplier integration");
    expect(customerPage).not.toContain("Starter account module");
  });
});

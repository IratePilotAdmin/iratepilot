"use client";

import { CalendarPlus } from "lucide-react";
import { buildBookingCalendarEvent, type BookingCalendarDetails } from "@/lib/bookings/calendar";

export function TripCalendarButton({ details }: { details: BookingCalendarDetails }) {
  function download() {
    const calendar = buildBookingCalendarEvent(details);
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `iratepilot-${details.confirmationCode.toLowerCase()}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <button type="button" onClick={download} className="btn-secondary"><CalendarPlus className="h-4 w-4" /> Add to calendar</button>;
}

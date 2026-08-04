export type BookingCalendarDetails = {
  confirmationCode: string;
  propertyName: string;
  roomName: string;
  city?: string;
  country?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
};

function escapeCalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function calendarDate(value: string) {
  return value.replaceAll("-", "");
}

function calendarTimestamp(value: Date) {
  return value.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

export function buildBookingCalendarEvent(details: BookingCalendarDetails, now = new Date()) {
  const location = [details.propertyName, details.city, details.country].filter(Boolean).join(", ");
  const confirmationUrl = `https://www.iratepilot.com/booking-confirmation?code=${encodeURIComponent(details.confirmationCode)}`;
  const description = [
    `Confirmation: ${details.confirmationCode}`,
    `Room: ${details.roomName}`,
    `Guests: ${details.guests}`,
    `Manage trip: ${confirmationUrl}`,
  ].join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//iRatePilot//Booking Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(details.confirmationCode)}@iratepilot.com`,
    `DTSTAMP:${calendarTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${calendarDate(details.checkIn)}`,
    `DTEND;VALUE=DATE:${calendarDate(details.checkOut)}`,
    `SUMMARY:${escapeCalendarText(`iRatePilot stay at ${details.propertyName}`)}`,
    `LOCATION:${escapeCalendarText(location)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${confirmationUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

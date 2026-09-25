/**
 * Offline Booking.com OTA 2003B payload builder.
 *
 * This module only prepares delta requests. It does not authenticate, send
 * traffic, confirm a provider connection, or receive reservations.
 */
export type BookingComAvailabilityDelta = {
  kind: "availability";
  channelPropertyId: string;
  roomTypeId: string;
  date: string;
  roomsToSell: number;
};

export type BookingComRateDelta = {
  kind: "rate";
  channelPropertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  date: string;
  amountMinor: number;
  currency: string;
  priceBasis: "before_tax" | "after_tax";
};

export type BookingComAriDelta = BookingComAvailabilityDelta | BookingComRateDelta;

export type BookingComAriRequest = {
  channelPropertyId: string;
  month: string;
  kind: BookingComAriDelta["kind"];
  endpoint: string;
  headers: { "Accept-Version": "1.1"; "Content-Type": "application/xml" };
  body: string;
};

const headers = { "Accept-Version": "1.1", "Content-Type": "application/xml" } as const;
const otaNamespace = "http://www.opentravel.org/OTA/2003/05";
const schemaPrefix = "http://www.opentravel.org/OTA/2003/05/";
const endpointByKind = {
  availability: "https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif",
  rate: "https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif",
} as const;

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validMappingId(value: string) {
  return typeof value === "string" && value.length >= 1 && value.length <= 80
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validProviderWindow(date: string, now: Date) {
  // Booking.com documents its OTA date window in CET (fixed UTC+01:00).
  const todayCET = new Date(now.valueOf() + 60 * 60_000).toISOString().slice(0, 10);
  const lower = new Date(`${todayCET}T00:00:00.000Z`);
  lower.setUTCDate(lower.getUTCDate() - 1);
  const upper = new Date(`${todayCET}T00:00:00.000Z`);
  upper.setUTCFullYear(upper.getUTCFullYear() + 5);
  return date >= lower.toISOString().slice(0, 10) && date <= upper.toISOString().slice(0, 10);
}

function currencyPrecision(currency: string) {
  try {
    if (currency === "XXX") throw new Error();
    const precision = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (typeof precision !== "number" || !Number.isInteger(precision) || precision < 0 || precision > 3) throw new Error();
    return precision;
  } catch {
    throw new Error("unsupported_currency");
  }
}

function validate(delta: BookingComAriDelta, now: Date) {
  if (!delta || typeof delta !== "object") throw new Error("invalid_delta");
  if (!validMappingId(delta.channelPropertyId)
    || !validMappingId(delta.roomTypeId)
    || !validDate(delta.date) || !validProviderWindow(delta.date, now)) throw new Error("invalid_mapping_or_date");
  if (delta.kind === "availability") {
    if (!Number.isInteger(delta.roomsToSell) || delta.roomsToSell < 0 || delta.roomsToSell > 254) {
      throw new Error("unsupported_rooms_to_sell");
    }
    return;
  }
  const precision = /^[A-Z]{3}$/.test(delta.currency) ? currencyPrecision(delta.currency) : -1;
  const currencyUnit = 10 ** Math.max(precision, 0);
  if (!validMappingId(delta.ratePlanId)
    || !Number.isSafeInteger(delta.amountMinor) || delta.amountMinor < 1 || delta.amountMinor > 50_000 * currencyUnit
    || precision < 0
    || !["before_tax", "after_tax"].includes(delta.priceBasis)) throw new Error("invalid_rate_delta");
}

function requestBody(kind: BookingComAriDelta["kind"], deltas: BookingComAriDelta[], now: string) {
  const timestamp = xml(now);
  if (kind === "availability") {
    const messages = deltas.map((delta) => {
      if (delta.kind !== "availability") throw new Error("mixed_delta_kind");
      const room = xml(delta.roomTypeId);
      return `<AvailStatusMessage BookingLimit="${delta.roomsToSell}"><StatusApplicationControl Start="${delta.date}" End="${delta.date}" InvTypeCode="${room}"/></AvailStatusMessage>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelAvailNotifRQ xmlns="${otaNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${schemaPrefix}OTA_HotelAvailNotifRQ.xsd" TimeStamp="${timestamp}" Version="3.000"><AvailStatusMessages>${messages}</AvailStatusMessages></OTA_HotelAvailNotifRQ>`;
  }
  const messages = deltas.map((delta) => {
    if (delta.kind !== "rate") throw new Error("mixed_delta_kind");
    const basis = delta.priceBasis === "before_tax" ? "AmountBeforeTax" : "AmountAfterTax";
    const precision = currencyPrecision(delta.currency);
    return `<RateAmountMessage><StatusApplicationControl Start="${delta.date}" End="${delta.date}" RatePlanCode="${xml(delta.ratePlanId)}" InvTypeCode="${xml(delta.roomTypeId)}"/><Rates><Rate><BaseByGuestAmts><BaseByGuestAmt ${basis}="${delta.amountMinor}" DecimalPlaces="${precision}" CurrencyCode="${xml(delta.currency)}"/></BaseByGuestAmts></Rate></Rates></RateAmountMessage>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelRateAmountNotifRQ xmlns="${otaNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${schemaPrefix}OTA_HotelRateAmountNotifRQ.xsd" TimeStamp="${timestamp}" Version="3.000"><RateAmountMessages>${messages}</RateAmountMessages></OTA_HotelRateAmountNotifRQ>`;
}

/** Builds single-property, single-month OTA delta batches; sends no requests. */
export function buildBookingComAriRequests(deltas: readonly BookingComAriDelta[], now = new Date()): BookingComAriRequest[] {
  if (!Array.isArray(deltas) || deltas.length === 0 || deltas.length > 500) throw new Error("invalid_batch_size");
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) throw new Error("invalid_timestamp");
  const seen = new Set<string>();
  const groups = new Map<string, BookingComAriDelta[]>();
  for (const delta of deltas) {
    validate(delta, now);
    const identity = delta.kind === "availability"
      ? `${delta.kind}/${delta.channelPropertyId}/${delta.roomTypeId}/${delta.date}`
      : `${delta.kind}/${delta.channelPropertyId}/${delta.roomTypeId}/${delta.ratePlanId}/${delta.date}`;
    if (seen.has(identity)) throw new Error("duplicate_delta");
    seen.add(identity);
    const month = delta.date.slice(0, 7);
    const key = `${delta.kind}/${delta.channelPropertyId}/${month}`;
    groups.set(key, [...(groups.get(key) ?? []), delta]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, batch]) => {
    const [kind, channelPropertyId, month] = key.split("/") as [BookingComAriDelta["kind"], string, string];
    return {
      channelPropertyId,
      month,
      kind,
      endpoint: endpointByKind[kind],
      headers,
      body: requestBody(kind, batch, now.toISOString()),
    };
  });
}

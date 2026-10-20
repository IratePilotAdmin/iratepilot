type XmlNode = { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string };

export type BookingComInboundReservation = {
  reservationIds: Array<{ value: string; source?: string; type?: string }>;
  providerPropertyId: string;
  status: string;
  guest: { name: string; email?: string; phone?: string };
  paymentMode?: "payments_by_booking" | "pay_at_property" | "unknown";
  rooms: Array<{
    providerRoomIndex: number;
    providerRoomTypeId: string;
    providerRatePlanId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    totalMinor: number;
    totalBasis: "after_tax" | "before_tax";
    currency: string;
    businessModel?: "commission_rate" | "net_rate" | "unknown";
    priceDetails?: {
      guestView: BookingComPriceView;
      hotelView: BookingComPriceView;
    };
  }>;
};

type BookingComPriceView = {
  totalMinor?: number;
  netPriceMinor?: number;
  taxes: Array<{
    amountMinor: number;
    currency: string;
    type: "inclusive" | "exclusive";
    classification: "tax" | "fee" | "unknown";
    code?: string;
    chargeFrequency?: string;
    description?: string;
  }>;
};

// Booking.com returns both tax and fee components under the XML `Tax` element.
// Classify only documented FTT codes; code 41 and future codes stay explicit
// unknowns so the PMS importer cannot silently post them as taxes.
const TAX_FTT_CODES = new Set([
  "3", "13", "17", "18", "19", "35", "46",
  "5000", "5001", "5002", "5003", "5004", "5005", "5006", "5007", "5008",
  "5032", "5039", "5041", "5042", "5043",
]);
const FEE_FTT_CODES = new Set([
  "12", "14", "37", "38", "44", "55", "63", "65",
  "5009", "5010", "5011", "5012", "5013", "5014", "5015", "5016", "5017",
  "5018", "5019", "5020", "5021", "5022", "5023", "5024", "5025", "5026",
  "5028", "5029", "5030", "5031", "5034", "5035", "5036", "5038", "5040",
  "5044", "5045", "5046", "5047", "5048",
]);

function classifyFttCode(code: string | undefined): "tax" | "fee" | "unknown" {
  if (!code || !/^\d{1,4}$/.test(code)) return "unknown";
  if (TAX_FTT_CODES.has(code)) return "tax";
  if (FEE_FTT_CODES.has(code)) return "fee";
  return "unknown";
}

export type BookingComReservationEventKind = "new" | "modified" | "cancelled";

/** A type-18 value is the changed-message response token, not the booking identity. */
export function getBookingComReservationId(ids: BookingComInboundReservation["reservationIds"]) {
  if (ids.some((id) => id.type === "18") && !ids.some((id) => id.type !== "18")) {
    throw new Error("reservation_id_invalid");
  }
  const reservationId = ids.find((id) => id.type !== "18") ?? ids[0];
  if (!reservationId) throw new Error("reservation_id_invalid");
  return reservationId.value;
}

const MAX_XML_BYTES = 1_000_000;
const MAX_XML_NODES = 50_000;
const MAX_DEPTH = 64;
const namePattern = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

function decodeXml(value: string) {
  if (value.includes("<") || /&(?![A-Za-z][A-Za-z0-9]{0,15};|#\d{1,7};|#x[0-9a-fA-F]{1,6};)/.test(value)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("invalid_xml_entity");
  return value.replace(/&([^;]{1,16});/g, (_match, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
    if (entity in named) return named[entity]!;
    const numeric = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16)
      : entity.startsWith("#") ? Number.parseInt(entity.slice(1), 10) : Number.NaN;
    if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 0x10ffff
      || (numeric >= 0xd800 && numeric <= 0xdfff)) throw new Error("unsupported_xml_entity");
    return String.fromCodePoint(numeric);
  });
}

function localName(name: string) { return name.slice(name.lastIndexOf(":") + 1); }

function parseOpening(tag: string): { name: string; attributes: Record<string, string>; selfClosing: boolean } {
  const match = /^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(tag);
  if (!match) throw new Error("invalid_xml_tag");
  const name = match[1]!;
  const selfClosing = /\/\s*>$/.test(tag);
  const end = tag.length - (selfClosing ? 2 : 1);
  let offset = match[0].length;
  const attributes: Record<string, string> = {};
  while (offset < end) {
    while (/\s/.test(tag[offset] ?? "")) offset++;
    if (offset >= end) break;
    const attrMatch = namePattern.exec(tag.slice(offset));
    if (!attrMatch) throw new Error("invalid_xml_attribute");
    const attrName = attrMatch[0];
    if (attrName in attributes) throw new Error("duplicate_xml_attribute");
    offset += attrName.length;
    while (/\s/.test(tag[offset] ?? "")) offset++;
    if (tag[offset] !== "=") throw new Error("invalid_xml_attribute");
    offset++;
    while (/\s/.test(tag[offset] ?? "")) offset++;
    const quote = tag[offset];
    if (quote !== "\"" && quote !== "'") throw new Error("invalid_xml_attribute");
    const valueStart = ++offset;
    while (offset < end && tag[offset] !== quote) offset++;
    if (offset >= end) throw new Error("unterminated_xml_attribute");
    attributes[attrName] = decodeXml(tag.slice(valueStart, offset));
    offset++;
  }
  return { name, attributes, selfClosing };
}

function parseXml(xml: string): XmlNode {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES
    || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("invalid_or_unsafe_xml");
  let root: XmlNode | undefined;
  const stack: XmlNode[] = [];
  let nodes = 0;
  let index = 0;
  while (index < xml.length) {
    if (xml[index] !== "<") {
      const end = xml.indexOf("<", index);
      const next = end < 0 ? xml.length : end;
      if (stack.length) stack[stack.length - 1]!.text += decodeXml(xml.slice(index, next));
      else if (xml.slice(index, next).trim()) throw new Error("xml_text_outside_root");
      index = next;
      continue;
    }
    if (xml.startsWith("<!--", index)) {
      const end = xml.indexOf("-->", index + 4);
      if (end < 0) throw new Error("unterminated_xml_comment");
      index = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", index)) {
      const end = xml.indexOf("]]>", index + 9);
      if (end < 0 || !stack.length) throw new Error("invalid_xml_cdata");
      stack[stack.length - 1]!.text += xml.slice(index + 9, end);
      index = end + 3;
      continue;
    }
    if (xml.startsWith("<?", index)) {
      const end = xml.indexOf("?>", index + 2);
      if (end < 0) throw new Error("unterminated_xml_instruction");
      index = end + 2;
      continue;
    }
    let end = index + 1;
    let quote = "";
    while (end < xml.length) {
      const char = xml[end]!;
      if (quote) { if (char === quote) quote = ""; }
      else if (char === "\"" || char === "'") quote = char;
      else if (char === ">") break;
      end++;
    }
    if (end >= xml.length || quote) throw new Error("unterminated_xml_tag");
    const tag = xml.slice(index, end + 1);
    index = end + 1;
    if (/^<\s*\//.test(tag)) {
      const closing = /^<\s*\/\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>$/.exec(tag);
      const node = stack.pop();
      if (!closing || !node || node.name !== closing[1]) throw new Error("mismatched_xml_tag");
      continue;
    }
    if (/^<!/.test(tag)) throw new Error("unsupported_xml_declaration");
    const parsed = parseOpening(tag);
    const node: XmlNode = { name: parsed.name, attributes: parsed.attributes, children: [], text: "" };
    nodes++;
    if (nodes > MAX_XML_NODES) throw new Error("xml_node_limit_exceeded");
    if (stack.length) stack[stack.length - 1]!.children.push(node);
    else if (root) throw new Error("multiple_xml_roots");
    else root = node;
    if (!parsed.selfClosing) {
      stack.push(node);
      if (stack.length > MAX_DEPTH) throw new Error("xml_depth_limit_exceeded");
    }
  }
  if (!root || stack.length) throw new Error("incomplete_xml_document");
  return root;
}

/** A success acknowledgement is valid only when the expected response root has a direct Success and no Errors. */
export function bookingComAcknowledgementSucceeded(xml: string, kind: "new" | "modified_or_cancelled") {
  const root = parseXml(xml);
  const expectedRoot = kind === "new" ? "OTA_HotelResNotifRS" : "OTA_HotelResModifyNotifRS";
  if (localName(root.name) !== expectedRoot) return false;
  const directSuccesses = root.children.filter((child) => localName(child.name) === "Success");
  const errors = descendants(root, "Error");
  return directSuccesses.length === 1 && errors.length === 0;
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) => [ ...(localName(child.name) === name ? [child] : []), ...descendants(child, name) ]);
}
function first(node: XmlNode, name: string) { return descendants(node, name)[0]; }
function requiredAttr(node: XmlNode, name: string) {
  const value = node.attributes[name];
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("reservation_field_missing_or_invalid");
  return value;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function amountMinor(amount: string, currency: string, decimalPlaces?: string) {
  if (!/^[A-Z]{3}$/.test(currency) || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(amount)) throw new Error("reservation_amount_invalid");
  let digits: number;
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf;
    if (currency === "XXX" || !supportedValuesOf?.("currency").includes(currency)) throw new Error();
    const precision = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (!Number.isInteger(precision) || precision === undefined) throw new Error();
    digits = precision;
  }
  catch { throw new Error("reservation_currency_invalid"); }
  if (decimalPlaces !== undefined && (!/^\d$/.test(decimalPlaces) || Number(decimalPlaces) !== digits)) {
    throw new Error("reservation_amount_precision_mismatch");
  }
  // Booking.com encodes OTA amounts as integer values plus DecimalPlaces;
  // treating the integer as major units would multiply it by currency scale.
  if (decimalPlaces !== undefined) {
    if (!/^\d+$/.test(amount)) throw new Error("reservation_amount_invalid");
    const minor = Number(amount);
    if (!Number.isSafeInteger(minor)) throw new Error("reservation_amount_invalid");
    return minor;
  }
  const scaled = Number(amount) * 10 ** digits;
  if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-6) throw new Error("reservation_amount_invalid");
  return Math.round(scaled);
}

function parsePriceView(view: XmlNode, currencyFallback: string, decimalPlacesFallback: string | undefined): BookingComPriceView {
  const taxesNode = first(view, "Taxes");
  const taxes = taxesNode ? descendants(taxesNode, "Tax").map((tax) => {
    const currency = tax.attributes.CurrencyCode ?? currencyFallback;
    if (currency !== currencyFallback) throw new Error("reservation_price_currency_mismatch");
    const amount = requiredAttr(tax, "Amount");
    const type = requiredAttr(tax, "Type");
    if (type !== "Inclusive" && type !== "Exclusive") throw new Error("reservation_tax_type_invalid");
    const description = first(tax, "TaxDescription");
    const text = description ? first(description, "Text")?.text.trim() : undefined;
    return {
      amountMinor: amountMinor(amount, currency, tax.attributes.DecimalPlaces ?? decimalPlacesFallback),
      currency,
      type: type === "Inclusive" ? "inclusive" as const : "exclusive" as const,
      classification: classifyFttCode(tax.attributes.Code),
      ...(tax.attributes.Code ? { code: requiredAttr(tax, "Code") } : {}),
      ...(tax.attributes.ChargeFrequency ? { chargeFrequency: requiredAttr(tax, "ChargeFrequency") } : {}),
      ...(text ? { description: text.slice(0, 200) } : {}),
    };
  }) : [];
  if (taxes.length > 100) throw new Error("reservation_tax_count_invalid");
  const result: BookingComPriceView = { taxes };
  const total = first(view, "Total");
  const netPrice = first(view, "NetPrice");
  for (const [name, amountNode] of [["totalMinor", total], ["netPriceMinor", netPrice]] as const) {
    if (!amountNode) continue;
    const currency = amountNode.attributes.CurrencyCode ?? currencyFallback;
    if (currency !== currencyFallback) throw new Error("reservation_price_currency_mismatch");
    const amount = amountNode.attributes.Amount;
    if (!amount) throw new Error("reservation_price_amount_missing");
    result[name] = amountMinor(amount, currency, amountNode.attributes.DecimalPlaces ?? decimalPlacesFallback);
  }
  return result;
}

/** Parse only operationally needed fields. Card data and unrelated provider fields are ignored. */
export function parseBookingComReservationBatch(xml: string): BookingComInboundReservation[] {
  const root = parseXml(xml);
  const rootName = localName(root.name);
  if (!["OTA_HotelResNotifRQ", "OTA_HotelResModifyNotifRQ"].includes(rootName)) throw new Error("unexpected_reservation_document");
  const records = rootName === "OTA_HotelResNotifRQ"
    ? descendants(root, "HotelReservation")
    : descendants(root, "HotelResModify");
  if (records.length > 200) throw new Error("reservation_batch_too_large");
  return records.map((record) => {
    const idNodes = descendants(record, "HotelReservationID");
    const reservationIds = idNodes.map((id) => ({
      value: requiredAttr(id, "ResID_Value"),
      ...(id.attributes.ResID_Source ? { source: id.attributes.ResID_Source.slice(0, 40) } : {}),
      ...(id.attributes.ResID_Type ? { type: id.attributes.ResID_Type.slice(0, 16) } : {}),
    }));
    if (!reservationIds.length || new Set(reservationIds.map((id) => id.value)).size !== reservationIds.length) throw new Error("reservation_id_invalid");
    getBookingComReservationId(reservationIds);

    const roomStayNodes = descendants(record, "RoomStay");
    if (!roomStayNodes.length || roomStayNodes.length > 20) throw new Error("reservation_room_count_invalid");
    const rooms = roomStayNodes.map((room) => {
      const roomType = first(room, "RoomType");
      const ratePlan = first(room, "RatePlan");
      const timeSpan = first(room, "TimeSpan");
      const total = first(room, "Total");
      if (!roomType || !ratePlan || !timeSpan || !total) throw new Error("reservation_room_details_missing");
      const checkIn = requiredAttr(timeSpan, "Start");
      const checkOut = requiredAttr(timeSpan, "End");
      if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) throw new Error("reservation_dates_invalid");
      const guestCountNodes = descendants(room, "GuestCount");
      const guests = guestCountNodes.reduce((sum, item) => sum + Number(item.attributes.Count ?? 0), 0);
      if (!Number.isInteger(guests) || guests < 1 || guests > 30) throw new Error("reservation_guest_count_invalid");
      const providerRoomIndex = Number(requiredAttr(room, "IndexNumber"));
      if (!Number.isSafeInteger(providerRoomIndex) || providerRoomIndex < 1 || providerRoomIndex > 1000) throw new Error("reservation_room_index_invalid");
      const businessModels = descendants(room, "PropertyBusinessModel").map((item) => item.attributes.BusinessModel);
      if (businessModels.length > 1) throw new Error("reservation_business_model_ambiguous");
      const businessModel: BookingComInboundReservation["rooms"][number]["businessModel"] = businessModels.length === 0 ? undefined
        : businessModels[0] === "net_rate" || businessModels[0] === "commission_rate" ? businessModels[0]
          : "unknown" as const;
      const currency = requiredAttr(total, "CurrencyCode");
      const rawAmount = total.attributes.AmountAfterTax ?? total.attributes.AmountBeforeTax;
      if (!rawAmount) throw new Error("reservation_total_missing");
      const priceDetails = first(room, "PriceDetails");
      let priceBreakdown: { guestView: BookingComPriceView; hotelView: BookingComPriceView } | undefined;
      if (priceDetails) {
        const guestView = first(priceDetails, "GuestView");
        const hotelView = first(priceDetails, "HotelView");
        if (!guestView || !hotelView) throw new Error("reservation_price_views_missing");
        priceBreakdown = {
          guestView: parsePriceView(guestView, currency, total.attributes.DecimalPlaces),
          hotelView: parsePriceView(hotelView, currency, total.attributes.DecimalPlaces),
        };
      }
      return {
        providerRoomIndex,
        providerRoomTypeId: requiredAttr(roomType, "RoomTypeCode"),
        providerRatePlanId: requiredAttr(ratePlan, "RatePlanCode"),
        checkIn,
        checkOut,
        guests,
        totalMinor: amountMinor(rawAmount, currency, total.attributes.DecimalPlaces),
        totalBasis: total.attributes.AmountAfterTax !== undefined ? "after_tax" as const : "before_tax" as const,
        currency,
        ...(businessModel ? { businessModel } : {}),
        ...(priceBreakdown ? { priceDetails: priceBreakdown } : {}),
      };
    });
    if (new Set(rooms.map((room) => room.providerRoomIndex)).size !== rooms.length) throw new Error("reservation_room_index_invalid");
    const propertyIds = new Set(roomStayNodes.map((room) => {
      const property = first(room, "BasicPropertyInfo");
      if (!property) throw new Error("reservation_property_missing");
      return requiredAttr(property, "HotelCode");
    }));
    if (propertyIds.size !== 1) throw new Error("reservation_property_mismatch");

    const globalInfo = first(record, "ResGlobalInfo");
    const guaranteePayment = globalInfo ? first(globalInfo, "GuaranteePayment") : undefined;
    const guaranteeType = guaranteePayment?.attributes.GuaranteeType;
    const paymentDescription = guaranteePayment ? first(guaranteePayment, "Text")?.text.trim().toLowerCase() : undefined;
    const paymentMode = guaranteeType === "PrePay" ? "payments_by_booking" as const
      : paymentDescription === "guests pay at the property" ? "pay_at_property" as const
        : guaranteePayment ? "unknown" as const : undefined;
    const customer = globalInfo ? first(globalInfo, "Customer") : undefined;
    const personName = customer ? first(customer, "PersonName") : undefined;
    const given = personName ? first(personName, "GivenName")?.text.trim() : "";
    const surname = personName ? first(personName, "Surname")?.text.trim() : "";
    const name = [given, surname].filter(Boolean).join(" ").slice(0, 200);
    if (!name || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("reservation_guest_name_missing");
    const email = customer ? first(customer, "Email")?.text.trim() : undefined;
    const telephone = customer ? first(customer, "Telephone") : undefined;
    const phone = telephone?.attributes.PhoneNumber?.trim();
    if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("reservation_guest_email_invalid");
    if (phone && (phone.length > 40 || /[\u0000-\u001f\u007f]/.test(phone))) throw new Error("reservation_guest_phone_invalid");

    const reservationStatus = record.attributes.ResStatus ?? "new";
    if (reservationStatus.length > 40 || /[\u0000-\u001f\u007f]/.test(reservationStatus)) throw new Error("reservation_status_invalid");
    return {
      reservationIds,
      providerPropertyId: [...propertyIds][0]!,
      status: reservationStatus,
      guest: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
      ...(paymentMode ? { paymentMode } : {}),
      rooms,
    };
  });
}

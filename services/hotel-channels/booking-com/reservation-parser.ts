type XmlNode = { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string };

export type BookingComInboundReservation = {
  reservationIds: Array<{ value: string; source?: string; type?: string }>;
  providerPropertyId: string;
  status: string;
  guest: { name: string; email?: string; phone?: string };
  rooms: Array<{
    providerRoomTypeId: string;
    providerRatePlanId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    totalMinor: number;
    currency: string;
  }>;
};

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
  if (!/^[A-Z]{3}$/.test(currency) || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(amount)) throw new Error("reservation_amount_invalid");
  let digits: number;
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: "currency") => string[] }).supportedValuesOf;
    if (currency === "XXX" || !supportedValuesOf?.("currency").includes(currency)) throw new Error();
    const precision = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (!Number.isInteger(precision) || precision === undefined) throw new Error();
    digits = precision;
  }
  catch { throw new Error("reservation_currency_invalid"); }
  if (decimalPlaces !== undefined && Number(decimalPlaces) !== digits) throw new Error("reservation_amount_precision_mismatch");
  const scaled = Number(amount) * 10 ** digits;
  if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-6) throw new Error("reservation_amount_invalid");
  return Math.round(scaled);
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
      const currency = requiredAttr(total, "CurrencyCode");
      const rawAmount = total.attributes.AmountAfterTax ?? total.attributes.AmountBeforeTax;
      if (!rawAmount) throw new Error("reservation_total_missing");
      return {
        providerRoomTypeId: requiredAttr(roomType, "RoomTypeCode"),
        providerRatePlanId: requiredAttr(ratePlan, "RatePlanCode"),
        checkIn,
        checkOut,
        guests,
        totalMinor: amountMinor(rawAmount, currency, total.attributes.DecimalPlaces),
        currency,
      };
    });
    const propertyIds = new Set(roomStayNodes.map((room) => {
      const property = first(room, "BasicPropertyInfo");
      if (!property) throw new Error("reservation_property_missing");
      return requiredAttr(property, "HotelCode");
    }));
    if (propertyIds.size !== 1) throw new Error("reservation_property_mismatch");

    const globalInfo = first(record, "ResGlobalInfo");
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
      rooms,
    };
  });
}

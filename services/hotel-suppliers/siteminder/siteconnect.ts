import { timingSafeEqual } from "node:crypto";

const SOAP_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
const OTA_NAMESPACE = "http://www.opentravel.org/OTA/2003/05";
const MAX_XML_BYTES = 1_000_000;
const MAX_CREDENTIAL_BYTES = 120;

export type SiteMinderRoomsAndRatesRequest = {
  operation: "rooms_and_rates";
  echoToken: string;
  hotelCode: string;
  username: string;
  password: string;
};

export type SiteMinderRoomMapping = {
  code: string;
  name: string;
  description: string;
  maxOccupancy: number;
};

export type SiteMinderRatePlanMapping = {
  code: string;
  name: string;
  description: string;
};

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function element(source: string, localName: string) {
  const match = source.match(new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,
    "i",
  ));
  return match ? decodeXml(match[1].trim()) : undefined;
}

function attribute(source: string, elementName: string, attributeName: string) {
  const tag = source.match(new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${elementName}\\b[^>]*>`,
    "i",
  ))?.[0];
  if (!tag) return undefined;
  const match = tag.match(new RegExp(`\\b${attributeName}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeXml(match[2].trim()) : undefined;
}

export function parseSiteMinderRequest(source: string): SiteMinderRoomsAndRatesRequest {
  if (Buffer.byteLength(source, "utf8") > MAX_XML_BYTES) {
    throw new Error("SiteMinder request exceeds the maximum supported size");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("SiteMinder request contains a prohibited XML declaration");
  }
  if (!/<(?:[A-Za-z_][\w.-]*:)?Envelope\b/i.test(source)) {
    throw new Error("SiteMinder request is not a SOAP envelope");
  }
  const operation = source.match(/<(?:[A-Za-z_][\w.-]*:)?(OTA_HotelAvailRQ|OTA_HotelAvailNotifRQ|OTA_HotelRateAmountNotifRQ)\b/i)?.[1];
  if (operation !== "OTA_HotelAvailRQ") {
    throw new Error("SiteMinder operation is not enabled");
  }
  const username = element(source, "Username");
  const password = element(source, "Password");
  const hotelCode = attribute(source, "HotelRef", "HotelCode");
  const echoToken = attribute(source, "OTA_HotelAvailRQ", "EchoToken");
  if (!username || !password || username.length > MAX_CREDENTIAL_BYTES || password.length > 50) {
    throw new Error("SiteMinder WS-Security credentials are required");
  }
  if (!hotelCode || !/^[A-Za-z0-9._-]{1,120}$/.test(hotelCode)) {
    throw new Error("SiteMinder HotelCode is required");
  }
  if (!echoToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(echoToken)) {
    throw new Error("SiteMinder EchoToken must be a UUID");
  }
  if (attribute(source, "AvailRequestSegment", "AvailReqType") !== "Room") {
    throw new Error("SiteMinder request is not a rooms and rates request");
  }
  return { operation: "rooms_and_rates", echoToken, hotelCode, username, password };
}

export function siteMinderCredentialsMatch(
  provided: { username: string; password: string },
  expected: { username?: string; password?: string },
) {
  const compare = (left: string, right: string) => {
    const leftSource = Buffer.from(left, "utf8");
    const rightSource = Buffer.from(right, "utf8");
    const leftPadded = Buffer.alloc(MAX_CREDENTIAL_BYTES);
    const rightPadded = Buffer.alloc(MAX_CREDENTIAL_BYTES);
    leftSource.copy(leftPadded, 0, 0, MAX_CREDENTIAL_BYTES);
    rightSource.copy(rightPadded, 0, 0, MAX_CREDENTIAL_BYTES);
    return leftSource.length === rightSource.length && timingSafeEqual(leftPadded, rightPadded);
  };
  const expectedUsername = expected.username ?? "";
  const expectedPassword = expected.password ?? "";
  const usernameMatches = compare(expectedUsername, provided.username);
  const passwordMatches = compare(expectedPassword, provided.password);
  return expectedUsername.length > 0 && expectedPassword.length > 0
    && usernameMatches && passwordMatches;
}

function mappingLines(value: string | null | undefined, kind: "room" | "rate") {
  const rows = (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return rows.map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Each SiteMinder ${kind} mapping must use Name = CODE`);
    const name = line.slice(0, separator).trim();
    const right = line.slice(separator + 1).trim();
    const code = right.split(/\s+/).at(-1) ?? "";
    if (!name || !/^[A-Za-z0-9._-]{1,80}$/.test(code)) {
      throw new Error(`SiteMinder ${kind} mapping contains an invalid name or code`);
    }
    return { name, code, description: name };
  });
}

export function parseSiteMinderMappings(input: {
  roomTypeMapping?: string | null;
  ratePlanMapping?: string | null;
}) {
  const rooms: SiteMinderRoomMapping[] = mappingLines(input.roomTypeMapping, "room")
    .map((item) => ({ ...item, maxOccupancy: 2 }));
  const rates: SiteMinderRatePlanMapping[] = mappingLines(input.ratePlanMapping, "rate");
  if (rooms.length < 2 || rates.length < 2) {
    throw new Error("SiteMinder certification requires at least two room types and two rate plans");
  }
  if (new Set(rooms.map((item) => item.code)).size !== rooms.length
    || new Set(rates.map((item) => item.code)).size !== rates.length) {
    throw new Error("SiteMinder room and rate codes must be unique");
  }
  return { rooms, rates };
}

function envelope(body: string) {
  return `<SOAP-ENV:Envelope xmlns:SOAP-ENV="${SOAP_NAMESPACE}"><SOAP-ENV:Header/><SOAP-ENV:Body>${body}</SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}

export function buildSiteMinderErrorResponse(input: {
  echoToken: string;
  type: 4 | 6;
  code: 392 | 448;
  message: string;
}) {
  return envelope(`<OTA_HotelAvailRS xmlns="${OTA_NAMESPACE}" EchoToken="${xml(input.echoToken)}" TimeStamp="${new Date().toISOString()}" Version="1.0"><Errors><Error Type="${input.type}" Code="${input.code}">${xml(input.message)}</Error></Errors></OTA_HotelAvailRS>`);
}

export function buildSiteMinderRoomsAndRatesResponse(input: {
  echoToken: string;
  rooms: SiteMinderRoomMapping[];
  rates: SiteMinderRatePlanMapping[];
}) {
  const roomStays = input.rooms.flatMap((room) => input.rates.map((rate) =>
    `<RoomStay><RoomTypes><RoomType RoomTypeCode="${xml(room.code)}"><RoomDescription Name="${xml(room.name)}"><Text>${xml(room.description)}</Text></RoomDescription><Occupancy AgeQualifyingCode="10" MaxOccupancy="${room.maxOccupancy}"/></RoomType></RoomTypes><RatePlans><RatePlan RatePlanCode="${xml(rate.code)}"><RatePlanDescription Name="${xml(rate.name)}"><Text>${xml(rate.description)}</Text></RatePlanDescription></RatePlan></RatePlans></RoomStay>`,
  )).join("");
  return envelope(`<OTA_HotelAvailRS xmlns="${OTA_NAMESPACE}" EchoToken="${xml(input.echoToken)}" TimeStamp="${new Date().toISOString()}" Version="1.0"><Success/><RoomStays>${roomStays}</RoomStays></OTA_HotelAvailRS>`);
}

export const SITE_MINDER_MAX_XML_BYTES = MAX_XML_BYTES;

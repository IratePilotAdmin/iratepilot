import { describe, expect, it } from "vitest";
import {
  buildSiteMinderErrorResponse,
  buildSiteMinderRoomsAndRatesResponse,
  parseSiteMinderMappings,
  parseSiteMinderRequest,
  siteMinderCredentialsMatch,
} from "../services/hotel-suppliers/siteminder";

const request = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>iratepilot-channel</wsse:Username><wsse:Password>secure-password-value</wsse:Password></wsse:UsernameToken></wsse:Security></SOAP-ENV:Header><SOAP-ENV:Body><OTA_HotelAvailRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="ed8835ff-6198-4f38-b589-3058397f677c" TimeStamp="2026-10-14T12:00:00Z" Version="1.0" AvailRatesOnly="true"><AvailRequestSegments><AvailRequestSegment AvailReqType="Room"><HotelSearchCriteria><Criterion><HotelRef HotelCode="HOTEL-101"/></Criterion></HotelSearchCriteria></AvailRequestSegment></AvailRequestSegments></OTA_HotelAvailRQ></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

describe("SiteMinder SiteConnect foundation", () => {
  it("parses the documented SOAP 1.1 rooms-and-rates request", () => {
    expect(parseSiteMinderRequest(request)).toEqual({
      operation: "rooms_and_rates",
      echoToken: "ed8835ff-6198-4f38-b589-3058397f677c",
      hotelCode: "HOTEL-101",
      username: "iratepilot-channel",
      password: "secure-password-value",
    });
  });

  it("rejects unsupported operations and XML entity declarations", () => {
    expect(() => parseSiteMinderRequest(request.replace("OTA_HotelAvailRQ", "OTA_HotelRateAmountNotifRQ")))
      .toThrow("operation is not enabled");
    expect(() => parseSiteMinderRequest(`<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${request}`))
      .toThrow("prohibited XML declaration");
    expect(() => parseSiteMinderRequest(request.replace(
      "ed8835ff-6198-4f38-b589-3058397f677c",
      "<script>alert(1)</script>",
    ))).toThrow("EchoToken must be a UUID");
  });

  it("compares channel credentials without accepting partial values", () => {
    expect(siteMinderCredentialsMatch(
      { username: "channel-user", password: "channel-password" },
      { username: "channel-user", password: "channel-password" },
    )).toBe(true);
    expect(siteMinderCredentialsMatch(
      { username: "channel-user", password: "wrong" },
      { username: "channel-user", password: "channel-password" },
    )).toBe(false);
  });

  it("builds a minified certification-ready rooms and rates response", () => {
    const mapping = parseSiteMinderMappings({
      roomTypeMapping: "Deluxe King = DLXK\nDouble Queen = DBLQ",
      ratePlanMapping: "DLXK: Best Available Rate = BAR\nDLXK: Flexible Rate = FLEX\nDBLQ: Best Available Rate = BAR\nDBLQ: Flexible Rate = FLEX",
      roomOccupancyByName: { "Deluxe King": 3, "Double Queen": 4 },
    });
    const response = buildSiteMinderRoomsAndRatesResponse({ echoToken: "echo-1", ...mapping });
    expect(response).toContain("<Success/>");
    expect(response.match(/<RoomStay>/g)).toHaveLength(4);
    expect(response).toContain('RoomTypeCode="DLXK"');
    expect(response).toContain('RatePlanCode="FLEX"');
    expect(response).toContain('MaxOccupancy="3"');
    expect(response).toContain('MaxOccupancy="4"');
    expect(response).not.toContain("\n");
  });

  it("fails closed when certification mappings are incomplete", () => {
    expect(() => parseSiteMinderMappings({
      roomTypeMapping: "Deluxe King = DLXK",
      ratePlanMapping: "DLXK: Best Available Rate = BAR",
      roomOccupancyByName: { "Deluxe King": 2 },
    })).toThrow("at least two room types");
  });

  it("escapes reflected SOAP error fields", () => {
    const response = buildSiteMinderErrorResponse({
      echoToken: 'echo-<bad>"', type: 6, code: 392, message: "Hotel <missing>",
    });
    expect(response).toContain('EchoToken="echo-&lt;bad&gt;&quot;"');
    expect(response).toContain("Hotel &lt;missing&gt;");
  });
});

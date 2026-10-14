import { NextResponse } from "next/server";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildSiteMinderErrorResponse,
  buildSiteMinderRoomsAndRatesResponse,
  parseSiteMinderMappings,
  parseSiteMinderRequest,
  siteMinderCredentialsMatch,
  SITE_MINDER_MAX_XML_BYTES,
} from "@/services/hotel-suppliers/siteminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function xmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

class RequestTooLargeError extends Error {}

async function readLimitedXml(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SITE_MINDER_MAX_XML_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/xml")) {
    return xmlResponse("Unsupported Media Type", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > SITE_MINDER_MAX_XML_BYTES) return xmlResponse("Request Too Large", 413);

  let parsed;
  try {
    parsed = parseSiteMinderRequest(await readLimitedXml(request));
  } catch (error) {
    if (error instanceof RequestTooLargeError) return xmlResponse("Request Too Large", 413);
    return xmlResponse("Malformed SOAP Request", 400);
  }

  try {
    const admin = createAdminClient();
    const connection = await admin.from("property_pms_connections")
      .select("id,property_id,room_type_mapping,rate_plan_mapping,connection_status")
      .eq("provider_id", "siteminder")
      .eq("external_property_code", parsed.hotelCode)
      .neq("connection_status", "disabled")
      .maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data) {
      return xmlResponse(buildSiteMinderErrorResponse({
        echoToken: parsed.echoToken,
        type: 6,
        code: 392,
        message: "Hotel not found for the supplied HotelCode",
      }));
    }

    const stored = await admin.from("property_pms_credentials")
      .select("ciphertext,initialization_vector,authentication_tag,key_version")
      .eq("connection_id", connection.data.id)
      .maybeSingle();
    if (stored.error) throw stored.error;
    if (!stored.data) {
      return xmlResponse(buildSiteMinderErrorResponse({
        echoToken: parsed.echoToken, type: 4, code: 448,
        message: "Invalid Username and/or Password",
      }));
    }
    const credentials = decryptPmsCredentials({
      ciphertext: stored.data.ciphertext,
      initializationVector: stored.data.initialization_vector,
      authenticationTag: stored.data.authentication_tag,
      keyVersion: stored.data.key_version,
    });
    if (!siteMinderCredentialsMatch(parsed, {
      username: credentials.PMS_SITEMINDER_USERNAME,
      password: credentials.PMS_SITEMINDER_PASSWORD,
    })) {
      return xmlResponse(buildSiteMinderErrorResponse({
        echoToken: parsed.echoToken, type: 4, code: 448,
        message: "Invalid Username and/or Password",
      }));
    }

    try {
      const rooms = await admin.from("rooms")
        .select("name,max_guests")
        .eq("property_id", connection.data.property_id)
        .eq("active", true);
      if (rooms.error) throw rooms.error;
      const mapping = parseSiteMinderMappings({
        roomTypeMapping: connection.data.room_type_mapping,
        ratePlanMapping: connection.data.rate_plan_mapping,
        roomOccupancyByName: Object.fromEntries(
          (rooms.data ?? []).map((room) => [room.name, room.max_guests]),
        ),
      });
      return xmlResponse(buildSiteMinderRoomsAndRatesResponse({
        echoToken: parsed.echoToken,
        ...mapping,
      }));
    } catch {
      return xmlResponse(buildSiteMinderErrorResponse({
        echoToken: parsed.echoToken, type: 6, code: 392,
        message: "Hotel room and rate mapping is incomplete",
      }));
    }
  } catch (error) {
    console.error("SiteMinder SiteConnect request failed", error);
    return xmlResponse("Service Unavailable", 503);
  }
}

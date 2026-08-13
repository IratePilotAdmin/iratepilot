import { NextResponse } from "next/server";

import { getMarketplaceHotel } from "@/lib/data/marketplace";
import { parseHotelStay } from "@/lib/marketplace-search";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const stay = parseHotelStay(query);

  if (stay.error) {
    return NextResponse.json({ error: stay.error }, { status: 400 });
  }

  const result = await getMarketplaceHotel(slug, stay.criteria);
  if (!result.hotel) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  return NextResponse.json({
    data: result.hotel,
    rooms: result.rooms,
    source: result.source,
    availabilityVerified: Boolean(stay.criteria),
  });
}

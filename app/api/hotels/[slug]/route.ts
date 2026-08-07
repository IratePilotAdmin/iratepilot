import { NextResponse } from "next/server";

import { getMarketplaceHotel } from "@/lib/data/marketplace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await getMarketplaceHotel(slug);

  if (!result.hotel) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  return NextResponse.json({
    data: result.hotel,
    rooms: result.rooms,
    source: result.source,
  });
}

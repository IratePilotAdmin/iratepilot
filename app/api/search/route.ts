import { type NextRequest, NextResponse } from "next/server";

import { getMarketplaceHotels } from "@/lib/data/marketplace";
import { parseMarketplaceSearch } from "@/lib/marketplace-search";

export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const search = parseMarketplaceSearch(query);

  if (search.error) {
    return NextResponse.json({ error: search.error }, { status: 400 });
  }

  const result = await getMarketplaceHotels(search.criteria);
  return NextResponse.json({
    data: result.hotels,
    source: result.source,
    availabilityVerified: Boolean(search.criteria && "checkIn" in search.criteria),
  });
}

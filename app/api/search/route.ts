import { NextResponse } from "next/server";
import { getMarketplaceHotels } from "@/lib/data/marketplace";
export async function GET(){const result=await getMarketplaceHotels();return NextResponse.json({data:result.hotels,source:result.source});}

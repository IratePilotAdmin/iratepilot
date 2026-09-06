import { NextResponse } from "next/server";

// Full applications require a separate integration; legacy flags cannot reopen this endpoint.
export async function POST() {
  return NextResponse.json(
    { error: "Full hotel manager applications are not available yet." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

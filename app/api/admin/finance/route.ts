import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("booking_financials")
      .select(
        "id,gross_room_revenue,partner_commission,partner_net,status,created_at,stripe_transfer_id,stripe_transfer_status,stripe_transfer_error,stripe_transferred_at,stripe_reversed_at,partners(business_name),bookings(confirmation_code,status)"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    const summary = rows.reduce(
      (total, row) => ({
        gross: total.gross + Number(row.gross_room_revenue),
        commission:
          total.commission + Number(row.partner_commission),
        partnerNet: total.partnerNet + Number(row.partner_net),
        paidTransfers:
          total.paidTransfers +
          (row.stripe_transfer_status === "paid" ? 1 : 0),
        reversedTransfers:
          total.reversedTransfers +
          (row.stripe_transfer_status === "reversed" ? 1 : 0),
        failedTransfers:
          total.failedTransfers +
          (row.stripe_transfer_status === "failed" ? 1 : 0),
      }),
      {
        gross: 0,
        commission: 0,
        partnerNet: 0,
        paidTransfers: 0,
        reversedTransfers: 0,
        failedTransfers: 0,
      }
    );

    return NextResponse.json({ data: rows, summary });
  } catch (error) {
    console.error("Admin finance report failed", error);
    return NextResponse.json(
      { error: "Admin finance reporting could not be loaded." },
      { status: 503 }
    );
  }
}


import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const draft = {
  name: "Red Roof Inn Ridgeland",
  slug: "red-roof-inn-ridgeland-pms",
  type: "hotel",
  city: "Ridgeland",
  region: "MS",
  country: "United States",
} as const;

export async function POST() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const owner = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
    if (owner.error) throw owner.error;
    const partnerId = owner.data?.id ?? null;
    if (!partnerId) return NextResponse.json({ error: "Create your hotel organization first." }, { status: 409 });

    const admin = createAdminClient();
    const existing = await admin.from("properties").select("id,name,partner_id,pms_only,active")
      .eq("slug", draft.slug).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (existing.data.partner_id !== partnerId || !existing.data.pms_only || existing.data.active) {
        return NextResponse.json({ error: "This property identifier is already used by another listing." }, { status: 409 });
      }
      return NextResponse.json({ data: { id: existing.data.id, name: existing.data.name, pmsOnly: true, active: false }, message: "PMS-only draft already exists." });
    }

    const duplicate = await admin.from("properties").select("id").eq("partner_id", partnerId).ilike("name", draft.name).limit(1);
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.length) return NextResponse.json({ error: "A property with this name already exists. Review it before creating another." }, { status: 409 });

    const created = await admin.from("properties").insert({
      ...draft, partner_id: partnerId, star_rating: null, active: false, pms_only: true,
    }).select("id,name,pms_only,active").single();
    if (created.error?.code === "23505") return NextResponse.json({ error: "This property identifier is already in use." }, { status: 409 });
    if (created.error) throw created.error;
    return NextResponse.json({ data: { id: created.data.id, name: created.data.name, pmsOnly: true, active: false }, message: "Inactive PMS-only draft created. Add room types only after verifying property access." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "PMS draft could not be created. Apply the PMS-only property migration and verify hotel access." }, { status: 503 });
  }
}

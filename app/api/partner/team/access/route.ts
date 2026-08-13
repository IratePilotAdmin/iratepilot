import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { partnerTeamAccessActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

async function ownedApprovedPartner(auth: Awaited<ReturnType<typeof requireRole>>) {
  if ("error" in auth) return null;
  const result = await auth.supabase.from("partners")
    .select("id,status")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.status === "approved" ? result.data : null;
}

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
    const partner = await ownedApprovedPartner(auth);
    if (!partner) return NextResponse.json({ owner: false, members: [] }, { headers });

    const result = await auth.supabase.rpc("list_own_partner_team_members");
    if (result.error?.code === "42883") return NextResponse.json(
      { error: "Apply SynXis migrations through 048 before managing team access." },
      { status: 503, headers },
    );
    if (result.error) throw result.error;

    return NextResponse.json({ owner: true, members: result.data ?? [] }, { headers });
  } catch (error) {
    console.error("Partner team access could not be loaded", error);
    return NextResponse.json(
      { error: "Partner team access could not be loaded." },
      { status: 503, headers },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
    const partner = await ownedApprovedPartner(auth);
    if (!partner) return NextResponse.json(
      { error: "Only the approved partner owner can revoke team access." },
      { status: 403, headers },
    );
    const parsed = partnerTeamAccessActionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: "Choose a valid team access action." },
      { status: 400, headers },
    );

    const functionName = parsed.data.action === "revoke_invitation"
      ? "revoke_own_partner_team_invitation"
      : "disable_own_partner_team_member";
    const parameters = parsed.data.action === "revoke_invitation"
      ? { p_invitation_id: parsed.data.invitationId }
      : { p_member_id: parsed.data.memberId };
    const result = await auth.supabase.rpc(functionName, parameters);
    if (result.error?.code === "42883") return NextResponse.json(
      { error: "Apply SynXis migrations through 048 before managing team access." },
      { status: 503, headers },
    );
    if (result.error) throw result.error;
    if (result.data !== true) return NextResponse.json(
      { error: "The access record was not found or is no longer active." },
      { status: 409, headers },
    );

    return NextResponse.json({
      updated: true,
      message: parsed.data.action === "revoke_invitation"
        ? "The pending invitation was revoked."
        : "The manager's integration access was disabled.",
    }, { headers });
  } catch (error) {
    console.error("Partner team access could not be changed", error);
    return NextResponse.json(
      { error: "Partner team access could not be changed." },
      { status: 503, headers },
    );
  }
}

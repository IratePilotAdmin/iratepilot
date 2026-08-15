import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { partnerTeamInvitationAcceptanceSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

async function invitationForScope(invitationId: string) {
  return createAdminClient()
    .from("partner_team_invitations")
    .select("id,email,status,expires_at,can_manage_hotels")
    .eq("id", invitationId)
    .maybeSingle();
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json(
      { error: "Sign in with the invited email to review this invitation." },
      { status: 401, headers },
    );

    const invitationId = new URL(request.url).searchParams.get("invitationId");
    const parsed = partnerTeamInvitationAcceptanceSchema.safeParse({ invitationId });
    if (!parsed.success) return NextResponse.json(
      { error: "A valid invitation ID is required." },
      { status: 400, headers },
    );

    const invitation = await invitationForScope(parsed.data.invitationId);
    if (invitation.error) throw invitation.error;
    if (!invitation.data) return NextResponse.json(
      { error: "Invitation not found." },
      { status: 404, headers },
    );
    if (!user.email || invitation.data.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation does not match your signed-in account." },
        { status: 403, headers },
      );
    }

    return NextResponse.json({
      canManageHotels: invitation.data.can_manage_hotels,
      status: invitation.data.status,
      expired: new Date(invitation.data.expires_at).getTime() <= Date.now(),
    }, { headers });
  } catch (error) {
    console.error("Partner team invitation scope could not be loaded", error);
    return NextResponse.json(
      { error: "The invitation scope could not be loaded." },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json(
      { error: "Sign in with the invited email before accepting." },
      { status: 401, headers },
    );

    const parsed = partnerTeamInvitationAcceptanceSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: "A valid invitation ID is required." },
      { status: 400, headers },
    );

    const invitation = await invitationForScope(parsed.data.invitationId);
    if (invitation.error) throw invitation.error;
    if (!invitation.data) return NextResponse.json(
      { error: "Invitation not found." },
      { status: 404, headers },
    );

    const result = await supabase.rpc("accept_partner_team_invitation", {
      p_invitation_id: parsed.data.invitationId,
    }).maybeSingle();
    if (result.error?.code === "42883") return NextResponse.json(
      { error: "Apply SynXis migrations through 047 before accepting invitations." },
      { status: 503, headers },
    );
    if (result.error?.code === "P0002") return NextResponse.json(
      { error: "Invitation not found." },
      { status: 404, headers },
    );
    if (result.error?.code === "42501") return NextResponse.json(
      { error: "This invitation does not match your signed-in account." },
      { status: 403, headers },
    );
    if (result.error?.code === "22023") return NextResponse.json(
      { error: result.error.message },
      { status: 409, headers },
    );
    if (result.error) throw result.error;

    return NextResponse.json({
      accepted: true,
      access: result.data,
      canManageHotels: invitation.data.can_manage_hotels,
      message: "Your hotel team invitation was accepted.",
    }, { headers });
  } catch (error) {
    console.error("Partner team invitation could not be accepted", error);
    return NextResponse.json(
      { error: "The invitation could not be accepted." },
      { status: 503, headers },
    );
  }
}

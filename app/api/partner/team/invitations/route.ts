import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { queuePartnerTeamInvitation } from "@/lib/email/partner-team-invitation";
import { partnerTeamInvitationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

async function ownedApprovedPartner(auth: Awaited<ReturnType<typeof requireRole>>) {
  if ("error" in auth) return null;
  const result = await auth.supabase.from("partners")
    .select("id,business_name,status")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.status === "approved" ? result.data : null;
}

async function expireInvitations(auth: Awaited<ReturnType<typeof requireRole>>) {
  if ("error" in auth) return false;
  const result = await auth.supabase.rpc("expire_own_partner_team_invitations");
  if (result.error?.code === "42883") return false;
  if (result.error) throw result.error;
  return true;
}

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
    const partner = await ownedApprovedPartner(auth);
    if (!partner) return NextResponse.json({ owner: false, invitations: [] }, { headers });
    if (!await expireInvitations(auth)) return NextResponse.json(
      { error: "Apply SynXis migrations through 047 before inviting managers." },
      { status: 503, headers },
    );

    const result = await auth.supabase.from("partner_team_invitations")
      .select("id,email,member_role,status,expires_at,accepted_at,created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(25);
    if (result.error?.code === "42P01") return NextResponse.json(
      { error: "Apply SynXis migrations through 047 before inviting managers." },
      { status: 503, headers },
    );
    if (result.error) throw result.error;

    return NextResponse.json({
      owner: true,
      partnerName: partner.business_name,
      invitations: result.data ?? [],
    }, { headers });
  } catch (error) {
    console.error("Partner team invitations could not be loaded", error);
    return NextResponse.json(
      { error: "Partner team invitations could not be loaded." },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
    const partner = await ownedApprovedPartner(auth);
    if (!partner) return NextResponse.json(
      { error: "Only the approved partner owner can invite hotel team members." },
      { status: 403, headers },
    );
    if (!await expireInvitations(auth)) return NextResponse.json(
      { error: "Apply SynXis migrations through 047 before inviting managers." },
      { status: 503, headers },
    );

    const parsed = partnerTeamInvitationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid invitation." },
      { status: 400, headers },
    );

    const existing = await auth.supabase.from("partner_team_invitations")
      .select("id,email,member_role,status,expires_at")
      .eq("partner_id", partner.id)
      .eq("email", parsed.data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing.error?.code === "42P01") return NextResponse.json(
      { error: "Apply SynXis migrations through 047 before inviting managers." },
      { status: 503, headers },
    );
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.member_role !== parsed.data.memberRole) {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email with a different role." },
        { status: 409, headers },
      );
    }

    let invitation = existing.data;
    if (!invitation) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inserted = await auth.supabase.from("partner_team_invitations").insert({
        partner_id: partner.id,
        email: parsed.data.email,
        member_role: parsed.data.memberRole,
        status: "pending",
        created_by: auth.user.id,
        expires_at: expiresAt,
      }).select("id,email,member_role,status,expires_at").single();
      if (inserted.error) throw inserted.error;
      invitation = inserted.data;
    }

    try {
      await queuePartnerTeamInvitation({
        invitationId: invitation.id,
        recipientEmail: invitation.email,
        partnerName: partner.business_name,
        memberRole: invitation.member_role,
      });
    } catch (error) {
      console.error("Partner team invitation email could not be queued", {
        invitationId: invitation.id,
        error,
      });
      return NextResponse.json({
        error: "The invitation was saved but its email could not be queued. Retry to send it.",
        invitationId: invitation.id,
      }, { status: 503, headers });
    }

    return NextResponse.json({
      invitation,
      message: "Manager invitation queued for delivery.",
    }, { status: existing.data ? 200 : 201, headers });
  } catch (error) {
    console.error("Partner team invitation could not be created", error);
    return NextResponse.json(
      { error: "The manager invitation could not be created." },
      { status: 503, headers },
    );
  }
}

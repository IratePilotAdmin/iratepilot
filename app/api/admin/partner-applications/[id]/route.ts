import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const verificationChecklistSchema = z.object({
  propertyVerified: z.literal(true),
  contactAuthorityVerified: z.literal(true),
  contentRightsReviewed: z.literal(true),
  feeDisclosureAcknowledged: z.literal(true),
  inactiveDraftScopeConfirmed: z.literal(true),
}).strict();

const decisionSchema = z.object({
  status: z.enum(["pending", "approved", "declined"]),
  reviewNotes: z.string().trim().min(3).max(2000),
  verificationChecklist: verificationChecklistSchema.optional(),
}).superRefine((value, context) => {
  if (value.status === "approved" && !value.verificationChecklist) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["verificationChecklist"],
      message: "Every administrator verification check is required before approval.",
    });
  }
  if (value.status === "approved" && value.reviewNotes.length < 20) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewNotes"],
      message: "Approval evidence must contain at least 20 characters.",
    });
  }
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid application ID." }, { status: 400 });
  }

  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  }

  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const checklist = parsed.data.verificationChecklist;
    const { data, error } = await auth.supabase.rpc("review_partner_application", {
      p_application_id: id,
      p_status: parsed.data.status,
      p_legal_business_verified: checklist?.propertyVerified === true,
      p_representative_authority_verified: checklist?.contactAuthorityVerified === true,
      p_content_rights_verified: checklist?.contentRightsReviewed === true,
      p_commercial_terms_acknowledgement_verified: checklist?.feeDisclosureAcknowledged === true,
      p_inactive_draft_scope_confirmed: checklist?.inactiveDraftScopeConfirmed === true,
      p_review_notes: parsed.data.reviewNotes,
    });

    if (error) {
      if (error.message.includes("must register with the application email")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes("Complete and verify the hotel intake")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes("Approved partner access must be managed separately")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "The application decision could not be saved." },
      { status: 503 }
    );
  }
}

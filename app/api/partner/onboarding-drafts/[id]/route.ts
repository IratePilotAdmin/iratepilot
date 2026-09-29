import { z } from "zod";
import { getPartnerApplicantContext, partnerJson, partnerOnboardingError, readPartnerJson } from "@/lib/partner/acquisition-api";
import { partnerDraftSaveRequestSchema, partnerOnboardingDraftSchema } from "@/lib/partner/acquisition";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getPartnerApplicantContext(request, true);
    if (context.response) return context.response;
    const id = z.string().uuid().safeParse((await params).id);
    const parsed = partnerDraftSaveRequestSchema.safeParse(await readPartnerJson(request));
    if (!id.success || !parsed.success) return partnerJson({ error: "Check the draft and its details." }, 400);
    const { data, error } = await context.supabase.rpc("save_partner_onboarding_draft", {
      p_draft_id: id.data, p_expected_revision: parsed.data.revision, p_details: parsed.data.details,
    });
    if (error) throw error;
    return partnerJson({ draft: partnerOnboardingDraftSchema.parse(data) });
  } catch (error) { return partnerOnboardingError(error); }
}

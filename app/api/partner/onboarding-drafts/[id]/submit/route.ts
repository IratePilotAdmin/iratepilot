import { z } from "zod";
import { getPartnerApplicantContext, partnerJson, partnerOnboardingError, readPartnerJson } from "@/lib/partner/acquisition-api";
import { partnerDraftSubmitRequestSchema, partnerOnboardingDraftSchema } from "@/lib/partner/acquisition";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getPartnerApplicantContext(request, true);
    if (context.response) return context.response;
    const id = z.string().uuid().safeParse((await params).id);
    const parsed = partnerDraftSubmitRequestSchema.safeParse(await readPartnerJson(request));
    if (!id.success || !parsed.success) return partnerJson({ error: "Check the draft before submitting." }, 400);
    // Completeness, ownership, current disclosure, revision and linkage are checked atomically in SQL.
    const { data, error } = await context.supabase.rpc("submit_partner_onboarding_draft", {
      p_draft_id: id.data, p_expected_revision: parsed.data.revision,
    });
    if (error) throw error;
    return partnerJson({ draft: partnerOnboardingDraftSchema.parse(data) });
  } catch (error) { return partnerOnboardingError(error); }
}

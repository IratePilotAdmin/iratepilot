import { getPartnerApplicantContext, partnerJson, partnerOnboardingError } from "@/lib/partner/acquisition-api";
import { partnerOnboardingDraftSchema } from "@/lib/partner/acquisition";

export async function GET(request: Request) {
  try {
    const context = await getPartnerApplicantContext(request);
    if (context.response) return context.response;
    const { data, error } = await context.supabase.from("partner_onboarding_drafts")
      .select("id,registration_key,registration,details,revision,status,application_id,created_at,updated_at,submitted_at")
      .eq("owner_id", context.user.id).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return partnerJson({ drafts: partnerOnboardingDraftSchema.array().parse(data || []), email: context.email });
  } catch (error) { return partnerOnboardingError(error); }
}

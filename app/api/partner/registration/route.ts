import { getPartnerApplicantContext, partnerJson, partnerOnboardingError, readPartnerJson } from "@/lib/partner/acquisition-api";
import { partnerOnboardingDraftSchema, partnerRegistrationRequestSchema } from "@/lib/partner/acquisition";

export async function POST(request: Request) {
  try {
    const context = await getPartnerApplicantContext(request, true);
    if (context.response) return context.response;
    const parsed = partnerRegistrationRequestSchema.safeParse(await readPartnerJson(request));
    if (!parsed.success) return partnerJson({ error: "Complete the required registration fields." }, 400);
    const { data, error } = await context.supabase.rpc("create_partner_onboarding_draft", {
      p_registration_key: parsed.data.registrationKey,
      p_registration: parsed.data.registration,
    });
    if (error) throw error;
    return partnerJson({ draft: partnerOnboardingDraftSchema.parse(data) }, 201);
  } catch (error) { return partnerOnboardingError(error); }
}

/** Enable only after the matching database gate and applicant access checks pass. */
export function isPartnerSelfServiceEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.PARTNER_SELF_SERVICE_ONBOARDING_ENABLED === "true";
}

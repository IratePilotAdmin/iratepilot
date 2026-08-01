import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerLaunchDashboard } from "@/components/dashboard/partner-launch-dashboard";
import { requireRole } from "@/lib/auth/require-role";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import type { PartnerLaunchProperty } from "@/lib/partner-launch";

export default async function PartnerDashboard() {
  const auth = await requireRole(["partner", "admin"]);
  let businessName: string | null = null;
  let properties: PartnerLaunchProperty[] = [];

  if (!("error" in auth)) {
    const { data: partner } = await auth.supabase.from("partners").select("id,business_name").eq("owner_id", auth.user.id).maybeSingle();
    businessName = partner?.business_name ?? null;
    if (partner) {
      const { data } = await auth.supabase.from("properties")
        .select("active,image_url,amenities,rooms(active,inventory(stay_date,available_units))")
        .eq("partner_id", partner.id);
      properties = (data ?? []).map((property) => ({
        active: property.active,
        readiness: getPropertyReadiness(property as PropertyReadinessInput)
      }));
    }
  }

  return <DashboardShell title="Partner Center" items={partnerNavigation}><PartnerLaunchDashboard businessName={businessName} properties={properties} /></DashboardShell>;
}

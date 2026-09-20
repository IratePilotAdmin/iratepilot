import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
import { PartnerOverview } from "@/components/dashboard/partner-overview";
import { PartnerApplicantDashboard } from "@/components/partner/partner-applicant-dashboard";
import { isPartnerSelfServiceEnabled } from "@/config/partner-acquisition";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PartnerDashboard({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isPartnerSelfServiceEnabled()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=%2Fpartner%2Fdashboard%3Fsetup%3D1");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["customer", "partner", "admin"].includes(profile.role)) redirect("/account");
    const params = await searchParams;
    if (profile.role === "customer" || params.setup === "1") {
      const items = [
        { href: "/partner/dashboard?setup=1", label: "My hotel applications" },
        { href: "/partners/register", label: "Add another property" },
        { href: "/account", label: "My account" },
      ];
      return <DashboardShell title="Partner application" items={items}>
        {user.email && user.email_confirmed_at ? <PartnerApplicantDashboard /> :
          <div className="card p-6" role="status"><h1 className="text-2xl font-semibold">Confirm your email</h1><p className="mt-3">Open the account confirmation link sent to your email, then return here to save your hotel application.</p></div>}
      </DashboardShell>;
    }
  }
  return <DashboardShell title="Partner Center" items={partnerNavigation}><PartnerOverview /></DashboardShell>;
}

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DealsGrid } from "@/components/deals/deals-grid";

export default function DealsPage() {
  return <><SiteHeader /><main className="container-page py-16"><DealsGrid /></main><SiteFooter /></>;
}

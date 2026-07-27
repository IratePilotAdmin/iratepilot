import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TravelAssistant } from "@/components/ai/travel-assistant";

export default function AIPlannerPage() {
  return <><SiteHeader /><main className="container-page py-12"><h1 className="text-3xl font-bold">AI trip planner</h1><p className="mt-2 text-slate-500">Build a premium itinerary in minutes.</p><div className="mt-8"><TravelAssistant /></div></main><SiteFooter /></>;
}
